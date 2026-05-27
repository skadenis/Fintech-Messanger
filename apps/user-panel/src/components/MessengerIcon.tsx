import { MessengerType } from '@fintech/shared';
import whatsappIcon from '../assets/icons/whatsapp.png';
import telegramIcon from '../assets/icons/telegram.png';
import maxIcon from '../assets/icons/max.png';

interface MessengerIconProps {
  type: MessengerType;
  className?: string;
}

const iconSrc: Record<MessengerType, string> = {
  [MessengerType.WHATSAPP]: whatsappIcon,
  [MessengerType.TELEGRAM]: telegramIcon,
  [MessengerType.MAX]: maxIcon,
};

export function MessengerIcon({ type, className = 'h-12 w-12' }: MessengerIconProps) {
  return (
    <img
      src={iconSrc[type]}
      alt=""
      className={`${className} block rounded-full object-cover aspect-square`}
      draggable={false}
    />
  );
}

export const messengerMeta: Record<MessengerType, { label: string; color: string }> = {
  [MessengerType.WHATSAPP]: { label: 'WhatsApp', color: '#25D366' },
  [MessengerType.TELEGRAM]: { label: 'Telegram', color: '#229ED9' },
  [MessengerType.MAX]: { label: 'MAX', color: '#5B8CFF' },
};

export const allMessengers = [
  MessengerType.WHATSAPP,
  MessengerType.TELEGRAM,
  MessengerType.MAX,
] as const;
