import { useCallback, useEffect, useRef, useState } from 'react';
import { AdminConversationDto, MessageDto } from '@fintech/shared';
import { ArrowLeft } from 'lucide-react';
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { getConversation, getConversationMessages } from '../api';
import { AdminMessageMedia, ADMIN_MEDIA_TYPES } from '../components/AdminMessageMedia';
import { ContactAvatar } from '../components/ContactAvatar';
import { Linkify } from '../components/Linkify';
import { formatPhoneDisplay } from '../utils/phone';

export function ConversationDetailPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const navigate = useNavigate();
  const { auth, setError } = useOutletContext<{
    auth: { token: string };
    setError: (msg: string | null) => void;
  }>();

  const [conversation, setConversation] = useState<AdminConversationDto | null>(null);
  const [messages, setMessages] = useState<MessageDto[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const topSentinelRef = useRef<HTMLDivElement>(null);

  const loadMessages = useCallback(
    async (nextCursor?: string | null, append = false) => {
      if (!conversationId) return;
      try {
        const page = await getConversationMessages(
          auth.token,
          conversationId,
          50,
          nextCursor ?? undefined,
        );
        setMessages((prev) => {
          const merged = append ? [...page.messages.reverse(), ...prev] : [...page.messages].reverse();
          const seen = new Set<string>();
          return merged.filter((m) => {
            if (seen.has(m.id)) return false;
            seen.add(m.id);
            return true;
          });
        });
        setHasMore(page.hasMore);
        setCursor(page.nextCursor);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Не удалось загрузить сообщения');
      }
    },
    [auth.token, conversationId, setError],
  );

  useEffect(() => {
    if (!conversationId) return;
    (async () => {
      try {
        const [conv] = await Promise.all([
          getConversation(auth.token, conversationId),
          loadMessages(),
        ]);
        setConversation(conv);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Диалог не найден');
      } finally {
        setLoading(false);
      }
    })();
  }, [auth.token, conversationId, loadMessages, setError]);

  useEffect(() => {
    const node = topSentinelRef.current;
    if (!node || !hasMore || loadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting || !hasMore || loadingMore || !cursor) return;
        setLoadingMore(true);
        loadMessages(cursor, true).finally(() => setLoadingMore(false));
      },
      { rootMargin: '120px' },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [cursor, hasMore, loadMessages, loadingMore]);

  if (loading) {
    return <div className="text-[var(--tg-text-secondary)]">Загрузка диалога...</div>;
  }

  if (!conversation) {
    return (
      <div className="space-y-4">
        <p className="text-[var(--tg-text-secondary)]">Диалог не найден</p>
        <Link to="/conversations" className="text-[var(--tg-accent)]">
          ← К списку
        </Link>
      </div>
    );
  }

  const title = conversation.contactName || conversation.contactPhone || conversation.wappiChatId;

  return (
    <div className="space-y-4 flex flex-col min-h-[calc(100vh-8rem)]">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/conversations')}
          className="p-2 rounded-xl hover:bg-[var(--tg-input)] text-[var(--tg-text-secondary)]"
          aria-label="Назад"
        >
          <ArrowLeft size={20} />
        </button>
        <ContactAvatar
          name={conversation.contactName}
          avatarUrl={conversation.contactAvatarUrl}
          size="md"
        />
        <div className="min-w-0">
          <h1 className="text-xl font-semibold truncate">{title}</h1>
          <p className="text-[13px] text-[var(--tg-text-secondary)]">
            {conversation.contactPhone ?? 'Нет телефона'} · {formatPhoneDisplay(conversation.lineProfileId)} ·{' '}
            {conversation.messengerType}
          </p>
        </div>
      </div>

      <div className="flex-1 bg-[var(--tg-surface)] rounded-2xl border border-[var(--tg-border)] overflow-hidden flex flex-col">
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {hasMore && (
            <div ref={topSentinelRef} className="text-center text-[12px] text-[var(--tg-text-secondary)] py-2">
              {loadingMore ? 'Загрузка…' : 'Прокрутите вверх для старых сообщений'}
            </div>
          )}
          {messages.length === 0 ? (
            <p className="text-center text-[var(--tg-text-secondary)] py-8">Сообщений нет</p>
          ) : (
            messages.map((msg) => {
              const outgoing = msg.direction === 'OUTGOING';
              const showAsMedia = ADMIN_MEDIA_TYPES.has(msg.type);
              const textContent = msg.body ?? msg.caption ?? '';

              return (
                <div
                  key={msg.id}
                  className={`flex ${outgoing ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3 py-2 text-[14px] ${
                      outgoing
                        ? 'bg-[var(--tg-accent)]/15 border border-[var(--tg-accent)]/20'
                        : 'bg-[var(--tg-input)] border border-[var(--tg-border)]'
                    }`}
                  >
                    {showAsMedia ? (
                      <AdminMessageMedia message={msg} token={auth.token} />
                    ) : textContent ? (
                      <p className="whitespace-pre-wrap break-words">
                        <Linkify>{textContent}</Linkify>
                      </p>
                    ) : null}
                    {msg.caption && showAsMedia && (
                      <p className="mt-1 text-[13px] whitespace-pre-wrap break-words">
                        <Linkify>{msg.caption}</Linkify>
                      </p>
                    )}
                    <p className="text-[11px] text-[var(--tg-text-secondary)] mt-1 text-right">
                      {new Date(msg.createdAt).toLocaleString('ru-RU', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
