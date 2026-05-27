import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BitrixSendMessageRequest,
  MessageDirection,
  MessageSource,
  MessageStatus,
} from '@fintech/shared';
import { messengerTypeFromString, normalizePhone, formatChatId } from '../common/utils';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../gateway/events.gateway';
import { WappiService } from '../wappi/wappi.service';

@Injectable()
export class BitrixService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wappiService: WappiService,
    private readonly eventsGateway: EventsGateway,
  ) {}

  private formatChatId(messengerType: string, phone: string): string {
    return formatChatId(messengerType, phone);
  }

  async getContactDetails(contactId: string): Promise<{ name: string | null; phone: string | null } | null> {
    const webhookUrl = process.env.BITRIX_WEBHOOK_URL;
    if (!webhookUrl) return null;

    try {
      // Убираем слэш на конце, если он есть, чтобы корректно собрать URL
      const baseUrl = webhookUrl.endsWith('/') ? webhookUrl.slice(0, -1) : webhookUrl;
      const url = `${baseUrl}/crm.contact.get.json?id=${encodeURIComponent(contactId)}`;

      const response = await fetch(url);
      if (!response.ok) return null;

      const data = await response.json() as any;
      const result = data?.result;
      if (!result) return null;

      const nameParts = [result.NAME, result.LAST_NAME].filter(Boolean);
      const name = nameParts.length > 0 ? nameParts.join(' ') : null;

      let phone: string | null = null;
      if (Array.isArray(result.PHONE) && result.PHONE.length > 0) {
        // Try to find WORK phone first, fallback to first available
        const workPhone = result.PHONE.find((p: any) => p.VALUE_TYPE === 'WORK');
        const rawPhone = workPhone ? workPhone.VALUE : result.PHONE[0].VALUE;
        if (typeof rawPhone === 'string') {
          phone = normalizePhone(rawPhone);
        }
      }

      return { name, phone };
    } catch (error) {
      console.error('Failed to fetch contact from Bitrix:', error);
      return null;
    }
  }

  async getAllUsers(): Promise<any[]> {
    const webhookUrl = process.env.BITRIX_WEBHOOK_URL;
    if (!webhookUrl) throw new Error('BITRIX_WEBHOOK_URL is not configured');

    try {
      const baseUrl = webhookUrl.endsWith('/') ? webhookUrl.slice(0, -1) : webhookUrl;
      const url = `${baseUrl}/user.get.json`;

      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const data = await response.json() as any;
      return data?.result || [];
    } catch (error) {
      console.error('Failed to fetch all users from Bitrix:', error);
      throw error;
    }
  }

  async getUserDetails(userId: string): Promise<{ name: string; position: string | null; departmentId: string | null; departmentName: string | null; avatarUrl: string | null } | null> {
    const webhookUrl = process.env.BITRIX_WEBHOOK_URL;
    if (!webhookUrl) return null;

    try {
      const baseUrl = webhookUrl.endsWith('/') ? webhookUrl.slice(0, -1) : webhookUrl;
      const url = `${baseUrl}/user.get.json?ID=${encodeURIComponent(userId)}`;

      const response = await fetch(url);
      if (!response.ok) return null;

      const data = await response.json() as any;
      const result = data?.result?.[0];
      if (!result) return null;

      const nameParts = [result.NAME, result.LAST_NAME].filter(Boolean);
      const name = nameParts.length > 0 ? nameParts.join(' ') : `Bitrix User ${userId}`;
      const position = result.WORK_POSITION || null;
      const avatarUrl = result.PERSONAL_PHOTO || null;
      
      let departmentId: string | null = null;
      let departmentName: string | null = null;

      if (Array.isArray(result.UF_DEPARTMENT) && result.UF_DEPARTMENT.length > 0) {
        departmentId = String(result.UF_DEPARTMENT[0]);
        
        // Try to fetch department name (requires 'department' scope in Bitrix webhook)
        try {
          const depUrl = `${baseUrl}/department.get.json?ID=${encodeURIComponent(departmentId)}`;
          const depResponse = await fetch(depUrl);
          if (depResponse.ok) {
            const depData = await depResponse.json() as any;
            if (depData?.result?.[0]?.NAME) {
              departmentName = depData.result[0].NAME;
            }
          }
        } catch (e) {
          // Ignore department fetch errors (likely insufficient_scope)
        }
      }

      return { name, position, departmentId, departmentName, avatarUrl };
    } catch (error) {
      console.error('Failed to fetch user from Bitrix:', error);
      return null;
    }
  }

  async sendMessage(dto: BitrixSendMessageRequest) {
    const messengerType = messengerTypeFromString(dto.messenger);
    if (!messengerType) {
      throw new BadRequestException('Invalid messenger type');
    }

    const line = dto.line_id
      ? await this.prisma.wappiLine.findUnique({ where: { id: dto.line_id } })
      : await this.prisma.wappiLine.findFirst({
          where: { messengerType },
          orderBy: { createdAt: 'asc' },
        });

    if (!line) {
      throw new NotFoundException('Line not found');
    }

    const chatId = this.formatChatId(line.messengerType, dto.to_phone);

    const conversation = await this.prisma.conversation.upsert({
      where: {
        lineId_wappiChatId: {
          lineId: line.id,
          wappiChatId: chatId,
        },
      },
      update: {
        contactPhone: dto.to_phone,
        bitrixContactId: dto.to_contact_id ?? undefined,
        lastMessageAt: new Date(),
      },
      create: {
        lineId: line.id,
        wappiChatId: chatId,
        contactPhone: dto.to_phone,
        bitrixContactId: dto.to_contact_id ?? null,
      },
    });

    let senderUserId: string | undefined;
    if (dto.from_user_id) {
      const sender = await this.prisma.user.findFirst({
        where: { bitrixUserId: dto.from_user_id },
      });
      senderUserId = sender?.id;
    }

    const message = await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: MessageDirection.OUTGOING,
        source: MessageSource.BITRIX,
        body: dto.text,
        type: 'text',
        status: MessageStatus.PENDING,
        senderUserId,
      },
    });

    const wappiResult = await this.wappiService.sendText(line, chatId, dto.text);

    const updated = await this.prisma.message.update({
      where: { id: message.id },
      data: {
        status: MessageStatus.DELIVERED,
        wappiMessageId: wappiResult.messageId,
        rawPayload: wappiResult.raw,
      },
    });

    const payload = {
      id: updated.id,
      conversationId: updated.conversationId,
      direction: updated.direction,
      source: updated.source,
      body: updated.body,
      type: updated.type,
      status: updated.status,
      createdAt: updated.createdAt.toISOString(),
    };

    this.eventsGateway.emitNewMessage(line.id, payload);

    return {
      success: true,
      message_id: updated.id,
      conversation_id: conversation.id,
      wappi_task_id: wappiResult.messageId,
    };
  }
}
