import { Role, UserDto } from '@fintech/shared';
import { User } from '@prisma/client';

export function toUserDto(user: User & { group?: { name: string } | null }): UserDto {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role as Role,
    groupId: user.groupId,
    groupName: user.group?.name ?? null,
    avatarUrl: user.avatarUrl ?? null,
  };
}

export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

export function phonesMatch(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  const na = normalizePhone(a);
  const nb = normalizePhone(b);
  if (!na || !nb) return false;
  return na.endsWith(nb) || nb.endsWith(na) || na === nb;
}

export function formatChatId(messengerType: string, phone: string): string {
  const digits = normalizePhone(phone);
  if (messengerType === 'WHATSAPP') {
    return `${digits}@c.us`;
  }
  return digits;
}

export function messengerTypeFromString(value: string): 'TELEGRAM' | 'WHATSAPP' | 'MAX' | null {
  const map: Record<string, 'TELEGRAM' | 'WHATSAPP' | 'MAX'> = {
    telegram: 'TELEGRAM',
    whatsapp: 'WHATSAPP',
    max: 'MAX',
  };
  return map[value.toLowerCase()] ?? null;
}

export function wappiBaseUrl(messengerType: string): string {
  switch (messengerType) {
    case 'TELEGRAM':
      return 'https://wappi.pro/tapi';
    case 'MAX':
      return 'https://wappi.pro/maxapi';
    default:
      return 'https://wappi.pro/api';
  }
}
