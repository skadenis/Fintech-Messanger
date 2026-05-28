import { useEffect, useState } from 'react';
import { MessageDto, MessageStatus } from '@fintech/shared';
import { API_URL } from '../api';
import { formatMessageTime } from '../utils/format';
import { Linkify } from './Linkify';

function isMediaType(type: string) {
  return ['image', 'video', 'video_note', 'document', 'audio', 'ptt', 'sticker', 'file'].includes(
    type,
  );
}

function useAttachmentSrc(message: MessageDto, token?: string) {
  const [src, setSrc] = useState<string | null>(
    message.mediaUrl?.startsWith('http') ? message.mediaUrl : null,
  );

  useEffect(() => {
    if (message.mediaUrl?.startsWith('http')) {
      setSrc(message.mediaUrl);
      return;
    }

    if (!token || !isMediaType(message.type)) {
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;

    fetch(`${API_URL}/api/messages/${message.id}/attachment`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((response) => {
        if (!response.ok) throw new Error('attachment fetch failed');
        return response.blob();
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

  return src;
}

function StatusIcon({ status, outgoing }: { status: MessageStatus; outgoing: boolean }) {
  if (!outgoing) return null;

  const color =
    status === MessageStatus.READ
      ? '#4fc3f7'
      : status === MessageStatus.ERROR
        ? '#ef5350'
        : 'currentColor';

  return (
    <svg
      width="16"
      height="11"
      viewBox="0 0 16 11"
      fill="none"
      className="inline-block ml-1 opacity-80"
      aria-hidden
    >
      <path
        d="M1 5.5L4.5 9L10 1"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {status !== MessageStatus.PENDING && status !== MessageStatus.ERROR && (
        <path
          d="M5 5.5L8.5 9L14 1"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

function MediaPlaceholder({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 min-w-[200px] py-1">
      <div className="h-10 w-10 rounded-full bg-black/20 flex items-center justify-center">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path d="M14 2v6h6M12 18v-6M9 15h6" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </div>
      <span className="text-[14px] opacity-90">{label}</span>
    </div>
  );
}

function BubbleMeta({
  time,
  status,
  outgoing,
}: {
  time: string;
  status: MessageStatus;
  outgoing: boolean;
}) {
  return (
    <span className="float-right ml-3 mt-1 flex items-end gap-0.5 text-[11px] leading-none opacity-60 select-none">
      <span>{time}</span>
      <StatusIcon status={status} outgoing={outgoing} />
    </span>
  );
}

export function MessageBubble({
  message,
  token,
  isFirstInGroup = true,
  isLastInGroup = true,
}: {
  message: MessageDto;
  token?: string;
  isFirstInGroup?: boolean;
  isLastInGroup?: boolean;
}) {
  const outgoing = message.direction === 'OUTGOING';
  const attachmentSrc = useAttachmentSrc(message, token);
  const type = message.type;
  const time = formatMessageTime(message.createdAt);

  const radius = outgoing
    ? `rounded-2xl ${isFirstInGroup ? 'rounded-tr-md' : 'rounded-tr-[4px]'} rounded-br-[4px]`
    : `rounded-2xl ${isFirstInGroup ? 'rounded-tl-md' : 'rounded-tl-[4px]'} rounded-bl-[4px]`;

  const bubbleClass = outgoing
    ? `bg-[var(--tg-bubble-out)] text-white ${radius} ${isLastInGroup ? 'bubble-tail-out' : ''}`
    : `bg-[var(--tg-bubble-in)] text-[var(--tg-text)] ${radius} ${isLastInGroup ? 'bubble-tail-in' : ''}`;

  const renderContent = () => {
    if (type === 'image' || type === 'sticker') {
      if (attachmentSrc) {
        return (
          <img
            src={attachmentSrc}
            alt={message.caption ?? message.fileName ?? 'Изображение'}
            className={`block max-w-full sm:max-w-[320px] max-h-[360px] object-cover ${
              type === 'sticker' ? 'w-36 h-36' : 'rounded-lg'
            }`}
          />
        );
      }
      return <MediaPlaceholder label="Фото" />;
    }

    if (type === 'video' || type === 'video_note') {
      if (attachmentSrc) {
        return (
          <video
            src={attachmentSrc}
            controls
            className={`block max-w-full sm:max-w-[320px] max-h-[360px] bg-black/30 ${
              type === 'video_note'
                ? 'rounded-full aspect-square w-56 h-56 object-cover'
                : 'rounded-lg'
            }`}
          />
        );
      }
      return <MediaPlaceholder label={type === 'video_note' ? 'Кружок' : 'Видео'} />;
    }

    if (type === 'audio' || type === 'ptt') {
      if (attachmentSrc) {
        return (
          <div className="min-w-[220px] py-1">
            <audio src={attachmentSrc} controls className="w-full h-8" />
          </div>
        );
      }
      return <MediaPlaceholder label="Голосовое" />;
    }

    if (type === 'document' || type === 'file') {
      return (
        <a
          href={attachmentSrc ?? '#'}
          target="_blank"
          rel="noreferrer"
          className={`block min-w-[220px] rounded-lg px-1 py-1 ${
            outgoing ? 'hover:bg-white/10' : 'hover:bg-white/5'
          }`}
          onClick={(event) => {
            if (!attachmentSrc) event.preventDefault();
          }}
        >
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-[var(--tg-accent)]/90 flex items-center justify-center shrink-0">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z"
                  stroke="white"
                  strokeWidth="1.5"
                />
                <path d="M14 2v6h6" stroke="white" strokeWidth="1.5" />
              </svg>
            </div>
            <div className="min-w-0">
              <div className="font-medium text-[14px] truncate">
                {message.fileName ?? 'Документ'}
              </div>
              <div className="text-[12px] opacity-70 mt-0.5">Нажмите, чтобы открыть</div>
            </div>
          </div>
        </a>
      );
    }

    return (
      <span className="whitespace-pre-wrap break-words text-[15px] leading-[1.35]">
        <Linkify>{message.body}</Linkify>
        <BubbleMeta time={time} status={message.status} outgoing={outgoing} />
      </span>
    );
  };

  const isMediaWithCaption = (type === 'image' || type === 'video') && message.caption;
  const showMetaBelow = type !== 'text' || isMediaWithCaption;

  return (
    <div
      className={`flex ${outgoing ? 'justify-end' : 'justify-start'} ${
        isFirstInGroup ? 'mt-1.5' : 'mt-0.5'
      }`}
    >
      <div
        className={`relative max-w-[85%] sm:max-w-[520px] px-2.5 py-1.5 shadow-sm ${bubbleClass}`}
      >
        {renderContent()}
        {isMediaWithCaption && (
          <div className="mt-1 whitespace-pre-wrap break-words text-[15px] leading-[1.35]">
            <Linkify>{message.caption}</Linkify>
          </div>
        )}
        {showMetaBelow && (
          <div className="flex justify-end items-center gap-0.5 mt-0.5 text-[11px] opacity-60">
            <span>{time}</span>
            <StatusIcon status={message.status} outgoing={outgoing} />
          </div>
        )}
        {message.reaction && (
          <div
            className={`absolute -bottom-3 ${
              outgoing ? 'left-2' : 'right-2'
            } bg-[var(--tg-bg)] border border-[var(--tg-border)] rounded-full px-1.5 py-0.5 text-[14px] shadow-sm z-10 leading-none`}
          >
            {message.reaction}
          </div>
        )}
      </div>
    </div>
  );
}
