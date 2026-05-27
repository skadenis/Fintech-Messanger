import { Body, Controller, Param, Post } from '@nestjs/common';
import {
  MessageDirection,
  MessageSource,
  MessageStatus,
} from '@fintech/shared';
import { mapMessageDto, normalizeMessageType } from '../common/media.utils';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../gateway/events.gateway';
import { WappiService } from './wappi.service';

@Controller('webhooks/wappi')
export class WappiWebhookController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wappiService: WappiService,
    private readonly eventsGateway: EventsGateway,
  ) {}

  @Post(':lineId')
  async handleWebhook(@Param('lineId') lineId: string, @Body() body: unknown) {
    const line = await this.prisma.wappiLine.findUnique({ where: { id: lineId } });
    if (!line) {
      return { ok: false, reason: 'line not found' };
    }

    const messages = Array.isArray((body as { messages?: unknown[] })?.messages)
      ? (body as { messages: Record<string, unknown>[] }).messages
      : [(body as { messages?: Record<string, unknown> }).messages ?? body].filter(Boolean);

    for (const payload of messages as Record<string, unknown>[]) {
      const whType = String(payload.wh_type ?? '');

      if (whType === 'authorization_status' || whType === 'application_status') {
        await this.prisma.wappiLine.update({
          where: { id: lineId },
          data: { status: String(payload.status ?? 'offline') },
        });
        continue;
      }

      if (whType === 'delivery_status') {
        const wappiMessageId = String(payload.id ?? '');
        if (wappiMessageId) {
          await this.prisma.message.updateMany({
            where: { wappiMessageId },
            data: {
              status:
                String(payload.status ?? '').toUpperCase() === 'READ'
                  ? MessageStatus.READ
                  : MessageStatus.DELIVERED,
            },
          });
        }
        continue;
      }

      if (
        whType !== 'incoming_message' &&
        whType !== 'outgoing_message_api' &&
        whType !== 'outgoing_message_phone'
      ) {
        continue;
      }

      const chatId = this.wappiService.extractChatId(payload);
      if (!chatId) continue;

      const direction =
        whType === 'incoming_message'
          ? MessageDirection.INCOMING
          : MessageDirection.OUTGOING;

      const conversation = await this.prisma.conversation.upsert({
        where: {
          lineId_wappiChatId: {
            lineId,
            wappiChatId: chatId,
          },
        },
        update: {
          contactName:
            typeof payload.contact_name === 'string'
              ? payload.contact_name
              : typeof payload.senderName === 'string'
                ? payload.senderName
                : undefined,
          lastMessageAt: new Date(),
        },
        create: {
          lineId,
          wappiChatId: chatId,
          contactName:
            typeof payload.contact_name === 'string'
              ? payload.contact_name
              : typeof payload.senderName === 'string'
                ? payload.senderName
                : null,
          contactPhone: chatId.replace('@c.us', '').replace('@s.whatsapp.net', ''),
        },
      });

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

    return { ok: true };
  }
}
