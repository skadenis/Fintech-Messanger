import { useEffect, useMemo, useState } from 'react';
import { AdminConversationDto } from '@fintech/shared';
import { useOutletContext } from 'react-router-dom';
import { Search } from 'lucide-react';
import { getConversations } from '../api';
import { formatPhoneDisplay } from '../utils/phone';

export function ConversationsPage() {
  const { auth, setError } = useOutletContext<{
    auth: { token: string };
    setError: (msg: string | null) => void;
  }>();
  const [items, setItems] = useState<AdminConversationDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      const data = await getConversations(auth.token);
      setItems(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить диалоги');
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    'w-full rounded-xl bg-[var(--tg-input)] border border-transparent focus:border-[var(--tg-accent)] px-3 py-2.5 text-[14px] text-[var(--tg-text)] outline-none transition-colors';

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      const linePhone = formatPhoneDisplay(item.lineProfileId).toLowerCase();
      return (
        item.contactName?.toLowerCase().includes(q) ||
        item.contactPhone?.includes(q) ||
        item.lineName.toLowerCase().includes(q) ||
        item.lineProfileId.includes(q) ||
        linePhone.includes(q) ||
        item.wappiChatId.toLowerCase().includes(q) ||
        item.messengerType.toLowerCase().includes(q)
      );
    });
  }, [items, search]);

  if (loading) {
    return <div className="text-[var(--tg-text-secondary)]">Загрузка...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Все диалоги</h1>
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
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-[var(--tg-text-secondary)]">
                    Диалоги не найдены
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-[var(--tg-border)] last:border-0 hover:bg-[var(--tg-input)]/50 transition-colors"
                  >
                    <td className="px-5 py-3 font-medium">
                      {item.contactName || (
                        <span className="text-[var(--tg-text-secondary)]">Без имени</span>
                      )}
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
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
