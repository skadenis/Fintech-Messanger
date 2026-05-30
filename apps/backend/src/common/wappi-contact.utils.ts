import {
  extractPhoneFromChatId,
  isExcludedPhone,
  looksLikePhoneNumber,
} from './contact-phone.utils';
import { normalizePhone } from './utils';

export interface ParsedWappiContact {
  contactName: string | null;
  contactPhone: string | null;
  contactId: string | null;
}

export function normalizeWappiChatId(rawId: string, messengerType: string): string {
  if (!rawId) return rawId;
  if (messengerType === 'WHATSAPP') {
    return rawId.includes('@') ? rawId : `${rawId}@c.us`;
  }
  return rawId.replace('@c.us', '').replace('@s.whatsapp.net', '');
}

/** Recipient query param for GET /sync/contact/get (WA / TG) */
export function wappiContactRecipient(chatId: string, messengerType: string): string {
  if (messengerType === 'WHATSAPP') {
    return chatId.includes('@') ? chatId : `${chatId}@c.us`;
  }
  return chatId.replace('@c.us', '').replace('@s.whatsapp.net', '');
}

export interface WappiContactGetParams {
  recipient?: string;
  phone?: string;
}

/** Query params for GET /sync/contact/get — MAX supports recipient (id) or phone */
export function buildContactGetParams(
  chatId: string,
  messengerType: string,
  hintPhone?: string | null,
  excludedPhones: string[] = [],
): WappiContactGetParams {
  if (messengerType === 'MAX') {
    const bareId = chatId.replace('@c.us', '').replace('@s.whatsapp.net', '').trim();
    const normalizedHint =
      hintPhone &&
      looksLikePhoneNumber(hintPhone) &&
      !isExcludedPhone(hintPhone, excludedPhones)
        ? normalizePhone(hintPhone)
        : null;

    if (bareId && looksLikePhoneNumber(bareId) && !isExcludedPhone(bareId, excludedPhones)) {
      return { phone: normalizePhone(bareId) };
    }
    if (normalizedHint) {
      return { phone: normalizedHint };
    }
    if (bareId && /^\d+$/.test(bareId)) {
      return { recipient: bareId };
    }
    return bareId ? { recipient: bareId } : {};
  }

  return { recipient: wappiContactRecipient(chatId, messengerType) };
}

/** One dialog per peer — Wappi may return both `123` and `123@c.us` for MAX. */
export function dedupeWappiDialogs(
  dialogs: Record<string, unknown>[],
  messengerType: string,
): Record<string, unknown>[] {
  const byNorm = new Map<string, Record<string, unknown>>();

  for (const chat of dialogs) {
    const rawId = String(chat.id ?? '');
    if (!rawId) continue;
    const norm = normalizeWappiChatId(rawId, messengerType);
    const existing = byNorm.get(norm);
    byNorm.set(
      norm,
      existing ? { ...existing, ...chat, id: norm } : { ...chat, id: norm },
    );
  }

  return [...byNorm.values()];
}

function parseMaxContactName(data: Record<string, unknown>): string | null {
  const names = data.names;
  if (!Array.isArray(names)) return null;

  const entries = names.filter(
    (item): item is Record<string, unknown> =>
      Boolean(item) && typeof item === 'object',
  );
  if (entries.length === 0) return null;

  const preferred =
    entries.find((item) => item.type === 'CUSTOM') ??
    entries.find((item) => item.type === 'ONEME') ??
    entries[0];

  if (typeof preferred.name === 'string' && preferred.name.trim()) {
    return preferred.name.trim();
  }

  const first =
    typeof preferred.firstName === 'string' ? preferred.firstName.trim() : '';
  const last =
    typeof preferred.lastName === 'string' ? preferred.lastName.trim() : '';
  const combined = [first, last].filter(Boolean).join(' ');
  return combined || null;
}

function readContactPhoneField(
  value: unknown,
  excludedPhones: string[],
): string | null {
  const raw =
    typeof value === 'number'
      ? String(value)
      : typeof value === 'string'
        ? value.trim()
        : '';
  if (!raw || !looksLikePhoneNumber(raw) || isExcludedPhone(raw, excludedPhones)) {
    return null;
  }
  return normalizePhone(raw);
}

export function parseWappiContactResponse(
  response: Record<string, unknown> | null | undefined,
  excludedPhones: string[],
  messengerType: string,
): ParsedWappiContact {
  const empty: ParsedWappiContact = {
    contactName: null,
    contactPhone: null,
    contactId: null,
  };

  if (!response || typeof response !== 'object') return empty;

  const contact = response.contact;
  if (!contact || typeof contact !== 'object') return empty;

  const data = contact as Record<string, unknown>;
  const contactId =
    typeof data.id === 'string'
      ? data.id
      : typeof data.id === 'number'
        ? String(data.id)
        : null;

  let contactPhone: string | null = null;
  if (messengerType === 'MAX') {
    contactPhone = readContactPhoneField(data.phone, excludedPhones);
  } else {
    contactPhone =
      readContactPhoneField(data.number, excludedPhones) ??
      readContactPhoneField(data.phone, excludedPhones);
    if (!contactPhone && messengerType === 'WHATSAPP' && contactId) {
      const fromId = extractPhoneFromChatId(
        contactId.includes('@') ? contactId : `${contactId}@c.us`,
        'WHATSAPP',
      );
      if (fromId && !isExcludedPhone(fromId, excludedPhones)) {
        contactPhone = fromId;
      }
    }
  }

  let contactName: string | null = null;
  if (messengerType === 'MAX') {
    contactName = parseMaxContactName(data);
  }
  if (!contactName && typeof data.name === 'string') {
    const name = data.name.trim();
    if (name && !name.startsWith('Contact ')) contactName = name;
  }
  if (!contactName && typeof data.pushname === 'string' && data.pushname.trim()) {
    contactName = data.pushname.trim();
  }
  if (!contactName) {
    const first = typeof data.firstName === 'string' ? data.firstName.trim() : '';
    const last = typeof data.lastName === 'string' ? data.lastName.trim() : '';
    const combined = [first, last].filter(Boolean).join(' ');
    if (combined) contactName = combined;
  }

  return { contactName, contactPhone, contactId };
}

/** Phone from chat list metadata (after line phones are known). */
export function readPhoneFromChatMetadata(
  chat: Record<string, unknown>,
  excludedPhones: string[],
): string | null {
  for (const field of ['phone', 'number', 'contact_phone'] as const) {
    const phone = readContactPhoneField(chat[field], excludedPhones);
    if (phone) return phone;
  }
  return null;
}

export function readChatLastMessageTime(chat: Record<string, unknown>): Date | null {
  const raw =
    chat.last_message_time ??
    chat.lastMessageTime ??
    chat.time ??
    chat.timestamp ??
    chat.last_time;

  if (raw == null) return null;

  let ms: number;
  if (typeof raw === 'number') {
    ms = raw < 10000000000 ? raw * 1000 : raw;
  } else if (typeof raw === 'string') {
    const parsed = Date.parse(raw);
    if (Number.isNaN(parsed)) return null;
    ms = parsed;
  } else {
    return null;
  }

  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Chat id variants for Wappi message history (API format differs by messenger). */
export function wappiMessageChatIdCandidates(
  normalizedChatId: string,
  rawChatId: string | undefined,
  messengerType: string,
): string[] {
  const candidates = new Set<string>();
  const add = (id: string) => {
    const trimmed = id.trim();
    if (trimmed) candidates.add(trimmed);
  };

  add(normalizedChatId);
  if (rawChatId) add(String(rawChatId));

  const bare = normalizedChatId.replace('@c.us', '').replace('@s.whatsapp.net', '');

  if (messengerType === 'MAX') {
    add(bare);
    add(`${bare}@c.us`);
  }
  if (messengerType === 'WHATSAPP') {
    add(bare.includes('@') ? bare : `${bare}@c.us`);
    add(`${bare}@s.whatsapp.net`);
  }

  return [...candidates];
}

export function isGroupOrChannelChat(
  chatId: string,
  chat: Record<string, unknown>,
): boolean {
  return (
    chatId.startsWith('-') ||
    chatId.includes('@g.us') ||
    chatId.includes('@broadcast') ||
    chat.isGroup === true ||
    chat.type === 'channel' ||
    chat.type === 'group' ||
    chat.type === 'supergroup'
  );
}
