import { useEffect, useState } from 'react';
import { Role } from '@fintech/shared';
import { getUsers, getGroups, getLines, assignLines, syncBitrixUsers, createUser, updateUser, deleteUser } from '../api';
import { RefreshCw, UserPlus, Search, Settings2, Edit2, Trash2 } from 'lucide-react';
import { useOutletContext } from 'react-router-dom';

export function UsersPage() {
  const { auth, error, setError, refreshKey, triggerRefresh } = useOutletContext<any>();
  const [users, setUsers] = useState<Array<any>>([]);
  const [groups, setGroups] = useState<Array<any>>([]);
  const [lines, setLines] = useState<Array<any>>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  
  const [userSearch, setUserSearch] = useState('');
  
  // Assign Lines Modal state
  const [assignModalUser, setAssignModalUser] = useState<any | null>(null);
  const [selectedLines, setSelectedLines] = useState<Set<string>>(new Set());
  const [lineSearch, setLineSearch] = useState('');

  // Create/Edit User Modal state
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [userForm, setUserForm] = useState({
    name: '',
    email: '',
    password: '',
    role: Role.OPERATOR,
    groupId: '',
  });

  useEffect(() => {
    Promise.all([getUsers(auth.token), getGroups(auth.token), getLines(auth.token)])
      .then(([u, g, l]) => {
        setUsers(u);
        setGroups(g);
        setLines(l);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [auth.token, refreshKey]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isUserModalOpen) closeUserModal();
        if (assignModalUser) closeAssignModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isUserModalOpen, assignModalUser]);

  const handleSync = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const res = await syncBitrixUsers(auth.token);
      alert(`Синхронизировано ${res.count} пользователей из Bitrix24`);
      triggerRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка синхронизации');
    } finally {
      setSyncing(false);
    }
  };

  const openAssignModal = (user: any) => {
    setAssignModalUser(user);
    setSelectedLines(new Set(user.lines.map((l: any) => l.id)));
    setLineSearch('');
  };

  const closeAssignModal = () => {
    setAssignModalUser(null);
  };

  const handleSaveLines = async () => {
    if (!assignModalUser) return;
    try {
      await assignLines(auth.token, assignModalUser.id, Array.from(selectedLines));
      closeAssignModal();
      triggerRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error assigning lines');
    }
  };

  const openCreateModal = () => {
    setEditingUserId(null);
    setUserForm({ name: '', email: '', password: '', role: Role.OPERATOR, groupId: '' });
    setIsUserModalOpen(true);
  };

  const handleEditUser = (user: any) => {
    setEditingUserId(user.id);
    setUserForm({
      name: user.name,
      email: user.email || '',
      password: '',
      role: user.role,
      groupId: user.groupId || '',
    });
    setIsUserModalOpen(true);
  };

  const closeUserModal = () => {
    setIsUserModalOpen(false);
    setEditingUserId(null);
  };

  const handleSaveUser = async () => {
    try {
      if (editingUserId) {
        const updateData = { ...userForm };
        if (!updateData.password) delete (updateData as any).password;
        await updateUser(auth.token, editingUserId, updateData);
      } else {
        await createUser(auth.token, userForm);
      }
      closeUserModal();
      triggerRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error saving user');
    }
  };

  const inputClass = "w-full rounded-xl bg-[var(--tg-input)] border border-transparent focus:border-[var(--tg-accent)] px-3 py-2.5 text-[14px] text-[var(--tg-text)] outline-none transition-colors";
  const btnClass = "rounded-xl bg-[var(--tg-accent)] hover:bg-[var(--tg-accent-hover)] px-4 py-2.5 text-[14px] text-white font-medium transition-colors flex items-center justify-center gap-2";

  const filteredUsers = users.filter(u => 
    u.name.toLowerCase().includes(userSearch.toLowerCase()) || 
    (u.email && u.email.toLowerCase().includes(userSearch.toLowerCase()))
  );

  const filteredLines = lines.filter(l => 
    l.name.toLowerCase().includes(lineSearch.toLowerCase()) || 
    l.wappiProfileId.includes(lineSearch)
  );

  if (loading) return <div className="text-[var(--tg-text-secondary)]">Загрузка...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Пользователи</h1>
        <div className="flex items-center gap-3">
          {auth.user.role === Role.SUPER_ADMIN && (
            <button
              onClick={handleSync}
              disabled={syncing}
              className="rounded-xl bg-[var(--tg-surface)] hover:bg-[var(--tg-surface-hover)] border border-[var(--tg-border)] px-4 py-2 text-sm font-medium transition-colors flex items-center gap-2"
            >
              <RefreshCw size={16} className={syncing ? "animate-spin text-[var(--tg-accent)]" : "text-[var(--tg-accent)]"} />
              {syncing ? 'Синхронизация...' : 'Синхронизировать'}
            </button>
          )}
          <button onClick={openCreateModal} className={btnClass}>
            <UserPlus size={16} />
            Создать
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3 bg-[var(--tg-surface)] p-2 rounded-xl border border-[var(--tg-border)]">
        <Search size={18} className="text-[var(--tg-text-secondary)] ml-2" />
        <input 
          className="bg-transparent border-none outline-none text-[14px] text-[var(--tg-text)] w-full placeholder:text-[var(--tg-text-secondary)] py-1"
          placeholder="Поиск пользователей по имени или email..."
          value={userSearch}
          onChange={(e) => setUserSearch(e.target.value)}
        />
      </div>

      <div className="bg-[var(--tg-surface)] rounded-2xl border border-[var(--tg-border)] overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[14px]">
            <thead className="bg-[var(--tg-input)]/50 text-[var(--tg-text-secondary)] border-b border-[var(--tg-border)]">
              <tr>
                <th className="px-4 py-3 font-medium whitespace-nowrap">Пользователь</th>
                <th className="px-4 py-3 font-medium whitespace-nowrap">Роль</th>
                <th className="px-4 py-3 font-medium whitespace-nowrap">Группа</th>
                <th className="px-4 py-3 font-medium">Линии</th>
                <th className="px-4 py-3 font-medium text-right whitespace-nowrap">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--tg-border)]">
              {filteredUsers.map((user) => (
                <tr key={user.id} className="hover:bg-[var(--tg-input)]/30 transition-colors group">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {user.avatarUrl ? (
                        <img src={user.avatarUrl} alt={user.name} className="w-9 h-9 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[var(--tg-accent)] to-blue-400 flex items-center justify-center text-white font-medium text-sm shrink-0">
                          {user.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="font-medium text-[14px] truncate">{user.name}</div>
                        <div className="text-[12px] text-[var(--tg-text-secondary)] truncate">{user.email || '—'}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[13px]">
                    <span className={`px-2 py-1 rounded-md ${
                      user.role === Role.SUPER_ADMIN ? 'bg-purple-500/10 text-purple-400' :
                      user.role === Role.GROUP_ADMIN ? 'bg-blue-500/10 text-blue-400' :
                      'bg-[var(--tg-input)] text-[var(--tg-text-secondary)]'
                    }`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[13px] text-[var(--tg-text-secondary)]">
                    {user.groupName ? `🏢 ${user.groupName}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-[12px] text-[var(--tg-text-secondary)]">
                    {user.role === Role.OPERATOR ? (
                      user.lines.length > 0 
                        ? (
                          <div className="flex flex-wrap gap-1.5">
                            {user.lines.map((l: any) => (
                              <div key={l.id} className="flex items-center gap-1.5 bg-[var(--tg-input)] px-2 py-1 rounded-md border border-[var(--tg-border)]" title={l.messengerType}>
                                {l.messengerType === 'WHATSAPP' && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>}
                                {l.messengerType === 'TELEGRAM' && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z"></path><path d="M22 2 11 13"></path></svg>}
                                {l.messengerType === 'MAX' && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path></svg>}
                                <span className="truncate max-w-[120px] text-[var(--tg-text)]">{l.name}</span>
                              </div>
                            ))}
                          </div>
                        )
                        : <span className="text-[var(--tg-danger)]">Нет доступа</span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {auth.user.role === Role.SUPER_ADMIN && (
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {user.role === Role.OPERATOR && (
                          <button
                            onClick={() => openAssignModal(user)}
                            className="w-8 h-8 rounded-full hover:bg-[var(--tg-input)] hover:text-[var(--tg-accent)] flex items-center justify-center transition-colors"
                            title="Настроить линии"
                          >
                            <Settings2 size={16} />
                          </button>
                        )}
                        <button
                          onClick={() => handleEditUser(user)}
                          className="w-8 h-8 rounded-full hover:bg-[var(--tg-input)] hover:text-[var(--tg-accent)] flex items-center justify-center transition-colors"
                          title="Редактировать"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={async () => {
                            if (confirm(`Удалить пользователя ${user.name}?`)) {
                              try {
                                await deleteUser(auth.token, user.id);
                                triggerRefresh();
                              } catch (err) {
                                setError(err instanceof Error ? err.message : 'Error deleting user');
                              }
                            }
                          }}
                          className="w-8 h-8 rounded-full hover:bg-[var(--tg-input)] hover:text-[var(--tg-danger)] flex items-center justify-center transition-colors"
                          title="Удалить"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-[var(--tg-text-secondary)]">
                    Пользователи не найдены
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* User Create/Edit Modal */}
      {isUserModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--tg-surface)] rounded-2xl w-full max-w-md shadow-xl border border-[var(--tg-border)] flex flex-col">
            <div className="p-5 border-b border-[var(--tg-border)] flex justify-between items-center">
              <h3 className="font-semibold text-lg">{editingUserId ? 'Редактировать пользователя' : 'Новый пользователь'}</h3>
              <button onClick={closeUserModal} className="text-[var(--tg-text-secondary)] hover:text-[var(--tg-text)]">✕</button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-[12px] text-[var(--tg-text-secondary)] mb-1.5 ml-1">Имя</label>
                <input className={inputClass} placeholder="Иван Иванов" value={userForm.name} onChange={(e) => setUserForm({ ...userForm, name: e.target.value })} />
              </div>
              <div>
                <label className="block text-[12px] text-[var(--tg-text-secondary)] mb-1.5 ml-1">Email</label>
                <input className={inputClass} placeholder="ivan@example.com" value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} />
              </div>
              <div>
                <label className="block text-[12px] text-[var(--tg-text-secondary)] mb-1.5 ml-1">Пароль</label>
                <input className={inputClass} type="password" placeholder={editingUserId ? "Оставьте пустым, чтобы не менять" : "••••••••"} value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] text-[var(--tg-text-secondary)] mb-1.5 ml-1">Роль</label>
                  <select className={inputClass} value={userForm.role} onChange={(e) => setUserForm({ ...userForm, role: e.target.value as Role })}>
                    <option value={Role.OPERATOR}>Оператор</option>
                    <option value={Role.GROUP_ADMIN}>Админ группы</option>
                    {auth.user.role === Role.SUPER_ADMIN && <option value={Role.SUPER_ADMIN}>Супер Админ</option>}
                  </select>
                </div>
                <div>
                  <label className="block text-[12px] text-[var(--tg-text-secondary)] mb-1.5 ml-1">Группа</label>
                  <select className={inputClass} value={userForm.groupId} onChange={(e) => setUserForm({ ...userForm, groupId: e.target.value })}>
                    <option value="">Без группы</option>
                    {groups.map((group) => (
                      <option key={group.id} value={group.id}>{group.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="p-5 border-t border-[var(--tg-border)] flex justify-end gap-3">
              <button className="px-4 py-2.5 rounded-xl text-[14px] text-[var(--tg-text)] hover:bg-[var(--tg-input)] transition-colors font-medium" onClick={closeUserModal}>Отмена</button>
              <button className={btnClass} onClick={handleSaveUser}>{editingUserId ? 'Сохранить' : 'Создать'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Lines Modal */}
      {assignModalUser && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--tg-surface)] rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col shadow-xl border border-[var(--tg-border)]">
            <div className="p-5 border-b border-[var(--tg-border)] flex justify-between items-center">
              <div>
                <h3 className="font-semibold text-lg">Доступ к линиям</h3>
                <p className="text-sm text-[var(--tg-text-secondary)]">{assignModalUser.name}</p>
              </div>
              <button onClick={closeAssignModal} className="text-[var(--tg-text-secondary)] hover:text-[var(--tg-text)]">✕</button>
            </div>
            
            <div className="p-4 border-b border-[var(--tg-border)]">
              <div className="flex items-center gap-2 bg-[var(--tg-input)] px-3 py-2 rounded-xl">
                <Search size={16} className="text-[var(--tg-text-secondary)]" />
                <input 
                  className="bg-transparent border-none outline-none text-[14px] text-[var(--tg-text)] w-full placeholder:text-[var(--tg-text-secondary)]"
                  placeholder="Поиск линий..." 
                  value={lineSearch}
                  onChange={(e) => setLineSearch(e.target.value)}
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2">
              {filteredLines.map(line => (
                <label key={line.id} className="flex items-center gap-3 p-3 hover:bg-[var(--tg-input)] rounded-xl cursor-pointer transition-colors">
                  <input 
                    type="checkbox" 
                    className="w-5 h-5 rounded border-[var(--tg-border)] text-[var(--tg-accent)] focus:ring-[var(--tg-accent)] bg-[var(--tg-bg)]"
                    checked={selectedLines.has(line.id)}
                    onChange={(e) => {
                      const next = new Set(selectedLines);
                      if (e.target.checked) next.add(line.id);
                      else next.delete(line.id);
                      setSelectedLines(next);
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-[14px] truncate">{line.name}</div>
                    <div className="text-[12px] text-[var(--tg-text-secondary)] truncate">{line.wappiProfileId} • {line.messengerType}</div>
                  </div>
                </label>
              ))}
              {filteredLines.length === 0 && (
                <div className="p-4 text-center text-[var(--tg-text-secondary)] text-sm">
                  Линии не найдены
                </div>
              )}
            </div>

            <div className="p-4 border-t border-[var(--tg-border)] flex justify-end gap-3">
              <button className="px-4 py-2.5 rounded-xl text-[14px] text-[var(--tg-text)] hover:bg-[var(--tg-input)] transition-colors font-medium" onClick={closeAssignModal}>Отмена</button>
              <button className={btnClass} onClick={handleSaveLines}>Сохранить ({selectedLines.size})</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
