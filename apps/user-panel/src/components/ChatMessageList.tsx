import { useEffect, useRef, useState, useCallback } from 'react';
import { MessageDto } from '@fintech/shared';
import { formatDateDivider } from '../utils/format';
import { MessageBubble } from './MessageBubble';

interface ChatMessageListProps {
  messages: MessageDto[];
  token?: string;
  emptyHint?: string;
  hasMore?: boolean;
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
}

function sameDay(a: string, b: string) {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getDate() === db.getDate() &&
    da.getMonth() === db.getMonth() &&
    da.getFullYear() === db.getFullYear()
  );
}

export function ChatMessageList({ 
  messages, 
  token, 
  emptyHint,
  hasMore,
  onLoadMore,
  isLoadingMore
}: ChatMessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isAutoScrolling, setIsAutoScrolling] = useState(true);

  // Scroll to bottom when new messages arrive (if we were at the bottom)
  useEffect(() => {
    if (isAutoScrolling && containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, [messages, isAutoScrolling]);

  // Maintain scroll position when older messages are loaded
  useEffect(() => {
    // With flex-col-reverse, the browser natively maintains scroll position
    // when elements are added to the end of the DOM (which is visually the top)
  }, [messages.length]);

  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    
    // In flex-col-reverse, scrollTop is negative in some browsers or positive in others.
    // To reliably detect if we are near the top (which is visually the top, but logically the end of scroll),
    // we check how far we are from the max scroll.
    const scrollPos = Math.abs(scrollTop);
    const maxScroll = scrollHeight - clientHeight;
    
    // Check if we are near the top (visually) to load more
    if (maxScroll - scrollPos < 100 && hasMore && !isLoadingMore && onLoadMore) {
      onLoadMore();
    }

    // Check if we are at the bottom (visually) to re-enable auto-scroll
    setIsAutoScrolling(scrollPos < 50);
  }, [hasMore, isLoadingMore, onLoadMore]);

  if (!messages.length && emptyHint) {
    return (
      <div className="flex flex-1 items-center justify-center px-8 text-center">
        <div className="max-w-sm">
          <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-[var(--tg-input)] flex items-center justify-center text-3xl opacity-80">
            ✉️
          </div>
          <p className="text-[15px] text-[var(--tg-text-secondary)] leading-relaxed">{emptyHint}</p>
        </div>
      </div>
    );
  }

  let lastDateKey = '';

  return (
    <div 
      className="flex-1 overflow-y-auto px-3 py-2 flex flex-col-reverse" 
      ref={containerRef}
      onScroll={handleScroll}
    >
      <div className="mx-auto w-full max-w-3xl space-y-0.5 flex flex-col-reverse">
        {messages.map((message, index) => {
          const prev = messages[index + 1]; // Because array is reversed, older is next
          const next = messages[index - 1]; // newer is prev
          const dateKey = message.createdAt.slice(0, 10);
          const prevDateKey = prev ? prev.createdAt.slice(0, 10) : '';
          const showDate = dateKey !== prevDateKey;

          const groupedWithPrev =
            prev &&
            prev.direction === message.direction &&
            sameDay(prev.createdAt, message.createdAt);
          const groupedWithNext =
            next &&
            next.direction === message.direction &&
            sameDay(next.createdAt, message.createdAt);

          return (
            <div key={message.id} className="flex flex-col-reverse">
              <MessageBubble
                message={message}
                token={token}
                isFirstInGroup={!groupedWithPrev}
                isLastInGroup={!groupedWithNext}
              />
              {showDate && (
                <div className="flex justify-center py-3">
                  <span className="rounded-full bg-black/25 px-3 py-1 text-xs text-white/75 backdrop-blur-sm">
                    {formatDateDivider(message.createdAt)}
                  </span>
                </div>
              )}
            </div>
          );
        })}
        {isLoadingMore && (
          <div className="flex justify-center py-2">
            <div className="h-6 w-6 rounded-full border-2 border-[var(--tg-accent)] border-t-transparent animate-spin" />
          </div>
        )}
      </div>
    </div>
  );
}
