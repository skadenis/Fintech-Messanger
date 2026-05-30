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

export function isExcludedPhone(
  phone: string | null | undefined,
  excludedPhones: string[],
): boolean {
  if (!phone || excludedPhones.length === 0) return false;
  return excludedPhones.some((linePhone) => isLinePhone(phone, linePhone));
}

/** Phones that appear on outgoing (fromMe) messages — the connected line's number. */
export function detectLinePhonesFromMessages(
  messages: Record<string, unknown>[],
): string[] {
  const counts = new Map<string, number>();

  for (const msg of messages) {
    if (!msg.fromMe) continue;
    for (const field of ['from', 'to', 'contact_phone', 'phone'] as const) {
      const value = msg[field];
      if (typeof value !== 'string' || !looksLikePhoneNumber(value)) continue;
      const digits = normalizePhone(value);
      counts.set(digits, (counts.get(digits) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([phone]) => phone);
}

export function resolveLineOwnerPhoneFromPayload(
  payload: Record<string, unknown>,
  direction: MessageDirection,
): string | null {
  const fields =
    direction === MessageDirection.INCOMING
      ? (['to', 'phone', 'contact_phone'] as const)
      : (['from', 'phone', 'contact_phone'] as const);

  for (const field of fields) {
    const value = payload[field];
    if (typeof value !== 'string' || !looksLikePhoneNumber(value)) continue;
    return normalizePhone(value);
  }
  return null;
}

export function resolveContactPhoneFromMessages(
  messages: Record<string, unknown>[],
  linePhones: string[],
  messengerType: string,
): string | null {
  for (const msg of messages) {
    if (msg.fromMe) continue;
    const resolved = resolveContactPhone({
      linePhone: linePhones[0] ?? '',
      chatId: String(msg.chatId ?? msg.chat_id ?? ''),
      direction: MessageDirection.INCOMING,
      payload: msg,
      messengerType,
    });
    if (resolved && !isExcludedPhone(resolved, linePhones)) {
      return resolved;
    }
  }
  return null;
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
  _lineProfileId: string,
  wappiChatId: string,
  messengerType?: string,
): string | null {
  if (contactPhone && looksLikePhoneNumber(contactPhone)) {
    return normalizePhone(contactPhone);
  }
  return extractPhoneFromChatId(wappiChatId, messengerType);
}

export function resolveContactPhone(params: {
  linePhone?: string;
  excludedPhones?: string[];
  chatId: string;
  direction: MessageDirection;
  payload: Record<string, unknown>;
  messengerType?: string;
}): string | null {
  const excluded = [
    ...(params.excludedPhones ?? []),
    ...(params.linePhone ? [params.linePhone] : []),
  ];

  const addCandidate = (value: unknown): string | null => {
    if (typeof value !== 'string' || !value.trim()) return null;
    const digits = normalizePhone(value);
    if (!digits || !looksLikePhoneNumber(digits)) return null;
    if (isExcludedPhone(digits, excluded)) return null;
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
