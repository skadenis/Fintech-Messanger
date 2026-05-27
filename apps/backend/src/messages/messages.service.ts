import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { createReadStream, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  MessageDirection,
  MessageSource,
  MessageStatus,
  SendMessageRequest,
} from '@fintech/shared';
import { AccessService } from '../common/access.service';
import { mapMessageDto } from '../common/media.utils';
import { JwtPayload } from '../common/guards';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../gateway/events.gateway';
import { WappiService } from '../wappi/wappi.service';

const UPLOADS_DIR = join(process.cwd(), 'uploads');

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessService: AccessService,
    private readonly wappiService: WappiService,
    private readonly eventsGateway: EventsGateway,
  ) {
    if (!existsSync(UPLOADS_DIR)) {
      mkdirSync(UPLOADS_DIR, { recursive: true });
    }
  }

  private async getConversationForUser(user: JwtPayload, conversationId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { line: true },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const allowed = await this.accessService.canAccessLine(user, conversation.lineId);
    if (!allowed) {
      throw new ForbiddenException('Access denied');
    }

    return conversation;
  }

  private emitMessage(lineId: string, message: ReturnType<typeof mapMessageDto>) {
    this.eventsGateway.emitNewMessage(lineId, message);
    return message;
  }

  async findByConversation(user: JwtPayload, conversationId: string, limit: number = 50, cursor?: string) {
    await this.getConversationForUser(user, conversationId);

    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      include: { senderUser: true },
      orderBy: { createdAt: 'desc' }, // Order by desc to get latest first
      take: limit + 1, // Take one extra to check if there are more
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = messages.length > limit;
    if (hasMore) {
      messages.pop(); // Remove the extra item
    }

    return {
      messages: messages.map((message) => mapMessageDto(message)),
      hasMore,
      nextCursor: messages.length > 0 ? messages[messages.length - 1].id : null, // The oldest message in this batch is the next cursor
    };
  }

  async sendFromPanel(
    user: JwtPayload,
    conversationId: string,
    dto: SendMessageRequest,
  ) {
    const conversation = await this.getConversationForUser(user, conversationId);
    const dbUser = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.sub },
    });

    const message = await this.prisma.message.create({
      data: {
        conversationId,
        direction: MessageDirection.OUTGOING,
        source: MessageSource.PANEL,
        body: dto.text,
        type: 'text',
        status: MessageStatus.PENDING,
        senderUserId: dbUser.id,
      },
      include: { senderUser: true },
    });

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date() },
    });

    try {
      // For demo lines, mock the Wappi response instead of throwing an error
      let wappiResult;
      if (conversation.line.wappiApiToken === 'demo-token') {
        wappiResult = {
          messageId: `demo-msg-${Date.now()}`,
          raw: { status: 'demo-success' },
        };
        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 500));
      } else {
        wappiResult = await this.wappiService.sendText(
          conversation.line,
          conversation.wappiChatId,
          dto.text,
        );
      }

      const updated = await this.prisma.message.update({
        where: { id: message.id },
        data: {
          status: MessageStatus.DELIVERED,
          wappiMessageId: wappiResult.messageId,
          rawPayload: wappiResult.raw as object,
        },
        include: { senderUser: true },
      });

      return this.emitMessage(conversation.lineId, mapMessageDto(updated));
    } catch (error) {
      await this.prisma.message.update({
        where: { id: message.id },
        data: { status: MessageStatus.ERROR },
      });
      throw error;
    }
  }

  async sendFileFromPanel(
    user: JwtPayload,
    conversationId: string,
    file: Express.Multer.File,
    caption?: string,
  ) {
    const conversation = await this.getConversationForUser(user, conversationId);
    const dbUser = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.sub },
    });

    const fileBase64 = file.buffer.toString('base64');
    const messageType = this.wappiService.detectOutgoingType(
      file.mimetype,
      file.originalname,
    );

    const message = await this.prisma.message.create({
      data: {
        conversationId,
        direction: MessageDirection.OUTGOING,
        source: MessageSource.PANEL,
        body: caption ?? file.originalname,
        caption: caption ?? null,
        fileName: file.originalname,
        mimeType: file.mimetype,
        type: messageType,
        status: MessageStatus.PENDING,
        senderUserId: dbUser.id,
      },
      include: { senderUser: true },
    });

    const storedPath = join(UPLOADS_DIR, message.id);
    writeFileSync(storedPath, file.buffer);

    await this.prisma.message.update({
      where: { id: message.id },
      data: { mediaUrl: `local://${message.id}` },
    });

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date() },
    });

    try {
      // For demo lines, mock the Wappi response instead of throwing an error
      let wappiResult;
      if (conversation.line.wappiApiToken === 'demo-token') {
        wappiResult = {
          messageId: `demo-file-${Date.now()}`,
          raw: { status: 'demo-success' },
        };
        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 800));
      } else {
        wappiResult = await this.wappiService.sendDocument(
          conversation.line,
          conversation.wappiChatId,
          fileBase64,
          file.originalname,
          caption,
        );
      }

      const updated = await this.prisma.message.update({
        where: { id: message.id },
        data: {
          status: MessageStatus.DELIVERED,
          wappiMessageId: wappiResult.messageId,
          rawPayload: wappiResult.raw as object,
        },
        include: { senderUser: true },
      });

      return this.emitMessage(conversation.lineId, mapMessageDto(updated));
    } catch {
      const updated = await this.prisma.message.update({
        where: { id: message.id },
        data: { status: MessageStatus.ERROR },
        include: { senderUser: true },
      });

      return this.emitMessage(conversation.lineId, mapMessageDto(updated));
    }
  }

  async getAttachment(user: JwtPayload, messageId: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: { conversation: { include: { line: true } } },
    });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    const allowed = await this.accessService.canAccessLine(
      user,
      message.conversation.lineId,
    );
    if (!allowed) {
      throw new ForbiddenException('Access denied');
    }

    if (message.mediaUrl?.startsWith('local://')) {
      const storedPath = join(UPLOADS_DIR, message.id);
      if (!existsSync(storedPath)) {
        throw new NotFoundException('Attachment not found');
      }

      return new StreamableFile(createReadStream(storedPath), {
        type: message.mimeType ?? 'application/octet-stream',
        disposition: `inline; filename="${message.fileName ?? 'file'}"`,
      });
    }

    const payload = (message.rawPayload ?? {}) as Record<string, unknown>;
    const body = typeof payload.body === 'string' ? payload.body : null;
    const mimeType =
      message.mimeType ??
      (typeof payload.mimetype === 'string' ? payload.mimetype : 'application/octet-stream');

    if (body && body.length > 100) {
      const buffer = Buffer.from(body, 'base64');
      return new StreamableFile(buffer, {
        type: mimeType,
        disposition: `inline; filename="${message.fileName ?? 'file'}"`,
      });
    }

    if (message.mediaUrl?.startsWith('http')) {
      const response = await fetch(message.mediaUrl);
      if (!response.ok) {
        throw new NotFoundException('Attachment not found');
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      return new StreamableFile(buffer, {
        type: mimeType,
        disposition: `inline; filename="${message.fileName ?? 'file'}"`,
      });
    }

    throw new NotFoundException('Attachment not found');
  }
}
