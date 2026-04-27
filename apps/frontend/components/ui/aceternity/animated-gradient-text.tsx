import { cn } from '@/lib/utils';

interface Props {
  children: React.ReactNode;
  className?: string;
}

export function AnimatedGradientText({ children, className }: Props) {
  return (
    <span
      className={cn(
        'bg-gradient-to-r from-purple-400 via-pink-400 to-purple-400 bg-clip-text text-transparent animate-gradient-x',
        className,
      )}
    >
      {children}
    </span>
  );
}
