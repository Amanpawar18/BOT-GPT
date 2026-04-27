import { useId } from 'react';
import { cn } from '@/lib/utils';

export function BackgroundBeams({ className }: { className?: string }) {
  const uid = useId();
  const patternId = `dot-grid-${uid}`;

  return (
    <div
      className={cn(
        'absolute inset-0 overflow-hidden pointer-events-none',
        className,
      )}
      aria-hidden="true"
    >
      {/* Radial purple glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-purple-900/20 blur-3xl" />
      <div className="absolute top-1/4 left-1/3 w-[300px] h-[300px] rounded-full bg-purple-950/30 blur-2xl" />
      {/* Subtle dot grid */}
      <svg
        className="absolute inset-0 w-full h-full"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern
            id={patternId}
            width="32"
            height="32"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="1" cy="1" r="0.8" className="fill-purple-600 opacity-15" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${patternId})`} />
      </svg>
    </div>
  );
}
