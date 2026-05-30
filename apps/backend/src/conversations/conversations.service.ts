import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MessengerType, StartConversationRequest } from '@fintech/shared';
import { AccessService } from '../common/access.service';
import { messagePreviewLabel } from '../common/media.utils';
import { JwtPayload } from '../common/guards';
import { sanitizeStoredContactPhone } from '../common/contact-phone.utils';
import { formatChatId, phonesMatch } from '../common/utils';
import { MessagesService } from '../messages/messages.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessService: AccessService,
    private readonly messagesService: MessagesService,
  ) {}

  private toDto(
    conversation: {
      id: string;
      lineId: string;
      wappiChatId: string;
      contactName: string | null;
      contactPhone: string | null;
      bitrixContactId: string | null;
      lastMessageAt: Date;
      line: { name: string; messengerType: string; wappiProfileId: string };
    },
    lastMessagePreview?: string | null,
  ) {
    return {
      id: conversation.id,
      lineId: conversation.lineId,
      lineName: conversation.line.name,
      messengerType: conversation.line.messengerType as MessengerType,
      wappiChatId: conversation.wappiChatId,
      contactName: conversation.contactName,
      contactPhone: sanitizeStoredContactPhone(
        conversation.contactPhone,
        conversation.line.wappiProfileId,
        conversation.wappiChatId,
        conversation.line.messengerType,
      ),
      bitrixContactId: conversation.bitrixContactId,
      lastMessageAt: conversation.lastMessageAt.toISOString(),
      lastMessagePreview: lastMessagePreview ?? null,
    };
  }

  async findAll(
    user: JwtPayload,
    filters: {
      messenger?: MessengerType;
      contactId?: string;
      contactPhone?: string;
      lineId?: string;
    },
  ) {
    const allowedLineIds = await this.accessService.getAllowedLineIds(user);
    const lineFilter =
      allowedLineIds === 'all' ? {} : { lineId: { in: allowedLineIds } };

    const conversations = await this.prisma.conversation.findMany({
      where: {
        ...lineFilter,
        messages: { some: {} },
        ...(filters.lineId ? { lineId: filters.lineId } : {}),
        ...(filters.messenger
          ? { line: { messengerType: filters.messenger } }
          : {}),
      },
      include: {
        line: true,
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { lastMessageAt: 'desc' },
    });

    const filtered = conversations.filter((item) => {
      if (!filters.contactId && !filters.contactPhone) {
        return true;
      }
      if (filters.contactId && item.bitrixContactId === filters.contactId) {
        return true;
      }
      if (filters.contactPhone && phonesMatch(item.contactPhone, filters.contactPhone)) {
        return true;
      }
      return false;
    });

    return filtered.map((conversation) => {
      const last = conversation.messages[0];
      return this.toDto(
        conversation,
        last ? messagePreviewLabel(last) : null,
      );
    });
  }

  private async upsertConversation(
    user: JwtPayload,
    dto: StartConversationRequest,
  ) {
    const line = await this.prisma.wappiLine.findUnique({
      where: { id: dto.lineId },
      include: { group: true },
    });

    if (!line) {
      throw new NotFoundException('Line not found');
    }

    const allowed = await this.accessService.canAccessLine(user, line.id);
    if (!allowed) {
      throw new ForbiddenException('Access denied');
    }

    const wappiChatId = formatChatId(line.messengerType, dto.contactPhone);

    return this.prisma.conversation.upsert({
      where: {
        lineId_wappiChatId: {
          lineId: line.id,
          wappiChatId,
        },
      },
      update: {
        contactName: dto.contactName ?? undefined,
        contactPhone: dto.contactPhone,
        bitrixContactId: dto.bitrixContactId ?? undefined,
        lastMessageAt: new Date(),
      },
      create: {
        lineId: line.id,
        wappiChatId,
        contactName: dto.contactName ?? null,
        contactPhone: dto.contactPhone,
        bitrixContactId: dto.bitrixContactId ?? null,
      },
      include: { line: true },
    });
  }

  async startConversation(user: JwtPayload, dto: StartConversationRequest) {
    if (!dto.contactPhone?.trim()) {
      throw new BadRequestException('contactPhone is required');
    }

    const conversation = await this.upsertConversation(user, dto);

    if (!dto.text?.trim()) {
      return {
        conversation: this.toDto(conversation),
      };
    }

    const message = await this.messagesService.sendFromPanel(user, conversation.id, {
      text: dto.text.trim(),
    });

    return {
      conversation: this.toDto(conversation, messagePreviewLabel(message)),
      message,
    };
  }

  async findOne(user: JwtPayload, id: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
      include: { line: true },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const allowed = await this.accessService.canAccessLine(user, conversation.lineId);
    if (!allowed) {
      throw new ForbiddenException('Access denied');
    }

    return this.toDto(conversation);
  }
}
