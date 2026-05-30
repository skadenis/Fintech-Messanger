interface ContactAvatarProps {
  name?: string | null;
  avatarUrl?: string | null;
  size?: 'sm' | 'md';
}

const sizeClass = { sm: 'w-8 h-8 text-[12px]', md: 'w-10 h-10 text-[14px]' };

function initials(name?: string | null) {
  const parts = (name ?? '?').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

export function ContactAvatar({ name, avatarUrl, size = 'md' }: ContactAvatarProps) {
  const cls = sizeClass[size];
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name ?? ''}
        className={`${cls} rounded-full object-cover shrink-0 bg-[var(--tg-input)]`}
        loading="lazy"
        referrerPolicy="no-referrer"
      />
    );
  }
  return (
    <div
      className={`${cls} rounded-full shrink-0 bg-[var(--tg-accent)]/20 text-[var(--tg-accent)] font-semibold flex items-center justify-center`}
    >
      {initials(name)}
    </div>
  );
}
