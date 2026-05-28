import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { MessageDirection, MessageSource, MessageStatus } from '@fintech/shared';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../gateway/events.gateway';
import { WappiService } from './wappi.service';
import { mapMessageDto, normalizeMessageType } from '../common/media.utils';

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
    // В некоторых случаях (например, исходящее API), chatId прилетает прямо в payload.chatId
    // Или же мы вытаскиваем его как обычно через wappiService
    let chatId = this.wappiService.extractChatId(payload);
    if (!chatId && typeof payload.chatId === 'string') {
      chatId = payload.chatId;
    }
    
    // Если всё равно нет chatId, но есть to и from (например для outgoing_message_api)
    if (!chatId && whType.startsWith('outgoing')) {
       chatId = typeof payload.to === 'string' ? payload.to : chatId;
    }
    if (!chatId && whType === 'incoming_message') {
       chatId = typeof payload.from === 'string' ? payload.from : chatId;
    }

    if (!chatId) return;

    // Игнорируем каналы и группы (Telegram ID с минусом, WhatsApp @g.us или @broadcast)
    if (chatId.startsWith('-') || chatId.includes('@g.us') || chatId.includes('@broadcast')) {
      this.logger.debug(`Ignoring channel/group chat: ${chatId}`);
      return;
    }

    // В Wappi chatId часто приходит просто как номер (напр. '1820755' или '79115576368'). 
    // Нормализуем его до стандартного вида WhatsApp (чтобы не дублировать чаты)
    if (!chatId.includes('@')) {
      chatId = `${chatId}@c.us`;
    }

    const direction =
      whType === 'incoming_message'
        ? MessageDirection.INCOMING
        : MessageDirection.OUTGOING;

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

    const conversation = await this.prisma.conversation.upsert({
      where: {
        lineId_wappiChatId: {
          lineId,
          wappiChatId: chatId,
        },
      },
      update: {
        ...updateNameObj,
        lastMessageAt: new Date(),
      },
      create: {
        lineId,
        wappiChatId: chatId,
        contactName: updateNameObj.contactName !== undefined ? updateNameObj.contactName : null,
        contactPhone: chatId.replace('@c.us', '').replace('@s.whatsapp.net', ''),
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

    const messageType = normalizeMessageType(
      typeof payload.type === 'string' ? payload.type : 'text',
    );

    const message = await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        wappiMessageId: typeof payload.id === 'string' ? payload.id : null,
        direction,
        source: MessageSource.WAPPI,
        body: this.wappiService.extractBody(payload),
        type: messageType,
        caption:
          typeof payload.caption === 'string'
            ? payload.caption
            : typeof payload.title === 'string'
              ? payload.title
              : null,
        fileName:
          typeof payload.file_name === 'string' ? payload.file_name : null,
        mimeType:
          typeof payload.mimetype === 'string' ? payload.mimetype : null,
        mediaUrl:
          typeof payload.file_link === 'string'
            ? payload.file_link
            : typeof payload.thumbnail === 'string'
              ? payload.thumbnail
              : typeof payload.picture === 'string'
                ? payload.picture
                : null,
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
