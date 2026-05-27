import { FormEvent, useState } from 'react';
import { login } from '../api';
import { AuthResponse } from '@fintech/shared';
import { useNavigate } from 'react-router-dom';

interface LoginPageProps {
  onLogin: (auth: AuthResponse) => void;
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [form, setForm] = useState({ email: 'admin@example.com', password: 'admin123' });
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    try {
      const session = await login(form.email, form.password);
      localStorage.setItem('admin_auth', JSON.stringify(session));
      onLogin(session);
      setError(null);
      navigate('/users');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[var(--tg-bg)]">
      <form onSubmit={handleLogin} className="w-full max-w-sm rounded-2xl bg-[var(--tg-surface)] p-8 shadow-xl">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-[var(--tg-accent)] rounded-full flex items-center justify-center mb-4 shadow-lg">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="text-white ml-1">
              <path d="M21 15a4 4 0 0 1-4 4H7l-4 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-[var(--tg-text)]">Вход в панель</h1>
          <p className="text-[var(--tg-text-secondary)] mt-2 text-sm">Fintech Messenger Admin</p>
        </div>
        
        <div className="space-y-4">
          <input
            className="w-full rounded-xl bg-[var(--tg-input)] border border-transparent focus:border-[var(--tg-accent)] px-4 py-3.5 text-[var(--tg-text)] outline-none transition-colors"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="Email"
          />
          <input
            type="password"
            className="w-full rounded-xl bg-[var(--tg-input)] border border-transparent focus:border-[var(--tg-accent)] px-4 py-3.5 text-[var(--tg-text)] outline-none transition-colors"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder="Пароль"
          />
          <button className="w-full rounded-xl bg-[var(--tg-accent)] hover:bg-[var(--tg-accent-hover)] py-3.5 text-white font-medium transition-colors mt-2">
            Войти
          </button>
        </div>
        {error && <div className="mt-4 text-sm text-[var(--tg-danger)] text-center">{error}</div>}
      </form>
    </div>
  );
}
