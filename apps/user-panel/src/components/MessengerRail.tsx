import { LineDto } from '@fintech/shared';
import { messengerMeta, MessengerIcon } from './MessengerIcon';

interface MessengerRailProps {
  lines: LineDto[];
  selectedLineId: string | null;
  onSelect: (lineId: string) => void;
}

export function MessengerRail({ lines, selectedLineId, onSelect }: MessengerRailProps) {
  return (
    <aside className="w-[68px] h-full shrink-0 border-r border-[var(--tg-border)] bg-[var(--tg-sidebar)] py-3 flex flex-col items-center gap-2">
      {lines.map((line) => {
        const isSelected = selectedLineId === line.id;
        const brandColor = messengerMeta[line.messengerType].color;

        return (
          <button
            key={line.id}
            type="button"
            onClick={() => onSelect(line.id)}
            className={`relative rounded-full p-0.5 transition-all duration-150 ${
              isSelected
                ? 'scale-105'
                : 'hover:scale-105 opacity-100'
            }`}
            style={
              isSelected
                ? { boxShadow: `0 0 0 2px ${brandColor}` }
                : undefined
            }
            title={line.name}
          >
            <MessengerIcon type={line.messengerType} className="h-11 w-11" />
            {isSelected && (
              <span
                className="absolute -right-0.5 top-1/2 -translate-y-1/2 h-8 w-1 rounded-full"
                style={{ backgroundColor: brandColor }}
              />
            )}
          </button>
        );
      })}
    </aside>
  );
}
