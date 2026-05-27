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

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bitrixService: BitrixService,
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
}
