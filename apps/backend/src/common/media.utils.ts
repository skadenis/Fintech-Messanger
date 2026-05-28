import { MessageDto } from '@fintech/shared';

export type ParsedMedia = {
  type: string;
  body: string | null;
  caption: string | null;
  fileName: string | null;
  mimeType: string | null;
  mediaUrl: string | null;
  previewUrl: string | null;
};

const MEDIA_TYPES = new Set([
  'image',
  'video',
  'video_note',
  'document',
  'audio',
  'ptt',
  'voice',
  'sticker',
  'file',
]);

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function isProbablyBase64(value: string): boolean {
  if (value.startsWith('http://') || value.startsWith('https://')) return false;
  if (value.startsWith('data:')) return false;
  if (value.length < 80) return false;
  return /^[A-Za-z0-9+/=\r\n]+$/.test(value.slice(0, 200));
}

export function normalizeMessageType(type?: string | null): string {
  const value = (type ?? 'text').toLowerCase();
  if (value === 'chat') return 'text';
  if (value === 'voice') return 'ptt';
  return value;
}

export function isMediaMessageType(type?: string | null): boolean {
  return MEDIA_TYPES.has(normalizeMessageType(type));
}

export function parseMediaFromPayload(payload: unknown): ParsedMedia {
  const data = (payload ?? {}) as Record<string, unknown>;
  const type = normalizeMessageType(asString(data.type));
  const caption = asString(data.caption) ?? asString(data.title);
  const fileName = asString(data.file_name) ?? asString(data.fileName);
  const mimeType = asString(data.mimetype) ?? asString(data.mimeType);
  const mediaUrl =
    asString(data.file_link) ??
    asString(data.fileLink) ??
    asString(data.thumbnail) ??
    asString(data.picture);
  const previewUrl = asString(data.thumbnail) ?? asString(data.picture) ?? mediaUrl;
  const rawBody = asString(data.body);

  let body: string | null = null;
  if (type === 'text' || !isMediaMessageType(type)) {
    body = rawBody;
  } else if (caption) {
    body = caption;
  } else if (rawBody && !isProbablyBase64(rawBody)) {
    body = rawBody;
  }

  return {
    type,
    body,
    caption,
    fileName,
    mimeType,
    mediaUrl,
    previewUrl,
  };
}

export function messagePreviewLabel(message: {
  type?: string | null;
  body?: string | null;
  fileName?: string | null;
  caption?: string | null;
}): string {
  const type = normalizeMessageType(message.type);
  switch (type) {
    case 'image':
    case 'sticker':
      return '📷 Фото';
    case 'video':
      return '🎬 Видео';
    case 'video_note':
      return '⭕ Кружок';
    case 'audio':
    case 'ptt':
      return '🎤 Аудио';
    case 'document':
    case 'file':
      return `📄 ${message.fileName ?? message.caption ?? 'Документ'}`;
    default:
      return message.body ?? message.caption ?? '';
  }
}

export function mapMessageDto(message: {
  id: string;
  conversationId: string;
  direction: string;
  source: string;
  body: string | null;
  type: string;
  caption?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  mediaUrl?: string | null;
  reaction?: string | null;
  status: string;
  createdAt: Date;
  senderUser?: { name: string } | null;
  rawPayload?: unknown;
}): MessageDto {
  const parsed = parseMediaFromPayload(message.rawPayload);

  return {
    id: message.id,
    conversationId: message.conversationId,
    direction: message.direction as MessageDto['direction'],
    source: message.source as MessageDto['source'],
    type: normalizeMessageType(message.type || parsed.type),
    body: message.body ?? parsed.body,
    caption: message.caption ?? parsed.caption,
    fileName: message.fileName ?? parsed.fileName,
    mimeType: message.mimeType ?? parsed.mimeType,
    mediaUrl: message.mediaUrl ?? parsed.mediaUrl,
    reaction: message.reaction ?? null,
    status: message.status as MessageDto['status'],
    createdAt: message.createdAt.toISOString(),
    senderName: message.senderUser?.name ?? null,
  };
}
