import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import {
  AssignLinesRequest,
  CreateGroupRequest,
  UpdateGroupRequest,
  CreateLineRequest,
  UpdateLineRequest,
  CreateUserRequest,
  UpdateUserRequest,
  Role,
} from '@fintech/shared';
import { JwtPayload } from '../common/guards';
import { PrismaService } from '../prisma/prisma.service';
import { BitrixService } from '../bitrix/bitrix.service';
import { WappiService } from '../wappi/wappi.service';
import { MessageDirection, MessageSource, MessageStatus } from '@fintech/shared';
import {
  isMediaMessageType,
  isWappiMediaPlaceholder,
  messagePreviewLabel,
  parseMediaFromPayload,
} from '../common/media.utils';
import { runPool } from '../common/async-pool';
import {
  detectLinePhonesFromMessages,
  resolveContactPhoneFromMessages,
  resolvePhoneFromMessageBodies,
  sanitizeStoredContactPhone,
} from '../common/contact-phone.utils';
import {
  buildMaxContactGetAttempts,
  isGroupOrChannelChat,
  isMaxBotChat,
  isMaxFavoritesDialog,
  normalizeWappiChatId,
  parseWappiContactResponse,
  resolveMaxContactNameUserIdFromMessages,
  resolveMaxPeerUserIdFromDialogParticipants,
  resolveMaxPeerUserIdFromMessages,
  dedupeWappiDialogs,
  readChatLastMessageTime,
  readContactAvatarFromChat,
  readPhoneFromChatMetadata,
  wappiMessageChatIdCandidates,
} from '../common/wappi-contact.utils';
import { WappiLine } from '@prisma/client';
import { isWappiHttpLogEnabled } from '../wappi/wappi-http-log.utils';
import { WappiHttpFileLoggerService } from '../wappi/wappi-http-file-logger.service';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bitrixService: BitrixService,
    private readonly wappiService: WappiService,
    private readonly wappiHttpFileLog: WappiHttpFileLoggerService,
  ) {}

  private assertAdmin(user: JwtPayload) {
    if (user.role === Role.OPERATOR) {
      throw new ForbiddenException('Access denied');
    }
  }

  private groupScope(user: JwtPayload) {
    if (user.role === Role.SUPER_ADMIN) return {};
    if (user.groupId) return { id: user.groupId };
    return { id: '__none__' };
  }

  async listGroups(user: JwtPayload) {
    this.assertAdmin(user);
    return this.prisma.group.findMany({
      where: this.groupScope(user),
      include: {
        users: {
          select: { id: true, name: true, email: true, role: true, avatarUrl: true }
        },
        _count: {
          select: { lines: true }
        }
      },
      orderBy: { name: 'asc' },
    });
  }

  async createGroup(user: JwtPayload, dto: CreateGroupRequest) {
    if (user.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenException('Only super admin can create groups');
    }
    return this.prisma.group.create({ data: dto });
  }

  async updateGroup(user: JwtPayload, id: string, dto: UpdateGroupRequest) {
    if (user.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenException('Only super admin can update groups');
    }
    return this.prisma.group.update({
      where: { id },
      data: dto,
    });
  }

  async deleteGroup(user: JwtPayload, id: string) {
    if (user.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenException('Only super admin can delete groups');
    }
    
    // Check if group has lines
    const group = await this.prisma.group.findUnique({
      where: { id },
      include: { _count: { select: { lines: true } } }
    });

    if (!group) throw new NotFoundException('Group not found');
    if (group._count.lines > 0) {
      throw new BadRequestException('Cannot delete group that has assigned lines. Please reassign or delete the lines first.');
    }

    // Remove users from group
    await this.prisma.user.updateMany({
      where: { groupId: id },
      data: { groupId: null }
    });

    await this.prisma.group.delete({ where: { id } });
    return { success: true };
  }

  async removeUserFromGroup(user: JwtPayload, groupId: string, userId: string) {
    if (user.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenException('Only super admin can remove users from group');
    }
    
    const targetUser = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!targetUser) throw new NotFoundException('User not found');
    if (targetUser.groupId !== groupId) throw new BadRequestException('User is not in this group');

    await this.prisma.user.update({
      where: { id: userId },
      data: { groupId: null }
    });

    return { success: true };
  }

  async listUsers(user: JwtPayload) {
    this.assertAdmin(user);
    const where =
      user.role === Role.SUPER_ADMIN
        ? {}
        : user.groupId
          ? { groupId: user.groupId }
          : { id: '__none__' };

    const users = await this.prisma.user.findMany({
      where,
      include: {
        group: true,
        lineAssignments: { include: { line: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return users.map((item) => ({
      id: item.id,
      name: item.name,
      email: item.email,
      role: item.role,
      groupId: item.groupId,
      groupName: item.group?.name ?? null,
      avatarUrl: item.avatarUrl ?? null,
      bitrixUserId: item.bitrixUserId,
      bitrixPortalId: item.bitrixPortalId,
      lines: item.lineAssignments.map((assignment) => ({
        id: assignment.line.id,
        name: assignment.line.name,
        messengerType: assignment.line.messengerType,
      })),
    }));
  }

  async createUser(user: JwtPayload, dto: CreateUserRequest) {
    this.assertAdmin(user);

    if (user.role === Role.GROUP_ADMIN) {
      if (dto.role === Role.SUPER_ADMIN) {
        throw new ForbiddenException('Cannot create super admin');
      }
      if (dto.groupId && dto.groupId !== user.groupId) {
        throw new ForbiddenException('Cannot assign user to another group');
      }
      dto.groupId = user.groupId ?? undefined;
    }

    if (dto.role !== Role.SUPER_ADMIN && !dto.groupId) {
      throw new BadRequestException('groupId is required');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    return this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        passwordHash,
        role: dto.role,
        groupId: dto.groupId,
        bitrixUserId: dto.bitrixUserId,
        bitrixPortalId: dto.bitrixPortalId,
      },
    });
  }

  async listLines(user: JwtPayload) {
    this.assertAdmin(user);
    const where =
      user.role === Role.SUPER_ADMIN
        ? {}
        : user.groupId
          ? { groupId: user.groupId }
          : { id: '__none__' };

    return this.prisma.wappiLine.findMany({
      where,
      include: {
        group: true,
        assignments: { include: { user: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createLine(user: JwtPayload, dto: CreateLineRequest) {
    this.assertAdmin(user);

    if (user.role === Role.GROUP_ADMIN && dto.groupId !== user.groupId) {
      throw new ForbiddenException('Cannot create line in another group');
    }

    const data: any = { ...dto };
    if (data.groupId === '') {
      data.groupId = null;
    }

    return this.prisma.wappiLine.create({ data });
  }

  async updateLine(user: JwtPayload, id: string, dto: UpdateLineRequest) {
    this.assertAdmin(user);
    
    const line = await this.prisma.wappiLine.findUnique({ where: { id } });
    if (!line) throw new NotFoundException('Line not found');

    if (user.role === Role.GROUP_ADMIN && line.groupId !== user.groupId) {
      throw new ForbiddenException('Cannot update line in another group');
    }
    if (user.role === Role.GROUP_ADMIN && dto.groupId && dto.groupId !== user.groupId) {
      throw new ForbiddenException('Cannot move line to another group');
    }

    const data: any = { ...dto };
    if (data.groupId === '') {
      data.groupId = null;
    }

    return this.prisma.wappiLine.update({
      where: { id },
      data,
    });
  }

  async deleteLine(user: JwtPayload, id: string) {
    this.assertAdmin(user);

    const line = await this.prisma.wappiLine.findUnique({ where: { id } });
    if (!line) throw new NotFoundException('Line not found');

    if (user.role === Role.GROUP_ADMIN && line.groupId !== user.groupId) {
      throw new ForbiddenException('Cannot delete line in another group');
    }

    // First delete all messages in conversations belonging to this line
    const conversations = await this.prisma.conversation.findMany({
      where: { lineId: id },
      select: { id: true }
    });
    
    const conversationIds = conversations.map(c => c.id);
    
    if (conversationIds.length > 0) {
      await this.prisma.message.deleteMany({
        where: { conversationId: { in: conversationIds } }
      });
      
      await this.prisma.conversation.deleteMany({
        where: { lineId: id }
      });
    }

    await this.prisma.userLineAssignment.deleteMany({
      where: { lineId: id }
    });

    await this.prisma.wappiLine.delete({ where: { id } });
    return { success: true };
  }

  async updateUser(user: JwtPayload, id: string, dto: UpdateUserRequest) {
    this.assertAdmin(user);
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) {
      throw new NotFoundException('User not found');
    }

    if (user.role === Role.GROUP_ADMIN) {
      if (target.groupId !== user.groupId) {
        throw new ForbiddenException('Cannot edit user in another group');
      }
      if (dto.groupId && dto.groupId !== user.groupId) {
        throw new ForbiddenException('Cannot move user to another group');
      }
      if (dto.role === Role.SUPER_ADMIN) {
        throw new ForbiddenException('Cannot grant SUPER_ADMIN role');
      }
    }

    const data: any = { ...dto };
    if (data.password) {
      data.passwordHash = await bcrypt.hash(data.password, 10);
      delete data.password;
    }

    if (data.groupId === '') {
      data.groupId = null;
    }

    return this.prisma.user.update({
      where: { id },
      data,
    });
  }

  async deleteUser(user: JwtPayload, id: string) {
    this.assertAdmin(user);
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) {
      throw new NotFoundException('User not found');
    }

    if (user.role === Role.GROUP_ADMIN && target.groupId !== user.groupId) {
      throw new ForbiddenException('Cannot delete user in another group');
    }

    await this.prisma.userLineAssignment.deleteMany({ where: { userId: id } });
    await this.prisma.user.delete({ where: { id } });
    
    return { success: true };
  }

  async assignLines(user: JwtPayload, userId: string, dto: AssignLinesRequest) {
    if (user.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenException('Only super admin can assign lines');
    }

    const targetUser = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!targetUser) {
      throw new NotFoundException('User not found');
    }

    if (targetUser.role !== Role.OPERATOR) {
      throw new BadRequestException('Lines can only be assigned to operators');
    }

    await this.prisma.userLineAssignment.deleteMany({ where: { userId } });

    if (dto.lineIds.length) {
      await this.prisma.userLineAssignment.createMany({
        data: dto.lineIds.map((lineId) => ({ userId, lineId })),
      });
    }

    return { success: true };
  }

  async syncBitrixUsers(user: JwtPayload) {
    if (user.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenException('Only super admin can sync users');
    }

    const bitrixUsers = await this.bitrixService.getAllUsers();
    let syncedCount = 0;
    const portalId = 'portal1'; // В будущем можно брать из настроек или профиля админа

    for (const bu of bitrixUsers) {
      if (!bu.ACTIVE) continue; // Пропускаем уволенных/неактивных
      
      const nameParts = [bu.NAME, bu.LAST_NAME].filter(Boolean);
      const name = nameParts.length > 0 ? nameParts.join(' ') : `Bitrix User ${bu.ID}`;
      const email = bu.EMAIL || null;
      const avatarUrl = bu.PERSONAL_PHOTO || null;

      await this.prisma.user.upsert({
        where: {
          bitrixUserId_bitrixPortalId: {
            bitrixUserId: String(bu.ID),
            bitrixPortalId: portalId,
          }
        },
        update: {
          name,
          email,
          avatarUrl,
          // Мы НЕ обновляем groupId автоматически, как просил пользователь
        },
        create: {
          name,
          email,
          avatarUrl,
          role: Role.OPERATOR,
          bitrixUserId: String(bu.ID),
          bitrixPortalId: portalId,
          // groupId остается пустым по умолчанию
        }
      });
      syncedCount++;
    }

    return { success: true, count: syncedCount };
  }

  private mapAdminConversation(
    row: {
      id: string;
      lineId: string;
      wappiChatId: string;
      contactName: string | null;
      contactPhone: string | null;
      contactAvatarUrl: string | null;
      bitrixContactId: string | null;
      lastMessageAt: Date;
      line: {
        name: string;
        wappiProfileId: string;
        messengerType: string;
      };
      _count: { messages: number };
    },
  ) {
    return {
      id: row.id,
      lineId: row.lineId,
      lineName: row.line.name,
      lineProfileId: row.line.wappiProfileId,
      messengerType: row.line.messengerType,
      wappiChatId: row.wappiChatId,
      contactName: row.contactName,
      contactPhone: sanitizeStoredContactPhone(
        row.contactPhone,
        row.line.wappiProfileId,
        row.wappiChatId,
        row.line.messengerType,
      ),
      contactAvatarUrl: row.contactAvatarUrl,
      bitrixContactId: row.bitrixContactId,
      lastMessageAt: row.lastMessageAt.toISOString(),
      messagesCount: row._count.messages,
    };
  }

  async listConversations(
    user: JwtPayload,
    options: { limit?: number; cursor?: string; search?: string } = {},
  ) {
    this.assertAdmin(user);

    const lineScope = this.lineScopeForAdmin(user);

    const limit = Math.min(Math.max(options.limit ?? 40, 1), 100);
    const search = options.search?.trim();

    const where = {
      line: lineScope,
      messages: { some: {} },
      ...(search
        ? {
            OR: [
              { contactName: { contains: search, mode: 'insensitive' as const } },
              { contactPhone: { contains: search } },
              { wappiChatId: { contains: search } },
              { line: { name: { contains: search, mode: 'insensitive' as const } } },
              { line: { wappiProfileId: { contains: search } } },
            ],
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      this.prisma.conversation.count({ where }),
      this.prisma.conversation.findMany({
        where,
        include: {
          line: true,
          _count: { select: { messages: true } },
        },
        orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        ...(options.cursor
          ? { cursor: { id: options.cursor }, skip: 1 }
          : {}),
      }),
    ]);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    return {
      items: page.map((row) => this.mapAdminConversation(row)),
      hasMore,
      nextCursor: hasMore ? page[page.length - 1].id : null,
      total,
    };
  }

  async getConversation(user: JwtPayload, conversationId: string) {
    this.assertAdmin(user);

    const row = await this.prisma.conversation.findFirst({
      where: { id: conversationId, line: this.lineScopeForAdmin(user) },
      include: {
        line: true,
        _count: { select: { messages: true } },
      },
    });

    if (!row) {
      throw new NotFoundException('Conversation not found');
    }

    return this.mapAdminConversation(row);
  }

  private lineScopeForAdmin(user: JwtPayload) {
    if (user.role === Role.SUPER_ADMIN) return {};
    if (user.groupId) return { groupId: user.groupId };
    return { groupId: '__none__' };
  }

  private formatMessageForExport(msg: {
    direction: string;
    source: string;
    type: string;
    body: string | null;
    caption: string | null;
    fileName: string | null;
    createdAt: Date;
    rawPayload: unknown;
  }) {
    const parsed = parseMediaFromPayload({
      ...(typeof msg.rawPayload === 'object' && msg.rawPayload
        ? (msg.rawPayload as Record<string, unknown>)
        : {}),
      type: msg.type,
      body: msg.body,
      caption: msg.caption,
      file_name: msg.fileName,
    });

    let text: string | null = parsed.body ?? parsed.caption ?? '';
    if (!text && isWappiMediaPlaceholder(msg.body ?? undefined)) {
      text = null;
    }
    if (!text && isMediaMessageType(parsed.type)) {
      text = messagePreviewLabel({
        type: parsed.type,
        body: null,
        fileName: msg.fileName,
        caption: msg.caption,
      });
    }

    return {
      at: msg.createdAt.toISOString(),
      direction: msg.direction,
      source: msg.source,
      type: parsed.type,
      text: text || null,
      fileName: msg.fileName,
    };
  }

  async getConversationsExportPreview(
    user: JwtPayload,
    lineId?: string,
  ): Promise<{ conversations: number; messages: number; lineId: string | null }> {
    this.assertAdmin(user);

    const where = {
      line: this.lineScopeForAdmin(user),
      messages: { some: {} },
      ...(lineId ? { lineId } : {}),
    };

    const [conversations, messages] = await Promise.all([
      this.prisma.conversation.count({ where }),
      this.prisma.message.count({
        where: { conversation: where },
      }),
    ]);

    return { conversations, messages, lineId: lineId ?? null };
  }

  async buildConversationsExportJson(
    user: JwtPayload,
    lineId?: string,
  ): Promise<Record<string, unknown>> {
    this.assertAdmin(user);

    const where = {
      line: this.lineScopeForAdmin(user),
      messages: { some: {} },
      ...(lineId ? { lineId } : {}),
    };

    const rows = await this.prisma.conversation.findMany({
      where,
      include: {
        line: {
          select: {
            id: true,
            name: true,
            messengerType: true,
            wappiProfileId: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
          select: {
            direction: true,
            source: true,
            type: true,
            body: true,
            caption: true,
            fileName: true,
            createdAt: true,
            rawPayload: true,
          },
        },
      },
      orderBy: { lastMessageAt: 'desc' },
    });

    let messageCount = 0;
    const conversations = rows.map((row) => {
      messageCount += row.messages.length;
      return {
        id: row.id,
        wappiChatId: row.wappiChatId,
        contactName: row.contactName,
        contactPhone: sanitizeStoredContactPhone(
          row.contactPhone,
          row.line.wappiProfileId,
          row.wappiChatId,
          row.line.messengerType,
        ),
        bitrixContactId: row.bitrixContactId,
        lastMessageAt: row.lastMessageAt.toISOString(),
        line: {
          id: row.line.id,
          name: row.line.name,
          messengerType: row.line.messengerType,
          profileId: row.line.wappiProfileId,
        },
        messages: row.messages.map((m) => this.formatMessageForExport(m)),
      };
    });

    return {
      format: 'fintech-messenger-conversations-v1',
      purpose:
        'Экспорт переписок для анализа (ChatGPT и др.). Текст медиа — краткое описание, без бинарных файлов.',
      exportedAt: new Date().toISOString(),
      exportedBy: { userId: user.sub, role: user.role },
      filter: { lineId: lineId ?? null },
      stats: {
        conversations: conversations.length,
        messages: messageCount,
      },
      conversations,
    };
  }

  private static readonly SYNC_DIALOG_CONCURRENCY = 8;
  private static readonly SYNC_CHATS_PAGE_SIZE = 200;
  private static readonly SYNC_MESSAGES_PAGE_SIZE = 100;
  private static readonly SYNC_MESSAGES_MAX_PAGES = 50;

  private lineScopeWhere(user: JwtPayload) {
    if (user.role === Role.SUPER_ADMIN) return {};
    if (user.groupId) return { groupId: user.groupId };
    return { id: '__none__' };
  }

  async syncAllLinesHistory(user: JwtPayload) {
    if (user.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenException('Only super admin can sync history');
    }

    const lines = await this.prisma.wappiLine.findMany({
      where: this.lineScopeWhere(user),
    });

    await this.wipeConversationsForLines(lines.map((line) => line.id));

    const tasks: Array<{ line: WappiLine; chat: Record<string, unknown> }> = [];

    for (const line of lines) {
      const dialogs = await this.fetchLineDialogs(line);
      for (const chat of dialogs) {
        tasks.push({ line, chat });
      }
    }

    const results = await runPool(
      tasks,
      AdminService.SYNC_DIALOG_CONCURRENCY,
      (task) => this.syncDialogFromWappi(task.line, task.chat),
    );

    const syncedChats = results.reduce((sum, r) => sum + r.chats, 0);
    const syncedMessages = results.reduce((sum, r) => sum + r.messages, 0);

    return {
      success: true,
      lines: lines.length,
      dialogs: tasks.length,
      syncedChats,
      syncedMessages,
    };
  }

  async syncLineHistory(user: JwtPayload, lineId: string) {
    if (user.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenException('Only super admin can sync history');
    }

    const line = await this.prisma.wappiLine.findUnique({ where: { id: lineId } });
    if (!line) {
      throw new NotFoundException('Line not found');
    }

    await this.wipeConversationsForLines([line.id]);

    const dialogs = await this.fetchLineDialogs(line);
    const tasks = dialogs.map((chat) => ({ line, chat }));

    const results = await runPool(
      tasks,
      AdminService.SYNC_DIALOG_CONCURRENCY,
      (task) => this.syncDialogFromWappi(task.line, task.chat),
    );

    const syncedChats = results.reduce((sum, r) => sum + r.chats, 0);
    const syncedMessages = results.reduce((sum, r) => sum + r.messages, 0);

    return { success: true, syncedChats, syncedMessages };
  }

  private async wipeConversationsForLines(lineIds: string[]) {
    if (lineIds.length === 0) return;

    const conversations = await this.prisma.conversation.findMany({
      where: { lineId: { in: lineIds } },
      select: { id: true },
    });
    const conversationIds = conversations.map((c) => c.id);
    if (conversationIds.length === 0) return;

    await this.prisma.message.deleteMany({
      where: { conversationId: { in: conversationIds } },
    });
    await this.prisma.conversation.deleteMany({
      where: { id: { in: conversationIds } },
    });
  }

  private async fetchLineDialogs(line: WappiLine): Promise<Record<string, unknown>[]> {
    try {
      const collected: Record<string, unknown>[] = [];
      let offset = 0;

      for (;;) {
        const chatsResponse = (await this.wappiService.getChats(
          line,
          AdminService.SYNC_CHATS_PAGE_SIZE,
          offset,
          true,
        )) as { dialogs?: Record<string, unknown>[] };
        const dialogs: Record<string, unknown>[] = chatsResponse?.dialogs || [];
        const filtered = dialogs.filter((chat) => {
          const id = String(chat.id ?? '');
          return (
            id &&
            !isGroupOrChannelChat(id, chat) &&
            !(line.messengerType === 'MAX' && isMaxFavoritesDialog(id, chat))
          );
        });
        collected.push(...filtered);

        if (dialogs.length < AdminService.SYNC_CHATS_PAGE_SIZE) break;
        offset += AdminService.SYNC_CHATS_PAGE_SIZE;
      }

      return dedupeWappiDialogs(collected, line.messengerType);
    } catch (err) {
      console.error(`Failed to fetch chats for line ${line.id} (${line.name}):`, err);
      return [];
    }
  }

  private async fetchAllChatMessagesForId(
    line: WappiLine,
    chatId: string,
  ): Promise<Record<string, unknown>[]> {
    const all: Record<string, unknown>[] = [];
    let offset = 0;

    for (let page = 0; page < AdminService.SYNC_MESSAGES_MAX_PAGES; page++) {
      const response = (await this.wappiService.getMessages(
        line,
        chatId,
        AdminService.SYNC_MESSAGES_PAGE_SIZE,
        offset,
      )) as { messages?: Record<string, unknown>[] };
      const batch: Record<string, unknown>[] = response?.messages || [];
      if (batch.length === 0) break;

      all.push(...batch);
      if (batch.length < AdminService.SYNC_MESSAGES_PAGE_SIZE) break;
      offset += AdminService.SYNC_MESSAGES_PAGE_SIZE;
    }

    return all;
  }

  private async fetchAllChatMessages(
    line: WappiLine,
    normalizedChatId: string,
    rawChatId?: string,
  ): Promise<Record<string, unknown>[]> {
    const candidates = wappiMessageChatIdCandidates(
      normalizedChatId,
      rawChatId,
      line.messengerType,
    );

    let best: Record<string, unknown>[] = [];

    for (const chatId of candidates) {
      try {
        const messages = await this.fetchAllChatMessagesForId(line, chatId);
        if (messages.length > best.length) {
          best = messages;
        }
      } catch (err) {
        console.error(`Failed to fetch messages for chat ${chatId}: ${err}`);
      }
    }

    return best;
  }

  private async syncDialogFromWappi(
    line: WappiLine,
    chat: Record<string, unknown>,
  ): Promise<{ chats: number; messages: number }> {
    const rawChatId = String(chat.id);
    const normalizedChatId = normalizeWappiChatId(rawChatId, line.messengerType);

    const messages = await this.fetchAllChatMessages(
      line,
      normalizedChatId,
      rawChatId,
    );

    if (
      line.messengerType === 'MAX' &&
      (isMaxBotChat(messages, chat) || isMaxFavoritesDialog(normalizedChatId, chat))
    ) {
      if (isWappiHttpLogEnabled()) {
        this.wappiHttpFileLog.logSyncPhone(line, normalizedChatId, {
          reason: 'skipped_max_bot_chat',
          messageCount: messages.length,
        });
      }
      return { chats: 0, messages: 0 };
    }

    if (messages.length === 0) {
      return { chats: 0, messages: 0 };
    }

    const linePhones = detectLinePhonesFromMessages(messages);
    const fromMessages = resolveContactPhoneFromMessages(
      messages,
      linePhones,
      line.messengerType,
    );
    const fromChatMeta = readPhoneFromChatMetadata(chat, linePhones);
    const fromBodies =
      line.messengerType === 'MAX'
        ? resolvePhoneFromMessageBodies(messages, linePhones)
        : null;
    const hintPhone = fromMessages ?? fromChatMeta ?? fromBodies;
    const peerUserId =
      line.messengerType === 'MAX'
        ? resolveMaxPeerUserIdFromMessages(messages, linePhones)
        : null;
    const contactNameUserId =
      line.messengerType === 'MAX'
        ? resolveMaxContactNameUserIdFromMessages(messages)
        : null;
    const peerFromDialog =
      line.messengerType === 'MAX'
        ? resolveMaxPeerUserIdFromDialogParticipants(chat)
        : null;

    let contactResponse: Record<string, unknown> | null = null;
    let contactParams: { recipient?: string; phone?: string } = {};

    if (line.messengerType === 'MAX') {
      const attempts = buildMaxContactGetAttempts(
        hintPhone ?? undefined,
        [peerUserId, contactNameUserId, peerFromDialog],
        linePhones,
      );
      for (const params of attempts) {
        contactParams = params;
        contactResponse = await this.wappiService.getContact(line, params);
        if (contactResponse) break;
      }
    } else {
      contactParams = {
        recipient: normalizeWappiChatId(normalizedChatId, line.messengerType),
      };
      contactResponse = await this.wappiService.getContact(line, contactParams);
    }

    const parsed = parseWappiContactResponse(
      contactResponse as Record<string, unknown> | null,
      linePhones,
      line.messengerType,
    );

    let contactName = parsed.contactName;
    if (!contactName) {
      const fallback = (chat.name || chat.pushname) as string | undefined;
      if (fallback && !String(fallback).startsWith('Contact ')) {
        contactName = String(fallback);
      }
    }

    let contactPhone =
      parsed.contactPhone ?? fromMessages ?? fromChatMeta;

    if (isWappiHttpLogEnabled() && !contactPhone) {
      this.wappiHttpFileLog.logSyncPhone(line, normalizedChatId, {
        reason: 'no_phone_resolved',
        contactParams,
        peerUserId,
        contactNameUserId,
        peerFromDialog,
        parsedContact: { phone: parsed.contactPhone, name: parsed.contactName },
        linePhones,
        messageCount: messages.length,
        fromMessages,
        fromChatMeta,
        fromBodies,
        chatMeta: {
          phone: chat.phone,
          number: chat.number,
          contact_phone: chat.contact_phone,
        },
      });
    }

    const updateData: Record<string, unknown> = {};
    if (contactName) updateData.contactName = contactName;
    if (contactPhone) {
      updateData.contactPhone = contactPhone;
      const bitrixContactId = await this.bitrixService.findContactByPhone(
        contactPhone,
      );
      if (bitrixContactId) updateData.bitrixContactId = bitrixContactId;
    }

    const chatLastAt = readChatLastMessageTime(chat);
    if (chatLastAt) updateData.lastMessageAt = chatLastAt;

    const contactAvatarUrl = readContactAvatarFromChat(chat);
    if (contactAvatarUrl) updateData.contactAvatarUrl = contactAvatarUrl;

    const conversation = await this.prisma.conversation.upsert({
      where: {
        lineId_wappiChatId: {
          lineId: line.id,
          wappiChatId: normalizedChatId,
        },
      },
      update: updateData,
      create: {
        lineId: line.id,
        wappiChatId: normalizedChatId,
        contactName: contactName ?? null,
        contactPhone,
        contactAvatarUrl: contactAvatarUrl ?? null,
        bitrixContactId:
          typeof updateData.bitrixContactId === 'string'
            ? updateData.bitrixContactId
            : null,
        lastMessageAt: chatLastAt ?? new Date(),
      },
    });

    let syncedMessages = 0;
    for (const msg of messages) {
      const wappiMessageId = msg.id;
      if (!wappiMessageId) continue;

      const existing = await this.prisma.message.findFirst({
        where: { wappiMessageId: String(wappiMessageId) },
      });
      if (existing) continue;

      const direction = msg.fromMe
        ? MessageDirection.OUTGOING
        : MessageDirection.INCOMING;
      const parsedMedia = parseMediaFromPayload(msg);
      const messageType = parsedMedia.type;
      let mediaUrl = parsedMedia.mediaUrl;
      if (!mediaUrl && wappiMessageId && isMediaMessageType(messageType)) {
        mediaUrl = await this.wappiService.downloadMessageMedia(
          line,
          String(wappiMessageId),
        );
      }

      let status = MessageStatus.DELIVERED;
      if (msg.isRead || msg.delivery_status === 'read') status = MessageStatus.READ;
      else if (msg.delivery_status === 'error') status = MessageStatus.ERROR;

      let body = parsedMedia.body;
      let caption = parsedMedia.caption;
      if (
        !body &&
        typeof msg.body === 'string' &&
        !msg.body.startsWith('/9j/') &&
        msg.body.length < 5000 &&
        !isWappiMediaPlaceholder(msg.body)
      ) {
        body = msg.body;
      }

      let reaction = null;
      if (Array.isArray(msg.reactions) && msg.reactions.length > 0) {
        reaction = (msg.reactions[0] as { reaction?: string })?.reaction ?? null;
      }

      let msgTime = msg.time || Date.now();
      if (typeof msgTime === 'number' && msgTime < 10000000000) {
        msgTime = msgTime * 1000;
      }

      await this.prisma.message.create({
        data: {
          conversationId: conversation.id,
          wappiMessageId: String(wappiMessageId),
          direction,
          source: MessageSource.WAPPI,
          body,
          type: messageType,
          caption,
          fileName: parsedMedia.fileName,
          mimeType: parsedMedia.mimeType,
          mediaUrl,
          status,
          reaction,
          rawPayload: msg as object,
          createdAt: new Date(msgTime as string | number),
        },
      });

      syncedMessages++;
    }

    const lastMsg = messages[0];
    let lastMsgTime = lastMsg?.time || Date.now();
    if (typeof lastMsgTime === 'number' && lastMsgTime < 10000000000) {
      lastMsgTime = lastMsgTime * 1000;
    }

    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: new Date(lastMsgTime as string | number),
        ...updateData,
      },
    });

    return { chats: 1, messages: syncedMessages };
  }

}
