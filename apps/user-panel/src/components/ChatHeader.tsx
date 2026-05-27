import { MessengerType } from '@fintech/shared';
import { Avatar } from './Avatar';
import { MessengerIcon, messengerMeta } from './MessengerIcon';

interface ChatHeaderProps {
  title: string;
  subtitle?: string;
  messengerType?: MessengerType;
}

export function ChatHeader({ title, subtitle, messengerType }: ChatHeaderProps) {
  return (
    <header className="h-[54px] shrink-0 border-b border-[var(--tg-border)] px-4 flex items-center gap-3 bg-[var(--tg-panel)]">
      <Avatar name={title} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="font-medium text-[15px] truncate leading-tight">{title}</div>
        {subtitle && (
          <div className="text-[13px] text-[var(--tg-text-secondary)] truncate leading-tight mt-0.5">
            {subtitle}
          </div>
        )}
      </div>
      {messengerType && (
        <div className="shrink-0 opacity-90" title={messengerMeta[messengerType].label}>
          <MessengerIcon type={messengerType} className="h-7 w-7" />
        </div>
      )}
    </header>
  );
}
