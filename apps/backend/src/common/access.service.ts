import { Injectable } from '@nestjs/common';
import { Role } from '@fintech/shared';
import { JwtPayload } from './guards';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  async getAllowedLineIds(user: JwtPayload): Promise<string[] | 'all'> {
    if (user.role === Role.SUPER_ADMIN) {
      return 'all';
    }

    if (user.role === Role.GROUP_ADMIN) {
      if (!user.groupId) return [];
      const lines = await this.prisma.wappiLine.findMany({
        where: { groupId: user.groupId },
        select: { id: true },
      });
      return lines.map((line) => line.id);
    }

    const assignments = await this.prisma.userLineAssignment.findMany({
      where: { userId: user.sub },
      select: { lineId: true },
    });
    return assignments.map((item) => item.lineId);
  }

  async canAccessLine(user: JwtPayload, lineId: string): Promise<boolean> {
    const allowed = await this.getAllowedLineIds(user);
    return allowed === 'all' || allowed.includes(lineId);
  }

  lineFilter(user: JwtPayload, allowedLineIds: string[] | 'all') {
    if (allowedLineIds === 'all') return {};
    return { lineId: { in: allowedLineIds } };
  }
}
