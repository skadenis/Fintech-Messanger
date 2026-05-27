import { useEffect, useState } from 'react';
import { getGroups, createGroup, updateGroup, deleteGroup, removeUserFromGroup } from '../api';
import { FolderTree, Search, Edit2, Trash2, Users, UserMinus } from 'lucide-react';
import { useOutletContext } from 'react-router-dom';

export function GroupsPage() {
  const { auth, error, setError, refreshKey, triggerRefresh } = useOutletContext<any>();
  const [groups, setGroups] = useState<Array<any>>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Modals
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [groupForm, setGroupForm] = useState({ name: '', bitrixDepartmentId: '' });
  
  const [viewingGroup, setViewingGroup] = useState<any | null>(null);

  useEffect(() => {
    getGroups(auth.token)
      .then(setGroups)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [auth.token, refreshKey]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isGroupModalOpen) closeGroupModal();
        if (viewingGroup) setViewingGroup(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isGroupModalOpen, viewingGroup]);

  const openCreateModal = () => {
    setEditingGroupId(null);
    setGroupForm({ name: '', bitrixDepartmentId: '' });
    setIsGroupModalOpen(true);
  };

  const handleEditGroup = (group: any) => {
    setEditingGroupId(group.id);
    setGroupForm({ name: group.name, bitrixDepartmentId: group.bitrixDepartmentId || '' });
    setIsGroupModalOpen(true);
  };

  const closeGroupModal = () => {
    setIsGroupModalOpen(false);
    setEditingGroupId(null);
  };

  const handleSaveGroup = async () => {
    try {
      if (editingGroupId) {
        await updateGroup(auth.token, editingGroupId, groupForm);
      } else {
        await createGroup(auth.token, groupForm);
      }
      closeGroupModal();
      triggerRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error saving group');
    }
  };

  const handleDeleteGroup = async (group: any) => {
    if (group._count?.lines > 0) {
      alert('Нельзя удалить группу, к которой привязаны линии. Сначала удалите или перенесите линии.');
      return;
    }
    if (confirm(`Удалить группу "${group.name}"? Все пользователи этой группы останутся без группы.`)) {
      try {
        await deleteGroup(auth.token, group.id);
        triggerRefresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error deleting group');
      }
    }
  };

  const handleRemoveUser = async (groupId: string, userId: string, userName: string) => {
    if (confirm(`Убрать пользователя ${userName} из группы?`)) {
      try {
        await removeUserFromGroup(auth.token, groupId, userId);
        // Update local state to reflect removal without full refresh
        setViewingGroup({
          ...viewingGroup,
          users: viewingGroup.users.filter((u: any) => u.id !== userId)
        });
        triggerRefresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error removing user');
      }
    }
  };

  const inputClass = "w-full rounded-xl bg-[var(--tg-input)] border border-transparent focus:border-[var(--tg-accent)] px-3 py-2.5 text-[14px] text-[var(--tg-text)] outline-none transition-colors";
  const btnClass = "rounded-xl bg-[var(--tg-accent)] hover:bg-[var(--tg-accent-hover)] px-4 py-2.5 text-[14px] text-white font-medium transition-colors flex items-center justify-center gap-2";

  const filteredGroups = groups.filter(g => 
    g.name.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div className="text-[var(--tg-text-secondary)]">Загрузка...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Группы (Отделы)</h1>
        <button onClick={openCreateModal} className={btnClass}>
          <FolderTree size={16} />
          Создать
        </button>
      </div>

      <div className="flex items-center gap-3 bg-[var(--tg-surface)] p-2 rounded-xl border border-[var(--tg-border)]">
        <Search size={18} className="text-[var(--tg-text-secondary)] ml-2" />
        <input 
          className="bg-transparent border-none outline-none text-[14px] text-[var(--tg-text)] w-full placeholder:text-[var(--tg-text-secondary)] py-1"
          placeholder="Поиск групп..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="bg-[var(--tg-surface)] rounded-2xl border border-[var(--tg-border)] overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[14px]">
            <thead className="bg-[var(--tg-input)]/50 text-[var(--tg-text-secondary)] border-b border-[var(--tg-border)]">
              <tr>
                <th className="px-4 py-3 font-medium whitespace-nowrap">Название</th>
                <th className="px-4 py-3 font-medium whitespace-nowrap">Сотрудники</th>
                <th className="px-4 py-3 font-medium whitespace-nowrap">Линии</th>
                <th className="px-4 py-3 font-medium whitespace-nowrap">Bitrix ID</th>
                <th className="px-4 py-3 font-medium text-right whitespace-nowrap">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--tg-border)]">
              {filteredGroups.map((group) => (
                <tr key={group.id} className="hover:bg-[var(--tg-input)]/30 transition-colors group">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-[var(--tg-input)] flex items-center justify-center text-[var(--tg-accent)] shrink-0">
                        <FolderTree size={16} />
                      </div>
                      <div className="font-medium text-[14px]">{group.name}</div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[13px] text-[var(--tg-text-secondary)]">
                    <button 
                      onClick={() => setViewingGroup(group)}
                      className="flex items-center gap-1.5 hover:text-[var(--tg-accent)] transition-colors"
                    >
                      <Users size={14} />
                      {group.users?.length || 0} чел.
                    </button>
                  </td>
                  <td className="px-4 py-3 text-[13px] text-[var(--tg-text-secondary)]">
                    {group._count?.lines || 0} шт.
                  </td>
                  <td className="px-4 py-3 text-[13px] text-[var(--tg-text-secondary)] font-mono">
                    {group.bitrixDepartmentId || '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleEditGroup(group)}
                        className="w-8 h-8 rounded-full hover:bg-[var(--tg-input)] hover:text-[var(--tg-accent)] flex items-center justify-center transition-colors"
                        title="Редактировать"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => handleDeleteGroup(group)}
                        className="w-8 h-8 rounded-full hover:bg-[var(--tg-input)] hover:text-[var(--tg-danger)] flex items-center justify-center transition-colors"
                        title="Удалить"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredGroups.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-[var(--tg-text-secondary)]">
                    Группы не найдены
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create/Edit Group Modal */}
      {isGroupModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--tg-surface)] rounded-2xl w-full max-w-md shadow-xl border border-[var(--tg-border)] flex flex-col">
            <div className="p-5 border-b border-[var(--tg-border)] flex justify-between items-center">
              <h3 className="font-semibold text-lg">{editingGroupId ? 'Редактировать группу' : 'Новая группа'}</h3>
              <button onClick={closeGroupModal} className="text-[var(--tg-text-secondary)] hover:text-[var(--tg-text)]">✕</button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-[12px] text-[var(--tg-text-secondary)] mb-1.5 ml-1">Название группы</label>
                <input className={inputClass} placeholder="Отдел продаж" value={groupForm.name} onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })} />
              </div>
              <div>
                <label className="block text-[12px] text-[var(--tg-text-secondary)] mb-1.5 ml-1">Bitrix Department ID (опционально)</label>
                <input className={inputClass} placeholder="Например: 12" value={groupForm.bitrixDepartmentId} onChange={(e) => setGroupForm({ ...groupForm, bitrixDepartmentId: e.target.value })} />
              </div>
            </div>
            <div className="p-5 border-t border-[var(--tg-border)] flex justify-end gap-3">
              <button className="px-4 py-2.5 rounded-xl text-[14px] text-[var(--tg-text)] hover:bg-[var(--tg-input)] transition-colors font-medium" onClick={closeGroupModal}>Отмена</button>
              <button className={btnClass} onClick={handleSaveGroup}>{editingGroupId ? 'Сохранить' : 'Создать'}</button>
            </div>
          </div>
        </div>
      )}

      {/* View Group Members Modal */}
      {viewingGroup && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--tg-surface)] rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col shadow-xl border border-[var(--tg-border)]">
            <div className="p-5 border-b border-[var(--tg-border)] flex justify-between items-center">
              <div>
                <h3 className="font-semibold text-lg">Сотрудники</h3>
                <p className="text-sm text-[var(--tg-text-secondary)]">{viewingGroup.name}</p>
              </div>
              <button onClick={() => setViewingGroup(null)} className="text-[var(--tg-text-secondary)] hover:text-[var(--tg-text)]">✕</button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-2">
              {viewingGroup.users?.map((user: any) => (
                <div key={user.id} className="flex items-center gap-3 p-3 hover:bg-[var(--tg-input)] rounded-xl transition-colors group">
                  {user.avatarUrl ? (
                    <img src={user.avatarUrl} alt={user.name} className="w-8 h-8 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--tg-accent)] to-blue-400 flex items-center justify-center text-white font-medium text-xs shrink-0">
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-[14px] truncate">{user.name}</div>
                    <div className="text-[12px] text-[var(--tg-text-secondary)] truncate">{user.role}</div>
                  </div>
                  <button
                    onClick={() => handleRemoveUser(viewingGroup.id, user.id, user.name)}
                    className="w-8 h-8 rounded-full bg-[var(--tg-input)] hover:bg-[var(--tg-danger)] hover:text-white flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100"
                    title="Убрать из группы"
                  >
                    <UserMinus size={14} />
                  </button>
                </div>
              ))}
              {(!viewingGroup.users || viewingGroup.users.length === 0) && (
                <div className="p-8 text-center text-[var(--tg-text-secondary)] text-sm">
                  В этой группе пока нет сотрудников
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
