import React from 'react';

const URL_REGEX = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/g;

export function Linkify({ children }: { children: React.ReactNode }) {
  if (typeof children !== 'string') {
    return <>{children}</>;
  }

  const parts = children.split(URL_REGEX);

  return (
    <>
      {parts.map((part, i) => {
        if (part.match(URL_REGEX)) {
          return (
            <a
              key={i}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--tg-accent)] underline break-all hover:opacity-80"
            >
              {part}
            </a>
          );
        }
        return <React.Fragment key={i}>{part}</React.Fragment>;
      })}
    </>
  );
}
