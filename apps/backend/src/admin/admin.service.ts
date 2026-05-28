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

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bitrixService: BitrixService,
    private readonly wappiService: WappiService,
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

  async syncLineHistory(user: JwtPayload, lineId: string) {
    if (user.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenException('Only super admin can sync history');
    }

    const line = await this.prisma.wappiLine.findUnique({ where: { id: lineId } });
    if (!line) {
      throw new NotFoundException('Line not found');
    }

    // 1. Fetch chats
    const chatsResponse = await this.wappiService.getChats(line, 200, 0, true);
    const dialogs = chatsResponse?.dialogs || [];

    let syncedChats = 0;
    let syncedMessages = 0;

    for (const chat of dialogs) {
      const wappiChatId = chat.id;

      // Игнорируем каналы и группы
      if (
        wappiChatId.startsWith('-') || 
        wappiChatId.includes('@g.us') || 
        wappiChatId.includes('@broadcast') || 
        chat.isGroup ||
        chat.type === 'channel' ||
        chat.type === 'group' ||
        chat.type === 'supergroup'
      ) {
        continue;
      }

      let normalizedChatId = wappiChatId;
      if (!normalizedChatId.includes('@')) {
        normalizedChatId = `${normalizedChatId}@c.us`;
      }

      const contactName = chat.name || chat.pushname || null;
      const contactPhone = normalizedChatId.replace('@c.us', '').replace('@s.whatsapp.net', '');

      const conversation = await this.prisma.conversation.upsert({
        where: {
          lineId_wappiChatId: {
            lineId: line.id,
            wappiChatId: normalizedChatId,
          },
        },
        update: {
          contactName: contactName ?? undefined,
        },
        create: {
          lineId: line.id,
          wappiChatId: normalizedChatId,
          contactName: contactName ?? null,
          contactPhone,
        },
      });

      syncedChats++;

      // 2. Fetch messages for this chat
      try {
        const messagesResponse = await this.wappiService.getMessages(line, wappiChatId, 100, 0);
        const messages = messagesResponse?.messages || [];

        for (const msg of messages) {
          const wappiMessageId = msg.id;
          if (!wappiMessageId) continue;

          // Проверяем, есть ли уже такое сообщение
          const existing = await this.prisma.message.findFirst({
            where: { wappiMessageId },
          });

          if (existing) continue;

          const direction = msg.fromMe ? MessageDirection.OUTGOING : MessageDirection.INCOMING;
          const messageType = normalizeMessageType(msg.type);

          let status = MessageStatus.DELIVERED;
          if (msg.isRead || msg.delivery_status === 'read') status = MessageStatus.READ;
          else if (msg.delivery_status === 'error') status = MessageStatus.ERROR;

          let body = msg.body;
          if (typeof body !== 'string' || body.startsWith('/9j/') || body.length >= 5000) {
            body = null;
          }

          let reaction = null;
          if (Array.isArray(msg.reactions) && msg.reactions.length > 0) {
            reaction = msg.reactions[0].reaction;
          }

          await this.prisma.message.create({
            data: {
              conversationId: conversation.id,
              wappiMessageId,
              direction,
              source: MessageSource.WAPPI,
              body,
              type: messageType,
              caption: msg.caption || null,
              fileName: msg.file_name || null,
              mimeType: msg.mimetype || null,
              mediaUrl: msg.thumbnail || msg.picture || msg.file_link || null,
              status,
              reaction,
              rawPayload: msg,
              createdAt: new Date(msg.time || Date.now()),
            },
          });

          syncedMessages++;
        }

        // Обновляем lastMessageAt у диалога
        if (messages.length > 0) {
          const lastMsg = messages[0];
          await this.prisma.conversation.update({
            where: { id: conversation.id },
            data: { lastMessageAt: new Date(lastMsg.time || Date.now()) },
          });
        }
      } catch (err) {
        console.error(`Failed to sync messages for chat ${wappiChatId}`, err);
      }
    }

    return { success: true, syncedChats, syncedMessages };
  }
}
