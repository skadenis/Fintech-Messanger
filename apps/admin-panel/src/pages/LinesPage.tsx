import { useEffect, useState } from 'react';
import { MessengerType, Role } from '@fintech/shared';
import { getLines, getGroups, createLine, updateLine, deleteLine } from '../api';
import { MessageCircle, Edit2, Trash2, Search } from 'lucide-react';
import { useOutletContext } from 'react-router-dom';

export function LinesPage() {
  const { auth, error, setError, refreshKey, triggerRefresh } = useOutletContext<any>();
  const [lines, setLines] = useState<Array<any>>([]);
  const [groups, setGroups] = useState<Array<any>>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [messengerFilter, setMessengerFilter] = useState<MessengerType | 'ALL'>('ALL');

  // Modals
  const [isLineModalOpen, setIsLineModalOpen] = useState(false);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);

  const [lineForm, setLineForm] = useState({
    name: '',
    messengerType: MessengerType.WHATSAPP,
    wappiProfileId: '',
    wappiApiToken: '',
  });

  useEffect(() => {
    Promise.all([getLines(auth.token), getGroups(auth.token)])
      .then(([l, g]) => {
        setLines(l);
        setGroups(g);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [auth.token, refreshKey]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isLineModalOpen) closeLineModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLineModalOpen]);

  const openCreateModal = () => {
    setEditingLineId(null);
    setLineForm({ name: '', messengerType: MessengerType.WHATSAPP, wappiProfileId: '', wappiApiToken: '' });
    setIsLineModalOpen(true);
  };

  const handleEditLine = (line: any) => {
    setEditingLineId(line.id);
    setLineForm({
      name: line.name,
      messengerType: line.messengerType,
      wappiProfileId: line.wappiProfileId,
      wappiApiToken: '', // Don't show the real token
    });
    setIsLineModalOpen(true);
  };

  const closeLineModal = () => {
    setIsLineModalOpen(false);
    setEditingLineId(null);
  };

  const handleSaveLine = async () => {
    try {
      if (editingLineId) {
        const updateData = { ...lineForm };
        if (!updateData.wappiApiToken) delete (updateData as any).wappiApiToken;
        await updateLine(auth.token, editingLineId, updateData);
      } else {
        await createLine(auth.token, lineForm);
      }
      closeLineModal();
      triggerRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error saving line');
    }
  };

  const handleDeleteLine = async (line: any) => {
    if (confirm(`Удалить линию ${line.name}? Все диалоги и сообщения этой линии будут удалены.`)) {
      try {
        await deleteLine(auth.token, line.id);
        triggerRefresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error deleting line');
      }
    }
  };

  const inputClass = "w-full rounded-xl bg-[var(--tg-input)] border border-transparent focus:border-[var(--tg-accent)] px-3 py-2.5 text-[14px] text-[var(--tg-text)] outline-none transition-colors";
  const btnClass = "rounded-xl bg-[var(--tg-accent)] hover:bg-[var(--tg-accent-hover)] px-4 py-2.5 text-[14px] text-white font-medium transition-colors flex items-center justify-center gap-2";

  const filteredLines = lines.filter(l => 
    (messengerFilter === 'ALL' || l.messengerType === messengerFilter) &&
    (l.name.toLowerCase().includes(search.toLowerCase()) || l.wappiProfileId.includes(search))
  );

  if (loading) return <div className="text-[var(--tg-text-secondary)]">Загрузка...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Линии Wappi</h1>
        <button onClick={openCreateModal} className={btnClass}>
          <MessageCircle size={16} />
          Создать
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-2">
          <button 
            onClick={() => setMessengerFilter('ALL')} 
            className={`px-4 py-2 rounded-xl text-[13px] font-medium transition-colors ${messengerFilter === 'ALL' ? 'bg-[var(--tg-accent)] text-white' : 'bg-[var(--tg-surface)] border border-[var(--tg-border)] text-[var(--tg-text-secondary)] hover:text-[var(--tg-text)]'}`}
          >
            Все
          </button>
          <button 
            onClick={() => setMessengerFilter(MessengerType.WHATSAPP)} 
            className={`px-4 py-2 rounded-xl text-[13px] font-medium transition-colors flex items-center gap-2 ${messengerFilter === MessengerType.WHATSAPP ? 'bg-[var(--tg-accent)] text-white' : 'bg-[var(--tg-surface)] border border-[var(--tg-border)] text-[var(--tg-text-secondary)] hover:text-[var(--tg-text)]'}`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
            WhatsApp
          </button>
          <button 
            onClick={() => setMessengerFilter(MessengerType.TELEGRAM)} 
            className={`px-4 py-2 rounded-xl text-[13px] font-medium transition-colors flex items-center gap-2 ${messengerFilter === MessengerType.TELEGRAM ? 'bg-[var(--tg-accent)] text-white' : 'bg-[var(--tg-surface)] border border-[var(--tg-border)] text-[var(--tg-text-secondary)] hover:text-[var(--tg-text)]'}`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z"></path><path d="M22 2 11 13"></path></svg>
            Telegram
          </button>
          <button 
            onClick={() => setMessengerFilter(MessengerType.MAX)} 
            className={`px-4 py-2 rounded-xl text-[13px] font-medium transition-colors flex items-center gap-2 ${messengerFilter === MessengerType.MAX ? 'bg-[var(--tg-accent)] text-white' : 'bg-[var(--tg-surface)] border border-[var(--tg-border)] text-[var(--tg-text-secondary)] hover:text-[var(--tg-text)]'}`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path></svg>
            MAX
          </button>
        </div>

        <div className="flex-1 flex items-center gap-3 bg-[var(--tg-surface)] p-2 rounded-xl border border-[var(--tg-border)]">
          <Search size={18} className="text-[var(--tg-text-secondary)] ml-2" />
          <input 
            className="bg-transparent border-none outline-none text-[14px] text-[var(--tg-text)] w-full placeholder:text-[var(--tg-text-secondary)] py-1"
            placeholder="Поиск линий по названию или Profile ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="bg-[var(--tg-surface)] rounded-2xl border border-[var(--tg-border)] overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[14px]">
            <thead className="bg-[var(--tg-input)]/50 text-[var(--tg-text-secondary)] border-b border-[var(--tg-border)]">
              <tr>
                <th className="px-4 py-3 font-medium whitespace-nowrap">Название</th>
                <th className="px-4 py-3 font-medium whitespace-nowrap">Тип</th>
                <th className="px-4 py-3 font-medium whitespace-nowrap">Profile ID</th>
                <th className="px-4 py-3 font-medium text-right whitespace-nowrap">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--tg-border)]">
              {filteredLines.map((line) => (
                <tr key={line.id} className="hover:bg-[var(--tg-input)]/30 transition-colors group">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-[var(--tg-input)] flex items-center justify-center text-[var(--tg-accent)] shrink-0">
                        <MessageCircle size={16} />
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-[14px] truncate">{line.name}</div>
                        <div className="text-[11px] text-[var(--tg-text-secondary)] font-mono truncate">{line.id}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[13px]">
                    <div className="flex items-center gap-2 bg-[var(--tg-input)] px-2.5 py-1.5 rounded-lg border border-[var(--tg-border)] w-fit">
                      {line.messengerType === 'WHATSAPP' && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>}
                      {line.messengerType === 'TELEGRAM' && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z"></path><path d="M22 2 11 13"></path></svg>}
                      {line.messengerType === 'MAX' && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path></svg>}
                      <span className="text-[var(--tg-text)] font-medium">{line.messengerType}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[13px] font-mono text-[var(--tg-text-secondary)]">
                    {line.wappiProfileId}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleEditLine(line)}
                        className="w-8 h-8 rounded-full hover:bg-[var(--tg-input)] hover:text-[var(--tg-accent)] flex items-center justify-center transition-colors"
                        title="Редактировать"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => handleDeleteLine(line)}
                        className="w-8 h-8 rounded-full hover:bg-[var(--tg-input)] hover:text-[var(--tg-danger)] flex items-center justify-center transition-colors"
                        title="Удалить"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredLines.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-[var(--tg-text-secondary)]">
                    Линии не найдены
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create/Edit Line Modal */}
      {isLineModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--tg-surface)] rounded-2xl w-full max-w-lg shadow-xl border border-[var(--tg-border)] flex flex-col">
            <div className="p-5 border-b border-[var(--tg-border)] flex justify-between items-center">
              <h3 className="font-semibold text-lg">{editingLineId ? 'Редактировать линию' : 'Новая линия'}</h3>
              <button onClick={closeLineModal} className="text-[var(--tg-text-secondary)] hover:text-[var(--tg-text)]">✕</button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-[12px] text-[var(--tg-text-secondary)] mb-1.5 ml-1">Название (например: Основная линия)</label>
                  <input className={inputClass} placeholder="Название" value={lineForm.name} onChange={(e) => setLineForm({ ...lineForm, name: e.target.value })} />
                </div>
                <div>
                  <label className="block text-[12px] text-[var(--tg-text-secondary)] mb-1.5 ml-1">Тип мессенджера</label>
                  <select className={inputClass} value={lineForm.messengerType} onChange={(e) => setLineForm({ ...lineForm, messengerType: e.target.value as MessengerType })}>
                    <option value={MessengerType.WHATSAPP}>WhatsApp</option>
                    <option value={MessengerType.TELEGRAM}>Telegram</option>
                    <option value={MessengerType.MAX}>MAX</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[12px] text-[var(--tg-text-secondary)] mb-1.5 ml-1">Wappi Profile ID</label>
                  <input className={inputClass} placeholder="Profile ID" value={lineForm.wappiProfileId} onChange={(e) => setLineForm({ ...lineForm, wappiProfileId: e.target.value })} />
                </div>
                <div className="col-span-2">
                  <label className="block text-[12px] text-[var(--tg-text-secondary)] mb-1.5 ml-1">Wappi API Token</label>
                  <input className={inputClass} placeholder={editingLineId ? "Оставьте пустым, чтобы не менять" : "API Token"} value={lineForm.wappiApiToken} onChange={(e) => setLineForm({ ...lineForm, wappiApiToken: e.target.value })} />
                </div>
              </div>
            </div>
            <div className="p-5 border-t border-[var(--tg-border)] flex justify-end gap-3">
              <button className="px-4 py-2.5 rounded-xl text-[14px] text-[var(--tg-text)] hover:bg-[var(--tg-input)] transition-colors font-medium" onClick={closeLineModal}>Отмена</button>
              <button className={btnClass} onClick={handleSaveLine}>{editingLineId ? 'Сохранить' : 'Создать'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
