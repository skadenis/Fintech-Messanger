import { useEffect, useState } from 'react';
import { MessageDto } from '@fintech/shared';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

const MEDIA_TYPES = new Set([
  'image',
  'video',
  'video_note',
  'sticker',
  'document',
  'file',
  'audio',
  'ptt',
]);

export function AdminMessageMedia({
  message,
  token,
}: {
  message: MessageDto;
  token: string;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!MEDIA_TYPES.has(message.type)) {
      setSrc(null);
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;

    fetch(`${API_URL}/api/messages/${message.id}/attachment`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error('attachment failed');
        return res.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setSrc(null);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [message.id, message.mediaUrl, message.type, token]);

  if (!src) {
    return (
      <span className="text-[13px] text-[var(--tg-text-secondary)]">
        {message.caption || message.fileName || 'Загрузка…'}
      </span>
    );
  }

  if (message.type === 'audio' || message.type === 'ptt') {
    return <audio src={src} controls className="w-full max-w-xs h-9" />;
  }

  if (message.type === 'image' || message.type === 'sticker') {
    return (
      <img
        src={src}
        alt=""
        className="max-w-xs max-h-64 rounded-lg object-contain"
        loading="lazy"
        referrerPolicy="no-referrer"
      />
    );
  }

  if (message.type === 'video') {
    return <video src={src} controls className="max-w-xs max-h-64 rounded-lg" />;
  }

  return (
    <a href={src} target="_blank" rel="noreferrer" className="text-[var(--tg-accent)] underline text-[13px]">
      {message.fileName ?? 'Открыть файл'}
    </a>
  );
}
