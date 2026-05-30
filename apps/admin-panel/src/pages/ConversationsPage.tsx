import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AdminConversationDto } from '@fintech/shared';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { Search } from 'lucide-react';
import { getConversationsPage } from '../api';
import { ContactAvatar } from '../components/ContactAvatar';
import { formatPhoneDisplay } from '../utils/phone';

const PAGE_SIZE = 40;

export function ConversationsPage() {
  const navigate = useNavigate();
  const { auth, setError } = useOutletContext<{
    auth: { token: string };
    setError: (msg: string | null) => void;
  }>();

  const [items, setItems] = useState<AdminConversationDto[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const sentinelRef = useRef<HTMLTableRowElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const loadPage = useCallback(
    async (nextCursor?: string | null, append = false) => {
      try {
        const data = await getConversationsPage(auth.token, {
          limit: PAGE_SIZE,
          cursor: nextCursor ?? undefined,
          search: debouncedSearch || undefined,
        });
        setItems((prev) => (append ? [...prev, ...data.items] : data.items));
        setTotal(data.total);
        setHasMore(data.hasMore);
        setCursor(data.nextCursor);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Не удалось загрузить диалоги');
      }
    },
    [auth.token, debouncedSearch, setError],
  );

  useEffect(() => {
    setLoading(true);
    setItems([]);
    setCursor(null);
    loadPage().finally(() => setLoading(false));
  }, [debouncedSearch, loadPage]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore || loading || loadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting || !hasMore || loadingMore || !cursor) return;
        setLoadingMore(true);
        loadPage(cursor, true).finally(() => setLoadingMore(false));
      },
      { rootMargin: '200px' },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [cursor, hasMore, loadPage, loading, loadingMore]);

  const inputClass =
    'w-full rounded-xl bg-[var(--tg-input)] border border-transparent focus:border-[var(--tg-accent)] px-3 py-2.5 text-[14px] text-[var(--tg-text)] outline-none transition-colors';

  const shownLabel = useMemo(() => {
    if (loading) return 'Загрузка…';
    return `Показано ${items.length} из ${total}`;
  }, [items.length, loading, total]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-semibold">Все диалоги</h1>
        <span className="text-[13px] text-[var(--tg-text-secondary)]">{shownLabel}</span>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--tg-text-secondary)]"
            size={18}
            aria-hidden
          />
          <input
            type="text"
            placeholder="Поиск по имени, телефону, линии или ID чата..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`${inputClass} pl-10`}
          />
        </div>
      </div>

      <div className="bg-[var(--tg-surface)] rounded-2xl border border-[var(--tg-border)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--tg-border)] text-[13px] text-[var(--tg-text-secondary)] font-medium">
                <th className="px-5 py-3">Клиент</th>
                <th className="px-5 py-3">Телефон</th>
                <th className="px-5 py-3">Линия</th>
                <th className="px-5 py-3">ID в Битрикс</th>
                <th className="px-5 py-3">Сообщений</th>
                <th className="px-5 py-3">Последнее сообщение</th>
              </tr>
            </thead>
            <tbody className="text-[14px]">
              {!loading && items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-[var(--tg-text-secondary)]">
                    Диалоги не найдены
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/conversations/${item.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        navigate(`/conversations/${item.id}`);
                      }
                    }}
                    className="border-b border-[var(--tg-border)] last:border-0 hover:bg-[var(--tg-input)]/50 transition-colors cursor-pointer"
                  >
                    <td className="px-5 py-3 font-medium">
                      <div className="flex items-center gap-3">
                        <ContactAvatar
                          name={item.contactName}
                          avatarUrl={item.contactAvatarUrl}
                          size="sm"
                        />
                        <span>
                          {item.contactName || (
                            <span className="text-[var(--tg-text-secondary)]">Без имени</span>
                          )}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      {item.contactPhone ? (
                        item.contactPhone
                      ) : (
                        <span className="text-[var(--tg-text-secondary)]">Нет телефона</span>
                      )}
                      <div className="text-[11px] text-[var(--tg-text-secondary)] mt-0.5">
                        {item.wappiChatId}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      {formatPhoneDisplay(item.lineProfileId)}
                      <div className="text-[11px] text-[var(--tg-text-secondary)] mt-0.5">
                        {item.messengerType}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      {item.bitrixContactId ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[12px] font-medium bg-blue-500/10 text-blue-400">
                          ID: {item.bitrixContactId}
                        </span>
                      ) : (
                        <span className="text-[var(--tg-text-secondary)]">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3">{item.messagesCount}</td>
                    <td className="px-5 py-3 text-[var(--tg-text-secondary)]">
                      {new Date(item.lastMessageAt).toLocaleString('ru-RU', {
                        day: '2-digit',
                        month: '2-digit',
                        year: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                  </tr>
                ))
              )}
              {hasMore && (
                <tr ref={sentinelRef}>
                  <td colSpan={6} className="px-5 py-4 text-center text-[var(--tg-text-secondary)] text-[13px]">
                    {loadingMore ? 'Загрузка…' : ''}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
