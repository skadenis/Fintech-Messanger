import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Download, FileJson } from 'lucide-react';
import {
  downloadConversationsExport,
  getConversationsExportPreview,
  getLines,
} from '../api';

export function ExportPage() {
  const { auth, setError } = useOutletContext<{
    auth: { token: string };
    setError: (msg: string | null) => void;
  }>();

  const [lines, setLines] = useState<Array<{ id: string; name: string; messengerType: string }>>(
    [],
  );
  const [lineId, setLineId] = useState('');
  const [stats, setStats] = useState<{ conversations: number; messages: number } | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    getLines(auth.token)
      .then((data) => setLines(data.map((l) => ({ id: l.id, name: l.name, messengerType: l.messengerType }))))
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Не удалось загрузить линии'),
      );
  }, [auth.token, setError]);

  useEffect(() => {
    setLoadingStats(true);
    getConversationsExportPreview(auth.token, lineId || undefined)
      .then(setStats)
      .catch(() => setStats(null))
      .finally(() => setLoadingStats(false));
  }, [auth.token, lineId]);

  async function handleDownload() {
    setDownloading(true);
    try {
      await downloadConversationsExport(auth.token, lineId || undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось скачать файл');
    } finally {
      setDownloading(false);
    }
  }

  const inputClass =
    'w-full rounded-xl bg-[var(--tg-input)] border border-transparent focus:border-[var(--tg-accent)] px-3 py-2.5 text-[14px] text-[var(--tg-text)] outline-none transition-colors';

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <FileJson size={26} className="text-[var(--tg-accent)]" />
          Экспорт переписок
        </h1>
        <p className="text-[14px] text-[var(--tg-text-secondary)] mt-2 leading-relaxed">
          Скачайте все диалоги с сообщениями в JSON и загрузите файл в ChatGPT (или другой
          анализатор), чтобы разобрать типовые вопросы клиентов, тон общения и проблемные места.
        </p>
      </div>

      <div className="bg-[var(--tg-surface)] rounded-2xl border border-[var(--tg-border)] p-5 space-y-4">
        <div>
          <label className="block text-[13px] text-[var(--tg-text-secondary)] mb-1.5">
            Линия Wappi
          </label>
          <select
            className={inputClass}
            value={lineId}
            onChange={(e) => setLineId(e.target.value)}
          >
            <option value="">Все линии (доступные вам)</option>
            {lines.map((line) => (
              <option key={line.id} value={line.id}>
                {line.name} · {line.messengerType}
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-xl bg-[var(--tg-input)] px-4 py-3 text-[14px]">
          {loadingStats ? (
            <span className="text-[var(--tg-text-secondary)]">Подсчёт…</span>
          ) : stats ? (
            <>
              <span className="font-medium">{stats.conversations}</span> диалогов,{' '}
              <span className="font-medium">{stats.messages}</span> сообщений попадут в файл
            </>
          ) : (
            <span className="text-[var(--tg-text-secondary)]">Нет данных для экспорта</span>
          )}
        </div>

        <button
          type="button"
          onClick={handleDownload}
          disabled={downloading || !stats || stats.conversations === 0}
          className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-5 py-2.5 rounded-xl bg-[var(--tg-accent)] text-white font-medium text-[14px] hover:bg-[var(--tg-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Download size={18} />
          {downloading ? 'Формируем файл…' : 'Скачать JSON'}
        </button>
      </div>

      <div className="text-[13px] text-[var(--tg-text-secondary)] space-y-2 leading-relaxed">
        <p>
          <strong className="text-[var(--tg-text)]">Формат:</strong> один JSON с массивом{' '}
          <code className="text-[12px] bg-[var(--tg-input)] px-1 rounded">conversations</code>,
          внутри — хронология сообщений (входящие/исходящие, текст, тип медиа).
        </p>
        <p>
          Фото и файлы в JSON не вкладываются — только текст и пометки вроде «📷 Фото», чтобы файл
          был компактным для ChatGPT.
        </p>
        <p>
          <strong className="text-[var(--tg-text)]">Подсказка для ChatGPT:</strong> «Проанализируй
          переписки: основные боли клиентов, где менеджеры теряют диалог, повторяющиеся вопросы,
          предложи улучшения скриптов».
        </p>
      </div>
    </div>
  );
}
