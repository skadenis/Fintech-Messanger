import { useEffect } from 'react';
import { X } from 'lucide-react';

export function ImageLightbox({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt?: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 p-2 rounded-full bg-black/50 text-white hover:bg-black/70"
        aria-label="Закрыть"
      >
        <X size={24} />
      </button>
      <img
        src={src}
        alt={alt ?? ''}
        className="max-w-full max-h-full object-contain cursor-zoom-out"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
