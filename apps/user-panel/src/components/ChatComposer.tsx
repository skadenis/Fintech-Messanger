import { useEffect, useRef } from 'react';

interface ChatComposerProps {
  draft: string;
  sending: boolean;
  uploading: boolean;
  error?: string | null;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onFileSelect: (file: File) => void;
}

function AttachIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ChatComposer({
  draft,
  sending,
  uploading,
  error,
  onDraftChange,
  onSend,
  onFileSelect,
}: ChatComposerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const canSend = draft.trim().length > 0 && !sending && !uploading;

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = '44px';
    const scrollHeight = el.scrollHeight;
    el.style.height = `${Math.max(44, Math.min(scrollHeight, 160))}px`;
  }, [draft]);

  return (
    <footer className="shrink-0 px-3 py-2 bg-[var(--tg-panel)] border-t border-[var(--tg-border)]">
      <div className="mx-auto max-w-3xl flex items-end gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || sending}
          className="mb-1 h-10 w-10 shrink-0 rounded-full flex items-center justify-center text-[var(--tg-text-secondary)] hover:bg-[var(--tg-hover)] hover:text-[var(--tg-accent)] transition-colors disabled:opacity-40"
          title="Прикрепить файл"
        >
          <AttachIcon />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.zip,.rar"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onFileSelect(file);
            event.target.value = '';
          }}
        />

        <div className="flex-1 min-w-0 rounded-2xl bg-[var(--tg-input)] border border-transparent focus-within:border-[var(--tg-accent)]/40 transition-colors">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                if (canSend) onSend();
              }
            }}
            rows={1}
            placeholder="Сообщение..."
            className="w-full max-h-40 min-h-[44px] resize-none bg-transparent px-4 py-2.5 text-[15px] leading-snug outline-none placeholder:text-[var(--tg-text-secondary)]"
          />
        </div>

        <button
          type="button"
          onClick={onSend}
          disabled={!canSend}
          className={`mb-1 h-10 w-10 shrink-0 rounded-full flex items-center justify-center transition-all ${
            canSend
              ? 'bg-[var(--tg-accent)] text-white shadow-md hover:brightness-110'
              : 'bg-[var(--tg-input)] text-[var(--tg-text-secondary)] opacity-50'
          }`}
          title="Отправить"
        >
          {uploading || sending ? (
            <span className="text-sm">…</span>
          ) : (
            <SendIcon />
          )}
        </button>
      </div>
      {error && <div className="mx-auto max-w-3xl text-xs text-red-400 mt-2 px-2">{error}</div>}
    </footer>
  );
}
