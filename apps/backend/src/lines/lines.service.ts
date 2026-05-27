import { Injectable } from '@nestjs/common';
import { MessengerType, Role } from '@fintech/shared';
import { AccessService } from '../common/access.service';
import { JwtPayload } from '../common/guards';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LinesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessService: AccessService,
  ) {}

  async findAll(user: JwtPayload, messenger?: MessengerType) {
    const allowedLineIds = await this.accessService.getAllowedLineIds(user);

    const lines = await this.prisma.wappiLine.findMany({
      where: {
        ...(allowedLineIds === 'all' ? {} : { id: { in: allowedLineIds } }),
        ...(messenger ? { messengerType: messenger } : {}),
      },
      include: { group: true },
      orderBy: { name: 'asc' },
    });

    return lines.map((line) => ({
      id: line.id,
      name: line.name,
      messengerType: line.messengerType as MessengerType,
      wappiProfileId: line.wappiProfileId,
      groupId: line.groupId || '',
      groupName: line.group?.name || '',
      status: line.status,
    }));
  }

  async findAllAdmin(user: JwtPayload) {
    const where =
      user.role === Role.SUPER_ADMIN
        ? {}
        : user.groupId
          ? { groupId: user.groupId }
          : { id: '__none__' };

    const lines = await this.prisma.wappiLine.findMany({
      where,
      include: { group: true, assignments: { include: { user: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return lines.map((line) => ({
      id: line.id,
      name: line.name,
      messengerType: line.messengerType,
      wappiProfileId: line.wappiProfileId,
      groupId: line.groupId || '',
      groupName: line.group?.name || '',
      status: line.status,
      assignedUsers: line.assignments.map((item) => ({
        id: item.user.id,
        name: item.user.name,
      })),
    }));
  }
}
