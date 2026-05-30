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

const WAPPI_PLACEHOLDER_TYPE: Record<string, string> = {
  audio: 'audio',
  document: 'document',
  image: 'image',
  video: 'video',
  sticker: 'sticker',
  ptt: 'ptt',
  voice: 'ptt',
  file: 'file',
  collection: 'image',
  photo: 'image',
  picture: 'image',
  attachment: 'document',
};

/** Wappi/MAX media stub in `body` or `last_message_data`, e.g. `[audio]`, `[document]`. */
export function isWappiMediaPlaceholder(value: string | null | undefined): boolean {
  if (!value) return false;
  return /^\[[a-z_]+\]$/i.test(value.trim());
}

export function mediaTypeFromWappiPlaceholder(
  value: string | null | undefined,
): string | null {
  if (!value || !isWappiMediaPlaceholder(value)) return null;
  const key = value.trim().slice(1, -1).toLowerCase();
  return WAPPI_PLACEHOLDER_TYPE[key] ?? 'file';
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

const WAPPI_ATTACH_TYPE: Record<string, string> = {
  PHOTO: 'image',
  IMAGE: 'image',
  VIDEO: 'video',
  AUDIO: 'audio',
  PTT: 'ptt',
  VOICE: 'ptt',
  FILE: 'document',
  DOCUMENT: 'document',
  STICKER: 'sticker',
};

function mediaTypeFromWappiAttach(attach: Record<string, unknown>): string | null {
  const raw = asString(attach.type);
  if (!raw) return null;
  return WAPPI_ATTACH_TYPE[raw.toUpperCase()] ?? null;
}

/** MAX/TG/WA: file_link, attaches[].url, s3Info.url, thumbnail, … */
export function extractMediaUrlFromPayload(
  data: Record<string, unknown>,
): string | null {
  for (const field of [
    'file_link',
    'fileLink',
    'url',
    'picture',
    'image',
  ] as const) {
    const value = asString(data[field]);
    if (value?.startsWith('http')) return value;
  }

  const thumb = asString(data.thumbnail);
  if (thumb?.startsWith('http') && !thumb.includes('/t_')) {
    return thumb;
  }

  const s3Info = data.s3Info;
  if (s3Info && typeof s3Info === 'object') {
    const s3Url = asString((s3Info as Record<string, unknown>).url);
    if (s3Url?.startsWith('http')) return s3Url;
  }

  const attaches = data.attaches;
  if (Array.isArray(attaches)) {
    for (const item of attaches) {
      if (!item || typeof item !== 'object') continue;
      const attach = item as Record<string, unknown>;
      for (const field of ['url', 'baseUrl', 'file_link'] as const) {
        const value = asString(attach[field]);
        if (value?.startsWith('http')) return value;
      }
    }
  }

  return null;
}

export function inferMediaTypeFromPayload(data: Record<string, unknown>): string | null {
  const attaches = data.attaches;
  if (Array.isArray(attaches)) {
    for (const item of attaches) {
      if (!item || typeof item !== 'object') continue;
      const fromAttach = mediaTypeFromWappiAttach(item as Record<string, unknown>);
      if (fromAttach) return fromAttach;
    }
  }
  const mime = asString(data.mimetype) ?? asString(data.mimeType);
  if (mime?.startsWith('image/')) return 'image';
  if (mime?.startsWith('video/')) return 'video';
  if (mime?.startsWith('audio/')) return 'audio';
  return null;
}

export function parseMediaFromPayload(payload: unknown): ParsedMedia {
  const data = (payload ?? {}) as Record<string, unknown>;
  const rawBody = asString(data.body);
  const placeholderType = mediaTypeFromWappiPlaceholder(rawBody);
  let type = normalizeMessageType(asString(data.type));
  const attachType = inferMediaTypeFromPayload(data);
  if (attachType && (type === 'text' || !isMediaMessageType(type))) {
    type = attachType;
  }
  if (placeholderType && (type === 'text' || !isMediaMessageType(type))) {
    type = placeholderType;
  }
  const caption = asString(data.caption) ?? asString(data.title);
  const fileName = asString(data.file_name) ?? asString(data.fileName);
  const mimeType = asString(data.mimetype) ?? asString(data.mimeType);
  const mediaUrl = extractMediaUrlFromPayload(data);
  const previewUrl =
    asString(data.thumbnail)?.startsWith('http') ? asString(data.thumbnail) : mediaUrl;

  let body: string | null = null;
  if (isWappiMediaPlaceholder(rawBody)) {
    body = null;
  } else if (type === 'text' || !isMediaMessageType(type)) {
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
  const placeholderType = mediaTypeFromWappiPlaceholder(message.body);
  const type = placeholderType ?? normalizeMessageType(message.type);
  switch (type) {
    case 'collection':
      return '📎 Вложение';
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
    default: {
      if (isWappiMediaPlaceholder(message.body)) {
        return messagePreviewLabel({
          ...message,
          type: mediaTypeFromWappiPlaceholder(message.body) ?? 'file',
          body: null,
        });
      }
      return message.body ?? message.caption ?? '';
    }
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
  const raw =
    message.rawPayload && typeof message.rawPayload === 'object'
      ? (message.rawPayload as Record<string, unknown>)
      : {};
  const parsed = parseMediaFromPayload({
    ...raw,
    type: message.type,
    body: message.body,
    caption: message.caption,
    file_name: message.fileName,
    mimetype: message.mimeType,
    file_link: message.mediaUrl,
  });

  return {
    id: message.id,
    conversationId: message.conversationId,
    direction: message.direction as MessageDto['direction'],
    source: message.source as MessageDto['source'],
    type: parsed.type,
    body: parsed.body,
    caption: parsed.caption,
    fileName: parsed.fileName,
    mimeType: parsed.mimeType,
    mediaUrl: message.mediaUrl ?? parsed.mediaUrl,
    reaction: message.reaction ?? null,
    status: message.status as MessageDto['status'],
    createdAt: message.createdAt.toISOString(),
    senderName: message.senderUser?.name ?? null,
  };
}
