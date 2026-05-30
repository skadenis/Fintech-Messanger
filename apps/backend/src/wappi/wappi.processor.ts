import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { MessageDirection, MessageSource, MessageStatus } from '@fintech/shared';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../gateway/events.gateway';
import { WappiService } from './wappi.service';
import { mapMessageDto, parseMediaFromPayload } from '../common/media.utils';
import {
  isExcludedPhone,
  resolveContactPhone,
  resolveLineOwnerPhoneFromPayload,
  resolvePhoneFromMessageBodies,
} from '../common/contact-phone.utils';
import {
  buildMaxContactGetAttempts,
  parseWappiContactResponse,
  buildContactGetParams,
  isMaxBotChat,
  isMaxFavoritesDialog,
  normalizeWappiChatId,
  parseMaxContactNameUserId,
  resolveMaxPeerUserIdFromMessages,
} from '../common/wappi-contact.utils';

import { BitrixService } from '../bitrix/bitrix.service';

export interface WappiEventJobData {
  lineId: string;
  payload: Record<string, any>;
}

@Processor('wappi-events')
export class WappiProcessor extends WorkerHost {
  private readonly logger = new Logger(WappiProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wappiService: WappiService,
    private readonly eventsGateway: EventsGateway,
    private readonly bitrixService: BitrixService,
  ) {
    super();
  }

  async process(job: Job<WappiEventJobData, any, string>): Promise<any> {
    const { lineId, payload } = job.data;
    const whType = String(payload.wh_type ?? '');

    try {
      this.logger.debug(`Processing event ${whType} for line ${lineId}`);

      switch (whType) {
        case 'authorization_status':
        case 'application_status':
          await this.handleLineStatus(lineId, payload);
          break;
        case 'delivery_status':
          await this.handleDeliveryStatus(payload);
          break;
        case 'incoming_message':
        case 'outgoing_message_api':
        case 'outgoing_message_phone':
          await this.handleMessage(lineId, whType, payload);
          break;
        case 'incoming_call':
          await this.handleIncomingCall(lineId, payload);
          break;
        default:
          this.logger.warn(`Unknown or unhandled webhook type: ${whType}`);
      }
    } catch (error) {
      this.logger.error(`Failed to process event ${whType} for line ${lineId}`, error);
      throw error;
    }
  }

  private async handleLineStatus(lineId: string, payload: Record<string, any>) {
    await this.prisma.wappiLine.update({
      where: { id: lineId },
      data: { status: String(payload.status ?? 'offline') },
    });
  }

  private async handleDeliveryStatus(payload: Record<string, any>) {
    const wappiMessageId = String(payload.id ?? '');
    if (wappiMessageId) {
      // Добавим маппинг всех статусов, которые есть в Wappi: pending, delivered, read, undelivered, temporary ban, error.
      let mappedStatus = MessageStatus.DELIVERED;
      const rawStatus = String(payload.status ?? '').toLowerCase();
      
      if (rawStatus === 'read') mappedStatus = MessageStatus.READ;
      else if (rawStatus === 'delivered') mappedStatus = MessageStatus.DELIVERED;
      else if (rawStatus === 'undelivered' || rawStatus === 'error' || rawStatus === 'temporary ban') mappedStatus = MessageStatus.ERROR;
      else if (rawStatus === 'pending') mappedStatus = MessageStatus.PENDING;

      await this.prisma.message.updateMany({
        where: { wappiMessageId },
        data: {
          status: mappedStatus,
        },
      });
    }
  }

  private async handleMessage(lineId: string, whType: string, payload: Record<string, any>) {
    const line = await this.prisma.wappiLine.findUnique({ where: { id: lineId } });
    if (!line) return;

    let chatId = this.wappiService.extractChatId(payload);
    if (!chatId && typeof payload.chatId === 'string') {
      chatId = payload.chatId;
    }

    if (!chatId && whType.startsWith('outgoing')) {
      chatId = typeof payload.to === 'string' ? payload.to : chatId;
    }
    // MAX: never use `from` as chat id on incoming — it is often the peer phone.
    if (
      !chatId &&
      whType === 'incoming_message' &&
      line.messengerType !== 'MAX' &&
      typeof payload.from === 'string'
    ) {
      chatId = payload.from;
    }

    if (!chatId) return;

    chatId = normalizeWappiChatId(chatId, line.messengerType);

    // Игнорируем каналы и группы (Telegram ID с минусом, WhatsApp @g.us или @broadcast)
    if (chatId.startsWith('-') || chatId.includes('@g.us') || chatId.includes('@broadcast')) {
      this.logger.debug(`Ignoring channel/group chat: ${chatId}`);
      return;
    }

    if (
      line.messengerType === 'MAX' &&
      (isMaxBotChat([payload]) || isMaxFavoritesDialog(chatId))
    ) {
      this.logger.debug(`Ignoring MAX bot/system/favorites chat: ${chatId}`);
      return;
    }

    const direction =
      whType === 'incoming_message'
        ? MessageDirection.INCOMING
        : MessageDirection.OUTGOING;

    const linePhones = (() => {
      const fromPayload = resolveLineOwnerPhoneFromPayload(payload, direction);
      return fromPayload ? [fromPayload] : [];
    })();

    let contactName = typeof payload.contact_name === 'string' && payload.contact_name
            ? payload.contact_name
            : typeof payload.senderName === 'string' && payload.senderName
              ? payload.senderName
              : null;

    let updateNameObj: any = {};
    if (contactName) {
      if (contactName.startsWith('Contact ')) {
        updateNameObj = { contactName: null };
      } else {
        updateNameObj = { contactName };
      }
    }

    const existingConversation = await this.prisma.conversation.findUnique({
      where: { lineId_wappiChatId: { lineId, wappiChatId: chatId } },
      select: { contactPhone: true, contactName: true, bitrixContactId: true },
    });

    let updateObj: Record<string, unknown> = { ...updateNameObj };
    let contactPhone: string | null = existingConversation?.contactPhone ?? null;
    let bitrixContactId: string | null = existingConversation?.bitrixContactId ?? null;

    const needsContactFetch =
      !existingConversation?.contactName ||
      !contactPhone ||
      isExcludedPhone(contactPhone, linePhones);

    const skipMaxBotContact =
      line.messengerType === 'MAX' && isMaxBotChat([payload]);

    if (needsContactFetch && !skipMaxBotContact) {
      try {
        const phoneFromPayload = resolveContactPhone({
          excludedPhones: linePhones,
          chatId,
          direction,
          payload,
          messengerType: line.messengerType,
        });
        const hintPhone =
          phoneFromPayload ??
          (line.messengerType === 'MAX'
            ? resolvePhoneFromMessageBodies([payload], linePhones)
            : null) ??
          (typeof payload.contact_phone === 'string'
            ? payload.contact_phone
            : undefined);

        const peerUserId =
          line.messengerType === 'MAX' && direction === MessageDirection.INCOMING
            ? resolveMaxPeerUserIdFromMessages([payload], linePhones)
            : null;
        const contactNameUserId =
          line.messengerType === 'MAX'
            ? parseMaxContactNameUserId(
                typeof payload.contact_name === 'string'
                  ? payload.contact_name
                  : null,
              )
            : null;

        let contactResponse: Record<string, unknown> | null = null;

        if (line.messengerType === 'MAX') {
          const attempts = buildMaxContactGetAttempts(
            hintPhone,
            [peerUserId, contactNameUserId],
            linePhones,
          );
          for (const params of attempts) {
            contactResponse = await this.wappiService.getContact(line, params);
            if (contactResponse) break;
          }
        } else {
          const contactParams = buildContactGetParams(
            chatId,
            line.messengerType,
            hintPhone,
            linePhones,
          );
          if (!contactParams.recipient && !contactParams.phone) {
            throw new Error('No recipient or phone for getContact');
          }
          contactResponse = await this.wappiService.getContact(
            line,
            contactParams,
          );
        }
        if (contactResponse) {
          const parsed = parseWappiContactResponse(
            contactResponse,
            linePhones,
            line.messengerType,
          );

          if (parsed.contactName) {
            updateObj.contactName = parsed.contactName;
          }
          if (parsed.contactPhone) {
            contactPhone = parsed.contactPhone;
            updateObj.contactPhone = contactPhone;
            if (!bitrixContactId) {
              bitrixContactId =
                await this.bitrixService.findContactByPhone(contactPhone);
              if (bitrixContactId) {
                updateObj.bitrixContactId = bitrixContactId;
              }
            }
          }
        }
      } catch (err) {
        this.logger.debug(`getContact failed for ${chatId}: ${err}`);
      }
    }

    if (!contactPhone || isExcludedPhone(contactPhone, linePhones)) {
      const fromPayload = resolveContactPhone({
        excludedPhones: linePhones,
        chatId,
        direction,
        payload,
        messengerType: line.messengerType,
      });
      if (fromPayload) {
        contactPhone = fromPayload;
        updateObj.contactPhone = contactPhone;
        if (!bitrixContactId) {
          bitrixContactId = await this.bitrixService.findContactByPhone(contactPhone);
          if (bitrixContactId) {
            updateObj.bitrixContactId = bitrixContactId;
          }
        }
      }
    }

    let msgTime = payload.time || Date.now();
    if (typeof msgTime === 'number' && msgTime < 10000000000) {
      msgTime = msgTime * 1000;
    }

    const conversation = await this.prisma.conversation.upsert({
      where: {
        lineId_wappiChatId: {
          lineId,
          wappiChatId: chatId,
        },
      },
      update: {
        ...updateObj,
        lastMessageAt: new Date(msgTime),
      },
      create: {
        lineId,
        wappiChatId: chatId,
        contactName: updateNameObj.contactName !== undefined ? updateNameObj.contactName : null,
        contactPhone: contactPhone,
        bitrixContactId,
        lastMessageAt: new Date(msgTime),
      },
    });

    // Обрабатываем реакции
    if (payload.type === 'reaction') {
      const stanzaId = typeof payload.stanza_id === 'string' ? payload.stanza_id : null;
      const emoji = typeof payload.body === 'string' ? payload.body : null;
      
      if (stanzaId && emoji) {
        const updatedMessage = await this.prisma.message.updateMany({
          where: { wappiMessageId: stanzaId },
          data: { reaction: emoji },
        });
        
        if (updatedMessage.count > 0) {
          // Нам нужно получить обновленное сообщение, чтобы отправить его по сокетам
          const msg = await this.prisma.message.findFirst({
            where: { wappiMessageId: stanzaId },
            include: { senderUser: true },
          });
          if (msg) {
            this.eventsGateway.emitNewMessage(lineId, mapMessageDto(msg));
          }
        }
      }
      return;
    }

    // Игнорируем системные сообщения
    if (payload.type === 'system') {
      this.logger.debug(`Ignoring message with type ${payload.type}`);
      return;
    }

    const parsedMedia = parseMediaFromPayload(payload);
    const messageType = parsedMedia.type;
    let body = parsedMedia.body ?? this.wappiService.extractBody(payload);
    let caption = parsedMedia.caption;

    if (messageType !== 'text' && body && !caption) {
      caption = body;
      body = null;
    }

    const message = await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        wappiMessageId: typeof payload.id === 'string' ? payload.id : null,
        direction,
        source: MessageSource.WAPPI,
        body,
        type: messageType,
        caption,
        fileName: parsedMedia.fileName,
        mimeType: parsedMedia.mimeType,
        mediaUrl: parsedMedia.mediaUrl,
        status: MessageStatus.DELIVERED,
        rawPayload: payload as object,
      },
      include: { senderUser: true },
    });

    this.eventsGateway.emitNewMessage(
      lineId,
      mapMessageDto(message),
    );
  }

  private async handleIncomingCall(lineId: string, payload: Record<string, any>) {
    this.logger.debug(`Incoming call received on line ${lineId}`, payload);
    // You can implement custom logic here if you want to notify frontend or save to DB.
  }
}
