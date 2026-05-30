import { useCallback, useEffect, useState } from 'react';
import { MessageDto } from '@fintech/shared';
import { ImageLightbox } from './ImageLightbox';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export const ADMIN_MEDIA_TYPES = new Set([
  'image',
  'video',
  'video_note',
  'sticker',
  'document',
  'file',
  'audio',
  'ptt',
]);

type LoadState = 'idle' | 'loading' | 'ready' | 'error';

export function AdminMessageMedia({
  message,
  token,
}: {
  message: MessageDto;
  token: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [state, setState] = useState<LoadState>('idle');
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  const load = useCallback(() => {
    if (!ADMIN_MEDIA_TYPES.has(message.type)) {
      setState('idle');
      setSrc(null);
      return;
    }

    setState('loading');
    setSrc(null);

    let cancelled = false;
    let objectUrl: string | null = null;

    fetch(`${API_URL}/api/messages/${message.id}/attachment`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error(`attachment ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
        setState('ready');
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [message.id, message.type, token]);

  useEffect(() => load(), [load, retryKey]);

  if (!ADMIN_MEDIA_TYPES.has(message.type)) {
    return null;
  }

  if (state === 'loading' || state === 'idle') {
    return (
      <span className="text-[13px] text-[var(--tg-text-secondary)] animate-pulse">
        {message.caption || message.fileName || 'Загрузка файла…'}
      </span>
    );
  }

  if (state === 'error' || !src) {
    return (
      <button
        type="button"
        onClick={() => setRetryKey((k) => k + 1)}
        className="text-left text-[13px] text-[var(--tg-danger)] hover:underline"
      >
        {message.fileName ?? 'Вложение'} — не удалось загрузить. Нажмите, чтобы повторить.
      </button>
    );
  }

  if (message.type === 'audio' || message.type === 'ptt') {
    return <audio src={src} controls className="w-full max-w-xs h-9" />;
  }

  if (message.type === 'image' || message.type === 'sticker') {
    return (
      <>
        <button
          type="button"
          onClick={() => setLightboxOpen(true)}
          className="block rounded-lg overflow-hidden focus:outline-none focus:ring-2 focus:ring-[var(--tg-accent)]"
          title="Открыть в полном размере"
        >
          <img
            src={src}
            alt={message.caption ?? message.fileName ?? ''}
            className="max-w-xs max-h-64 rounded-lg object-contain cursor-zoom-in hover:opacity-95 transition-opacity"
            loading="lazy"
          />
        </button>
        {lightboxOpen && (
          <ImageLightbox
            src={src}
            alt={message.caption ?? message.fileName ?? ''}
            onClose={() => setLightboxOpen(false)}
          />
        )}
      </>
    );
  }

  if (message.type === 'video' || message.type === 'video_note') {
    return (
      <video
        src={src}
        controls
        className={`max-w-xs max-h-64 bg-black/30 ${
          message.type === 'video_note' ? 'rounded-full aspect-square w-56 h-56 object-cover' : 'rounded-lg'
        }`}
      />
    );
  }

  return (
    <a
      href={src}
      target="_blank"
      rel="noreferrer"
      download={message.fileName ?? undefined}
      className="inline-flex items-center gap-2 text-[var(--tg-accent)] underline text-[13px] hover:opacity-80"
    >
      {message.fileName ?? 'Открыть файл'}
    </a>
  );
}
