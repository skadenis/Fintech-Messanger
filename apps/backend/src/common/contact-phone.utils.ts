import { MessageDirection } from '@fintech/shared';
import { normalizePhone, phonesMatch } from './utils';

/** Mobile / landline digits (not Telegram user id, not MAX internal id). */
export function looksLikePhoneNumber(value: string): boolean {
  const digits = normalizePhone(value);
  if (!digits) return false;
  if (/^7\d{10}$/.test(digits)) return true;
  if (/^375\d{9}$/.test(digits)) return true;
  // Require at least 11 digits to filter out 9-10 digit Telegram IDs
  if (/^\d{11,15}$/.test(digits)) return true;
  return false;
}

export function isLinePhone(
  phone: string | null | undefined,
  linePhone: string,
): boolean {
  if (!phone) return false;
  return phonesMatch(phone, linePhone);
}

export function extractPhoneFromChatId(chatId: string, messengerType?: string): string | null {
  if (messengerType === 'TELEGRAM') return null;
  
  const local = chatId
    .replace('@c.us', '')
    .replace('@s.whatsapp.net', '')
    .trim();
  if (!local || local.startsWith('-')) return null;
  if (!looksLikePhoneNumber(local)) return null;
  return normalizePhone(local);
}

export function sanitizeStoredContactPhone(
  contactPhone: string | null | undefined,
  linePhone: string,
  wappiChatId: string,
  messengerType?: string,
): string | null {
  if (contactPhone && looksLikePhoneNumber(contactPhone) && !isLinePhone(contactPhone, linePhone)) {
    return normalizePhone(contactPhone);
  }
  return extractPhoneFromChatId(wappiChatId, messengerType);
}

export function resolveContactPhone(params: {
  linePhone: string;
  chatId: string;
  direction: MessageDirection;
  payload: Record<string, unknown>;
  messengerType?: string;
}): string | null {
  const lineDigits = normalizePhone(params.linePhone);

  const addCandidate = (value: unknown): string | null => {
    if (typeof value !== 'string' || !value.trim()) return null;
    const digits = normalizePhone(value);
    if (!digits || !looksLikePhoneNumber(digits)) return null;
    if (digits === lineDigits || phonesMatch(digits, lineDigits)) return null;
    return digits;
  };

  const ordered: unknown[] = [];

  if (params.direction === MessageDirection.INCOMING) {
    ordered.push(params.payload.from, params.payload.contact_phone, params.payload.phone);
  } else {
    ordered.push(params.payload.to, params.payload.contact_phone, params.payload.phone);
  }

  for (const candidate of ordered) {
    const resolved = addCandidate(candidate);
    if (resolved) return resolved;
  }

  return extractPhoneFromChatId(params.chatId, params.messengerType);
}

export function formatPhoneDisplay(phone: string): string {
  const digits = normalizePhone(phone);
  if (digits.length === 11 && digits.startsWith('7')) {
    return `+7 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9, 11)}`;
  }
  if (digits.length >= 10) {
    return `+${digits}`;
  }
  return phone;
}
