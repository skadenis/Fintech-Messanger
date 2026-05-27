import { getAvatarColor, getInitials } from '../utils/format';

interface AvatarProps {
  name: string;
  avatarUrl?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClass = {
  sm: 'h-9 w-9 text-xs',
  md: 'h-12 w-12 text-sm',
  lg: 'h-14 w-14 text-base',
};

export function Avatar({ name, avatarUrl, size = 'md', className = '' }: AvatarProps) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className={`${sizeClass[size]} shrink-0 rounded-full object-cover shadow-sm ${className}`}
        draggable={false}
      />
    );
  }

  const color = getAvatarColor(name);

  return (
    <div
      className={`${sizeClass[size]} shrink-0 rounded-full flex items-center justify-center font-semibold text-white shadow-sm ${className}`}
      style={{ backgroundColor: color }}
      aria-hidden
    >
      {getInitials(name)}
    </div>
  );
}
