import { LineDto } from '@fintech/shared';
import { messengerMeta, MessengerIcon } from './MessengerIcon';

interface MessengerRailProps {
  lines: LineDto[];
  selectedLineId: string | null;
  onSelect: (lineId: string) => void;
  activeLineIds?: string[];
}

export function MessengerRail({ lines, selectedLineId, onSelect, activeLineIds }: MessengerRailProps) {
  let renderLines = lines;
  let inactiveLines: LineDto[] = [];

  if (activeLineIds) {
    renderLines = lines.filter((l) => activeLineIds.includes(l.id));
    inactiveLines = lines.filter((l) => !activeLineIds.includes(l.id));
  }

  const renderLineButton = (line: LineDto, isActiveGroup: boolean) => {
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
        } ${!isActiveGroup && !isSelected ? 'grayscale opacity-60 hover:grayscale-0 hover:opacity-100' : ''}`}
        style={
          isSelected
            ? { boxShadow: `0 0 0 2px ${brandColor}` }
            : undefined
        }
        title={isActiveGroup ? line.name : `Написать с: ${line.name}`}
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
  };

  return (
    <aside className="w-[68px] h-full shrink-0 border-r border-[var(--tg-border)] bg-[var(--tg-sidebar)] py-3 flex flex-col items-center gap-2 overflow-y-auto hide-scrollbar">
      {renderLines.map((line) => renderLineButton(line, true))}
      
      {activeLineIds && inactiveLines.length > 0 && (
        <>
          {renderLines.length > 0 && (
            <div className="w-8 h-px bg-[var(--tg-border)] my-1 shrink-0" />
          )}
          {inactiveLines.map((line) => renderLineButton(line, false))}
        </>
      )}
    </aside>
  );
}
