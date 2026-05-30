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

/**
 * MAX peer user id from incoming messages (`from` when it is not a mobile number).
 * Dialog chat_id and contact id differ on MAX — do not use chat_id as recipient.
 */
export function resolveMaxPeerUserIdFromMessages(
  messages: Record<string, unknown>[],
  excludedPhones: string[],
): string | null {
  const counts = new Map<string, number>();

  for (const msg of messages) {
    if (msg.fromMe) continue;
    const raw = msg.from;
    const id =
      typeof raw === 'number'
        ? String(raw)
        : typeof raw === 'string'
          ? raw.trim()
          : '';
    if (!id || !/^\d+$/.test(id)) continue;
    if (isExcludedPhone(id, excludedPhones)) continue;
    if (looksLikePhoneNumber(id)) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return best?.[0] ?? null;
}

/** Wappi placeholder name on outbound-only MAX dialogs: "Contact 285813302" → user id 285813302. */
export function parseMaxContactNameUserId(
  contactName: string | null | undefined,
): string | null {
  if (!contactName) return null;
  const match = /^Contact\s+(\d+)$/i.exec(contactName.trim());
  return match?.[1] ?? null;
}

export function resolveMaxContactNameUserIdFromMessages(
  messages: Record<string, unknown>[],
): string | null {
  for (const msg of messages) {
    const fromName =
      typeof msg.contact_name === 'string' ? msg.contact_name : null;
    const id = parseMaxContactNameUserId(fromName);
    if (id) return id;
  }
  return null;
}

const MAX_BOT_SYSTEM_BODY =
  /бот\s+начал|bot\s+started|присылать\s+уведомлен/i;

/** MAX service/bot dialogs — skip history sync and contact/get. */
export function isMaxBotChat(
  messages: Record<string, unknown>[],
  chat?: Record<string, unknown>,
): boolean {
  if (chat) {
    const name = String(chat.name ?? chat.pushname ?? '').trim();
    if (/^бот$/i.test(name) || /^bot$/i.test(name)) return true;
  }

  for (const msg of messages) {
    if (String(msg.type ?? '').toLowerCase() !== 'system') continue;
    const body = String(msg.body ?? '');
    if (MAX_BOT_SYSTEM_BODY.test(body)) return true;
  }

  return false;
}

/** Ordered MAX strategies for contact/get: phone first, then peer user ids (not dialog chat_id). */
export function buildMaxContactGetAttempts(
  hintPhone: string | null | undefined,
  recipientIds: (string | null | undefined)[],
  excludedPhones: string[] = [],
): WappiContactGetParams[] {
  const attempts: WappiContactGetParams[] = [];

  if (
    hintPhone &&
    looksLikePhoneNumber(hintPhone) &&
    !isExcludedPhone(hintPhone, excludedPhones)
  ) {
    attempts.push({ phone: normalizePhone(hintPhone) });
  }

  const seen = new Set<string>();
  for (const rawId of recipientIds) {
    const peer = rawId?.trim();
    if (!peer || !/^\d+$/.test(peer) || looksLikePhoneNumber(peer) || seen.has(peer)) {
      continue;
    }
    seen.add(peer);
    attempts.push({ recipient: peer });
  }

  return attempts;
}

/** Query params for GET /sync/contact/get — MAX supports recipient (id) or phone */
export function buildContactGetParams(
  chatId: string,
  messengerType: string,
  hintPhone?: string | null,
  excludedPhones: string[] = [],
  recipientIds: (string | null | undefined)[] = [],
): WappiContactGetParams {
  if (messengerType === 'MAX') {
    const attempts = buildMaxContactGetAttempts(
      hintPhone,
      recipientIds,
      excludedPhones,
    );
    return attempts[0] ?? {};
  }

  return { recipient: wappiContactRecipient(chatId, messengerType) };
}

function mergeWappiDialogRow(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>,
  normId: string,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...existing, ...incoming, id: normId };
  for (const field of ['phone', 'number', 'contact_phone'] as const) {
    const kept = readContactPhoneField(existing[field], []);
    const next = readContactPhoneField(incoming[field], []);
    if (kept && !next) merged[field] = existing[field];
  }
  return merged;
}

/** MAX "Избранное" / saved messages — not a contact dialog. */
export function isMaxFavoritesDialog(chatId: string, chat?: Record<string, unknown>): boolean {
  if (chatId === '0') return true;
  const name = String(chat?.name ?? '').trim();
  return name === 'Избранное';
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
      existing
        ? mergeWappiDialogRow(existing, chat, norm)
        : { ...chat, id: norm },
    );
  }

  return [...byNorm.values()];
}

function dialogParticipantsOtherThanMe(
  chat: Record<string, unknown>,
): Record<string, unknown>[] {
  const raw = chat.participants;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is Record<string, unknown> =>
      Boolean(item) &&
      typeof item === 'object' &&
      (item as Record<string, unknown>).is_me !== true,
  );
}

/**
 * Peer user id from GET /sync/chats/get dialog row (`participants`, non-me side).
 * Complements message-based peer id when history is outbound-only.
 */
export function resolveMaxPeerUserIdFromDialogParticipants(
  chat: Record<string, unknown>,
): string | null {
  for (const participant of dialogParticipantsOtherThanMe(chat)) {
    const id = String(participant.user_id ?? '').trim();
    if (!id || !/^\d+$/.test(id)) continue;
    if (looksLikePhoneNumber(id)) continue;
    return id;
  }
  return null;
}

/** Avatar URL from Wappi dialog row (`image` / `thumbnail`). */
export function readContactAvatarFromChat(
  chat: Record<string, unknown>,
): string | null {
  for (const field of ['image', 'thumbnail', 'avatar', 'photo'] as const) {
    const value = chat[field];
    if (typeof value === 'string' && value.startsWith('http')) return value.trim();
  }
  const contact = chat.contact;
  if (contact && typeof contact === 'object') {
    const data = contact as Record<string, unknown>;
    for (const field of ['baseUrl', 'photo', 'avatar'] as const) {
      const value = data[field];
      if (typeof value === 'string' && value.startsWith('http')) return value.trim();
    }
  }
  return null;
}

/** Phone from chat list row (Wappi dialogs): `phone` field and `participants[].phone`. */
export function readPhoneFromChatMetadata(
  chat: Record<string, unknown>,
  excludedPhones: string[],
): string | null {
  for (const field of ['phone', 'number', 'contact_phone'] as const) {
    const phone = readContactPhoneField(chat[field], excludedPhones);
    if (phone) return phone;
  }

  for (const participant of dialogParticipantsOtherThanMe(chat)) {
    const phone = readContactPhoneField(participant.phone, excludedPhones);
    if (phone) return phone;
  }

  return null;
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
    const rawPhone = data.phone ?? data.number;
    contactPhone = readContactPhoneField(rawPhone, excludedPhones);
    if (!contactPhone && typeof rawPhone === 'number') {
      contactPhone = readContactPhoneField(String(rawPhone), excludedPhones);
    }
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

  // MAX uses bare dialog/user ids only — @c.us is WhatsApp-specific.
  if (messengerType === 'MAX') {
    add(bare);
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
