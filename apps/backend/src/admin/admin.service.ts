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
import { normalizeMessageType } from '../common/media.utils';
import { runPool } from '../common/async-pool';
import {
  detectLinePhonesFromMessages,
  resolveContactPhoneFromMessages,
  sanitizeStoredContactPhone,
} from '../common/contact-phone.utils';
import {
  isGroupOrChannelChat,
  normalizeWappiChatId,
  parseWappiContactResponse,
  buildContactGetParams,
  dedupeWappiDialogs,
  readChatLastMessageTime,
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

  async listConversations(user: JwtPayload) {
    this.assertAdmin(user);

    const lineScope =
      user.role === Role.SUPER_ADMIN
        ? {}
        : user.groupId
          ? { groupId: user.groupId }
          : { groupId: '__none__' };

    const rows = await this.prisma.conversation.findMany({
      where: { line: lineScope },
      include: {
        line: true,
        _count: { select: { messages: true } },
      },
      orderBy: { lastMessageAt: 'desc' },
    });

    return rows.map((row) => ({
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
      bitrixContactId: row.bitrixContactId,
      lastMessageAt: row.lastMessageAt.toISOString(),
      messagesCount: row._count.messages,
    }));
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
          return id && !isGroupOrChannelChat(id, chat);
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

    const linePhones = detectLinePhonesFromMessages(messages);
    const fromMessages = resolveContactPhoneFromMessages(
      messages,
      linePhones,
      line.messengerType,
    );
    const fromChatMeta = readPhoneFromChatMetadata(chat, linePhones);
    const hintPhone = fromMessages ?? fromChatMeta;

    const contactParams = buildContactGetParams(
      normalizedChatId,
      line.messengerType,
      hintPhone ?? undefined,
      linePhones,
    );

    let contactResponse = await this.wappiService.getContact(line, contactParams);

    // MAX: retry contact/get by phone if recipient=id returned nothing.
    if (
      line.messengerType === 'MAX' &&
      !contactResponse &&
      hintPhone &&
      contactParams.recipient &&
      !contactParams.phone
    ) {
      contactResponse = await this.wappiService.getContact(line, {
        phone: hintPhone,
      });
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
        parsedContact: { phone: parsed.contactPhone, name: parsed.contactName },
        linePhones,
        messageCount: messages.length,
        fromMessages,
        fromChatMeta,
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
        bitrixContactId:
          typeof updateData.bitrixContactId === 'string'
            ? updateData.bitrixContactId
            : null,
        lastMessageAt: chatLastAt ?? new Date(),
      },
    });

    if (messages.length === 0) {
      return { chats: 1, messages: 0 };
    }

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
      const messageType = normalizeMessageType(
        typeof msg.type === 'string' ? msg.type : 'text',
      );

      let status = MessageStatus.DELIVERED;
      if (msg.isRead || msg.delivery_status === 'read') status = MessageStatus.READ;
      else if (msg.delivery_status === 'error') status = MessageStatus.ERROR;

      let body = msg.body;
      if (typeof body !== 'string' || body.startsWith('/9j/') || body.length >= 5000) {
        body = null;
      }

      let caption = msg.caption;
      if (messageType !== 'text' && body && !caption) {
        caption = body;
        body = null;
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
          body: typeof body === 'string' ? body : null,
          type: messageType,
          caption: typeof caption === 'string' ? caption : null,
          fileName: typeof msg.file_name === 'string' ? msg.file_name : null,
          mimeType: typeof msg.mimetype === 'string' ? msg.mimetype : null,
          mediaUrl:
            (typeof msg.thumbnail === 'string' ? msg.thumbnail : null) ||
            (typeof msg.picture === 'string' ? msg.picture : null) ||
            (typeof msg.file_link === 'string' ? msg.file_link : null),
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
