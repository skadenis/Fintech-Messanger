import { useEffect, useState } from 'react';
import { AuthResponse } from '@fintech/shared';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { AdminLayout } from './layouts/AdminLayout';
import { UsersPage } from './pages/UsersPage';
import { GroupsPage } from './pages/GroupsPage';
import { LinesPage } from './pages/LinesPage';
import { ConversationsPage } from './pages/ConversationsPage';

function ProtectedRoute({ auth }: { auth: AuthResponse | null }) {
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  if (!auth) {
    return <Navigate to="/login" replace />;
  }

  const triggerRefresh = () => setRefreshKey(k => k + 1);

  return (
    <>
      {error && (
        <div className="fixed top-4 right-4 z-50 bg-[var(--tg-danger)] text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-3">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span className="text-sm font-medium">{error}</span>
          <button onClick={() => setError(null)} className="ml-2 opacity-70 hover:opacity-100">✕</button>
        </div>
      )}
      <Outlet context={{ auth, error, setError, refreshKey, triggerRefresh }} />
    </>
  );
}

export default function App() {
  const [auth, setAuth] = useState<AuthResponse | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem('admin_auth');
    if (saved) {
      try {
        setAuth(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse saved auth', e);
      }
    }
    setIsInitializing(false);
  }, []);

  if (isInitializing) {
    return <div className="min-h-screen bg-[var(--tg-bg)] flex items-center justify-center text-[var(--tg-text-secondary)]">Загрузка...</div>;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={auth ? <Navigate to="/users" replace /> : <LoginPage onLogin={setAuth} />} />
        
        <Route element={<ProtectedRoute auth={auth} />}>
          <Route element={<AdminLayout auth={auth!} onLogout={() => { setAuth(null); localStorage.removeItem('admin_auth'); }} />}>
            <Route path="/" element={<Navigate to="/users" replace />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/groups" element={<GroupsPage />} />
            <Route path="/lines" element={<LinesPage />} />
            <Route path="/conversations" element={<ConversationsPage />} />
          </Route>
        </Route>
        
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
