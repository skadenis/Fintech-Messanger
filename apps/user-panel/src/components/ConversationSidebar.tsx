import { AuthResponse, ConversationDto } from '@fintech/shared';
import { useMemo, useState } from 'react';
import { Avatar } from './Avatar';
import { ConversationListItem } from './ConversationListItem';

interface ConversationSidebarProps {
  auth: AuthResponse;
  conversations: ConversationDto[];
  selectedConversationId: string | null;
  formatTitle: (conversation: ConversationDto) => string;
  onSelect: (id: string) => void;
}

export function ConversationSidebar({
  auth,
  conversations,
  selectedConversationId,
  formatTitle,
  onSelect,
}: ConversationSidebarProps) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return conversations;
    return conversations.filter((item) => {
      const title = formatTitle(item).toLowerCase();
      const preview = (item.lastMessagePreview ?? '').toLowerCase();
      return title.includes(normalized) || preview.includes(normalized);
    });
  }, [conversations, formatTitle, query]);

  return (
    <aside className="w-[340px] h-full shrink-0 border-r border-[var(--tg-border)] bg-[var(--tg-sidebar)] flex flex-col">
      <div className="h-[54px] shrink-0 px-4 flex items-center gap-3 border-b border-[var(--tg-border)]">
        <Avatar name={auth.user.name} avatarUrl={auth.user.avatarUrl} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="font-medium text-[15px] truncate">{auth.user.name}</div>
          <div className="text-[13px] text-[var(--tg-text-secondary)] truncate">
            {auth.user.groupName ?? auth.user.role}
          </div>
        </div>
      </div>

      <div className="px-3 py-2 border-b border-[var(--tg-border)]">
        <div className="flex items-center gap-2 rounded-full bg-[var(--tg-input)] px-3 py-2">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            className="text-[var(--tg-text-secondary)] shrink-0"
            aria-hidden
          >
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.75" />
            <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          </svg>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск"
            className="w-full bg-transparent text-[14px] outline-none placeholder:text-[var(--tg-text-secondary)]"
          />
        </div>
      </div>

      <div className="overflow-y-auto flex-1">
        {filtered.map((conversation) => (
          <ConversationListItem
            key={conversation.id}
            conversation={conversation}
            title={formatTitle(conversation)}
            selected={selectedConversationId === conversation.id}
            onClick={() => onSelect(conversation.id)}
          />
        ))}
        {!filtered.length && (
          <div className="p-6 text-center text-[14px] text-[var(--tg-text-secondary)]">
            {query ? 'Ничего не найдено' : 'Диалогов пока нет'}
          </div>
        )}
      </div>
    </aside>
  );
}
