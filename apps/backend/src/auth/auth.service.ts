import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import {
  AdminLoginRequest,
  AuthResponse,
  IframeAuthRequest,
  IframeMode,
  isIframeContactMode,
  Role,
  resolveIframeContactId,
} from '@fintech/shared';
import { AccessService } from '../common/access.service';
import {
  signIframePayload,
  verifyIframeAuth,
} from '../common/iframe-auth.utils';
import { toUserDto } from '../common/utils';
import { JwtPayload } from '../common/guards';
import { PrismaService } from '../prisma/prisma.service';
import { BitrixService } from '../bitrix/bitrix.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly accessService: AccessService,
    private readonly bitrixService: BitrixService,
  ) {}

  private signToken(user: { id: string; role: Role; groupId?: string | null }) {
    const payload: JwtPayload = {
      sub: user.id,
      role: user.role as Role,
      groupId: user.groupId,
    };
    return this.jwtService.signAsync(payload);
  }

  verifyIframeSecret(dto: IframeAuthRequest): boolean {
    const secret = process.env.IFRAME_SECRET ?? 'change-me-iframe-secret';
    return verifyIframeAuth(dto, secret);
  }

  private async resolveIframeUser(dto: IframeAuthRequest) {
    if (!dto.user_id) {
      const groupAdmin = await this.prisma.user.findFirst({
        where: {
          bitrixPortalId: dto.additional,
          role: Role.GROUP_ADMIN,
        },
        include: { group: true },
      });

      if (groupAdmin) {
        return groupAdmin;
      }
    }

    const userId = dto.user_id || process.env.DEFAULT_BITRIX_USER_ID || '123';

    let user = await this.prisma.user.findFirst({
      where: {
        bitrixUserId: userId,
        bitrixPortalId: dto.additional,
      },
      include: { group: true },
    });

    if (!user) {
      throw new UnauthorizedException('Пользователь не найден в системе. Пожалуйста, синхронизируйте пользователей в админ-панели.');
    }

    return user;
  }

  async iframeAuth(dto: IframeAuthRequest): Promise<AuthResponse> {
    const iframeSecret = process.env.IFRAME_SECRET ?? 'change-me-iframe-secret';
    
    if (!verifyIframeAuth(dto, iframeSecret)) {
      throw new UnauthorizedException('Invalid iframe secret');
    }

    const user = await this.resolveIframeUser(dto);

    const token = await this.signToken({
      id: user.id,
      role: user.role as Role,
      groupId: user.groupId,
    });

    const contactId = resolveIframeContactId(dto);
    let contactPhone = dto.contact_phone;
    let contactName = dto.contact_name;
    const mode = isIframeContactMode(dto) ? IframeMode.CONTACT : IframeMode.INBOX;

    let contact: AuthResponse['contact'];
    if (mode === IframeMode.CONTACT) {
      // If we only have contactId and no phone, try to fetch from Bitrix
      if (contactId && !contactPhone) {
        const bitrixContact = await this.bitrixService.getContactDetails(contactId);
        if (bitrixContact) {
          if (bitrixContact.phone) contactPhone = bitrixContact.phone;
          if (bitrixContact.name) contactName = bitrixContact.name;
        }
      }

      // First try to find by bitrixContactId explicitly
      let conversation = contactId
        ? await this.prisma.conversation.findFirst({
            where: { bitrixContactId: contactId },
            orderBy: { lastMessageAt: 'desc' },
          })
        : null;

      // If not found by ID, but we have a phone, search by phone
      if (!conversation && contactPhone) {
        conversation = await this.prisma.conversation.findFirst({
          where: { contactPhone: contactPhone },
          orderBy: { lastMessageAt: 'desc' },
        });

        // If we found it by phone and have a contactId, link them
        if (conversation && contactId && !conversation.bitrixContactId) {
          await this.prisma.conversation.update({
            where: { id: conversation.id },
            data: { bitrixContactId: contactId },
          });
        }
      }

      contact = {
        bitrixContactId: contactId ?? conversation?.bitrixContactId ?? '',
        phone: contactPhone ?? conversation?.contactPhone ?? null,
        name: contactName ?? conversation?.contactName ?? null,
      };
    }

    return {
      token,
      user: toUserDto(user),
      mode,
      contact,
      domain: dto.domain,
    };
  }

  async adminLogin(dto: AdminLoginRequest): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { group: true },
    });

    if (!user?.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.role === Role.OPERATOR) {
      throw new UnauthorizedException('Operators cannot access admin panel');
    }

    const token = await this.signToken({
      id: user.id,
      role: user.role as Role,
      groupId: user.groupId,
    });
    return {
      token,
      user: toUserDto(user),
      mode: IframeMode.INBOX,
    };
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { group: true },
    });
    return toUserDto(user);
  }
}
