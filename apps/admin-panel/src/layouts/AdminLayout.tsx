import { AuthResponse, Role } from '@fintech/shared';
import { NavLink, Outlet, useNavigate, useOutletContext } from 'react-router-dom';
import { Users, FolderTree, MessageCircle, MessagesSquare, LogOut } from 'lucide-react';

interface AdminLayoutProps {
  auth: AuthResponse;
  onLogout: () => void;
}

export function AdminLayout({ auth, onLogout }: AdminLayoutProps) {
  const navigate = useNavigate();
  const context = useOutletContext();

  const handleLogout = () => {
    onLogout();
    navigate('/login');
  };

  const navItems = [
    { to: '/users', icon: Users, label: 'Пользователи' },
    { to: '/groups', icon: FolderTree, label: 'Группы', roles: [Role.SUPER_ADMIN] },
    { to: '/lines', icon: MessageCircle, label: 'Линии Wappi' },
    { to: '/conversations', icon: MessagesSquare, label: 'Все диалоги' },
  ];

  return (
    <div className="min-h-screen bg-[var(--tg-bg)] text-[var(--tg-text)] flex">
      {/* Sidebar */}
      <aside className="w-60 bg-[var(--tg-surface)] border-r border-[var(--tg-border)] flex flex-col fixed inset-y-0 left-0">
        <div className="h-14 flex items-center px-5 border-b border-[var(--tg-border)]">
          <div className="w-7 h-7 bg-[var(--tg-accent)] rounded-full flex items-center justify-center mr-3">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-white ml-0.5">
              <path d="M21 15a4 4 0 0 1-4 4H7l-4 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
            </svg>
          </div>
          <h1 className="font-semibold text-[15px]">Admin Panel</h1>
        </div>

        <div className="p-4 border-b border-[var(--tg-border)]">
          <div className="font-medium text-[14px] truncate">{auth.user.name}</div>
          <div className="text-[12px] text-[var(--tg-text-secondary)] mt-0.5">{auth.user.role}</div>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            if (item.roles && !item.roles.includes(auth.user.role)) return null;
            
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-xl transition-colors text-[14px] ${
                    isActive
                      ? 'bg-[var(--tg-accent)] text-white font-medium'
                      : 'text-[var(--tg-text-secondary)] hover:bg-[var(--tg-input)] hover:text-[var(--tg-text)]'
                  }`
                }
              >
                <item.icon size={18} />
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        <div className="p-3 border-t border-[var(--tg-border)]">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2 w-full rounded-xl text-[14px] text-[var(--tg-danger)] hover:bg-[var(--tg-danger)]/10 transition-colors"
          >
            <LogOut size={18} />
            Выйти
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 ml-60 flex flex-col min-w-0">
        <div className="flex-1 p-8 max-w-5xl w-full mx-auto">
          <Outlet context={context} />
        </div>
      </main>
    </div>
  );
}
