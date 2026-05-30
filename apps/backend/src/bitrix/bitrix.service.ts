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
import {
  formatChatId,
  messengerTypeFromString,
  normalizePhone,
  phonesMatch,
} from '../common/utils';
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

  private getWebhookBaseUrl(): string | null {
    const webhookUrl = process.env.BITRIX_WEBHOOK_URL;
    if (!webhookUrl) return null;
    return webhookUrl.endsWith('/') ? webhookUrl.slice(0, -1) : webhookUrl;
  }

  /**
   * В Битрикс телефоны хранятся только цифрами без «+»:
   * +7 (905) 518-58-34 → 79055185834
   */
  private phoneSearchVariants(phone: string): string[] {
    const digits = normalizePhone(phone);
    if (!digits) return [];

    const variants = [digits];

    // Запасной вариант: иногда встречается 8XXXXXXXXXX вместо 7XXXXXXXXXX
    if (digits.startsWith('7') && digits.length === 11) {
      variants.push(`8${digits.slice(1)}`);
    }

    return variants;
  }

  private extractPhonesFromContact(contact: Record<string, unknown>): string[] {
    const phoneField = contact.PHONE;
    if (!Array.isArray(phoneField)) return [];

    return phoneField
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null;
        const value = (entry as { VALUE?: unknown }).VALUE;
        return typeof value === 'string' ? normalizePhone(value) : null;
      })
      .filter((value): value is string => Boolean(value));
  }

  private async listContactsByPhone(
    baseUrl: string,
    phoneFilter: string,
  ): Promise<Record<string, unknown>[]> {
    const url = `${baseUrl}/crm.contact.list.json`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        filter: { PHONE: phoneFilter },
        select: ['ID', 'PHONE'],
      }),
    });

    if (!response.ok) return [];

    const data = (await response.json()) as { result?: unknown };
    return Array.isArray(data?.result)
      ? (data.result as Record<string, unknown>[])
      : [];
  }

  async getContactDetails(contactId: string): Promise<{ name: string | null; phone: string | null } | null> {
    const baseUrl = this.getWebhookBaseUrl();
    if (!baseUrl) return null;

    try {
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

  async findContactByPhone(phone: string): Promise<string | null> {
    const baseUrl = this.getWebhookBaseUrl();
    if (!baseUrl) return null;

    const targetPhone = normalizePhone(phone);
    if (!targetPhone) return null;

    try {
      for (const variant of this.phoneSearchVariants(targetPhone)) {
        const contacts = await this.listContactsByPhone(baseUrl, variant);
        for (const contact of contacts) {
          const contactPhones = this.extractPhonesFromContact(contact);
          const matches = contactPhones.some((stored) =>
            phonesMatch(stored, targetPhone),
          );
          if (!matches) continue;

          const id = contact.ID;
          if (id !== undefined && id !== null) {
            return String(id);
          }
        }
      }

      return null;
    } catch (error) {
      console.error('Failed to find contact by phone via crm.contact.list:', error);
      return null;
    }
  }

  async getAllUsers(): Promise<any[]> {
    const baseUrl = this.getWebhookBaseUrl();
    if (!baseUrl) throw new Error('BITRIX_WEBHOOK_URL is not configured');

    try {
      let allUsers: any[] = [];
      let start = 0;
      let hasMore = true;

      while (hasMore) {
        const url = `${baseUrl}/user.get.json?start=${start}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const data = await response.json() as any;
        const users = data?.result || [];
        allUsers = allUsers.concat(users);

        if (data?.next) {
          start = data.next;
        } else {
          hasMore = false;
        }
      }

      return allUsers;
    } catch (error) {
      console.error('Failed to fetch all users from Bitrix:', error);
      throw error;
    }
  }

  async getUserDetails(userId: string): Promise<{ name: string; position: string | null; departmentId: string | null; departmentName: string | null; avatarUrl: string | null } | null> {
    const baseUrl = this.getWebhookBaseUrl();
    if (!baseUrl) return null;

    try {
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
