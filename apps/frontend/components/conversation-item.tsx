'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MessageSquare } from 'lucide-react';
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
        'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm truncate transition-colors',
        isActive
          ? 'bg-zinc-800/60 text-white'
          : 'text-zinc-300 hover:bg-zinc-800/40 hover:text-white',
      )}
    >
      <MessageSquare
        className={cn('h-3.5 w-3.5 shrink-0', isActive ? 'text-white' : 'text-zinc-300')}
      />
      <span className="truncate flex-1">{conv.title || 'Untitled'}</span>
      {conv.mode === 'rag' && (
        <span className="ml-auto shrink-0 text-[10px] text-zinc-500 font-medium">RAG</span>
      )}
    </Link>
  );
}
