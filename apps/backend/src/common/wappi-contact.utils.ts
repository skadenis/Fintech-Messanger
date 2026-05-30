import {
  extractPhoneFromChatId,
  isLinePhone,
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
): WappiContactGetParams {
  if (messengerType === 'MAX') {
    const bareId = chatId.replace('@c.us', '').replace('@s.whatsapp.net', '').trim();
    const normalizedHint =
      hintPhone && looksLikePhoneNumber(hintPhone) ? normalizePhone(hintPhone) : null;

    if (bareId && looksLikePhoneNumber(bareId)) {
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
  lineProfileId: string,
): string | null {
  const raw =
    typeof value === 'number'
      ? String(value)
      : typeof value === 'string'
        ? value.trim()
        : '';
  if (!raw || !looksLikePhoneNumber(raw) || isLinePhone(raw, lineProfileId)) {
    return null;
  }
  return normalizePhone(raw);
}

export function parseWappiContactResponse(
  response: Record<string, unknown> | null | undefined,
  lineProfileId: string,
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
    contactPhone = readContactPhoneField(data.phone, lineProfileId);
  } else {
    contactPhone = readContactPhoneField(data.number, lineProfileId);
    if (!contactPhone && messengerType === 'WHATSAPP' && contactId) {
      const fromId = extractPhoneFromChatId(
        contactId.includes('@') ? contactId : `${contactId}@c.us`,
        'WHATSAPP',
      );
      if (fromId && !isLinePhone(fromId, lineProfileId)) {
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
