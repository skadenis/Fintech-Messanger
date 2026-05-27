import { ConversationDto } from '@fintech/shared';
import { formatConversationTime } from '../utils/format';
import { Avatar } from './Avatar';
import { MessengerIcon } from './MessengerIcon';

interface ConversationListItemProps {
  conversation: ConversationDto;
  title: string;
  selected: boolean;
  onClick: () => void;
}

export function ConversationListItem({
  conversation,
  title,
  selected,
  onClick,
}: ConversationListItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left px-3 py-2.5 flex items-center gap-3 transition-colors ${
        selected ? 'bg-[var(--tg-active)]' : 'hover:bg-[var(--tg-hover)]'
      }`}
    >
      <div className="relative shrink-0">
        <Avatar name={title} size="md" />
        <div className="absolute -bottom-0.5 -right-0.5 rounded-full ring-2 ring-[var(--tg-sidebar)]">
          <MessengerIcon type={conversation.messengerType} className="h-5 w-5" />
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-medium text-[15px] truncate">{title}</span>
          <span className="text-xs text-[var(--tg-text-secondary)] shrink-0">
            {formatConversationTime(conversation.lastMessageAt)}
          </span>
        </div>
        <div className="text-[14px] text-[var(--tg-text-secondary)] truncate mt-0.5 leading-snug">
          {conversation.lastMessagePreview ?? 'Нет сообщений'}
        </div>
      </div>
    </button>
  );
}
