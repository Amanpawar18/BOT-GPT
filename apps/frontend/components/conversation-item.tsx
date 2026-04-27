'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import type { Conversation } from '@/lib/api';

interface Props {
  conv: Conversation;
}

export function ConversationItem({ conv }: Props) {
  const pathname = usePathname();
  const isActive = pathname === `/conversations/${conv.id}`;

  return (
    <Link
      href={`/conversations/${conv.id}`}
      className={cn(
        'flex items-center gap-2 px-3 py-2 rounded-lg text-sm truncate transition-colors',
        isActive
          ? 'bg-zinc-800 text-white border-l-2 border-primary shadow-[0_0_8px_rgba(124,58,237,0.3)]'
          : 'text-muted-foreground hover:bg-zinc-800/60 hover:text-foreground',
      )}
    >
      <span className="truncate">{conv.title || 'Untitled'}</span>
      {conv.mode === 'rag' && (
        <span className="ml-auto shrink-0 text-[10px] text-purple-400 font-medium">
          RAG
        </span>
      )}
    </Link>
  );
}
