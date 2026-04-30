'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { FileText, List, LogOut } from 'lucide-react';
import { ConversationItem } from '@/components/conversation-item';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { clearToken } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { getTokenUsage, type Conversation, type TokenUsage } from '@/lib/api';

interface Props {
  conversations: Conversation[];
}

function fmt(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

function TokenBar({ usage }: { usage: TokenUsage }) {
  const pct = Math.min(100, (usage.used / usage.limit) * 100);
  const barColor =
    pct >= 95 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-zinc-400';
  const textColor =
    pct >= 95 ? 'text-red-400' : pct >= 80 ? 'text-amber-400' : 'text-zinc-500';

  return (
    <div className="px-3 pt-2 pb-1">
      <div className="flex justify-between items-baseline mb-1.5">
        <span className={cn('text-[10px]', textColor)}>
          {fmt(usage.used)} / {fmt(usage.limit)} tokens today
        </span>
        <span className="text-[10px] text-zinc-600">{Math.round(pct)}%</span>
      </div>
      <div className="h-1 w-full rounded-full bg-zinc-800 overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-500', barColor)}
          style={{ width: `${pct}%` }}
        />
      </div>
      {pct >= 80 && (
        <p className={cn('text-[10px] mt-1', textColor)}>
          {fmt(usage.limit - usage.used)} remaining
        </p>
      )}
    </div>
  );
}

export function Sidebar({ conversations }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [usage, setUsage] = useState<TokenUsage | null>(null);

  useEffect(() => {
    getTokenUsage().then(setUsage).catch(() => null);
  }, [pathname]);

  useEffect(() => {
    function onUpdate() {
      getTokenUsage().then(setUsage).catch(() => null);
    }
    window.addEventListener('botgpt:tokens-updated', onUpdate);
    return () => window.removeEventListener('botgpt:tokens-updated', onUpdate);
  }, []);

  function handleSignOut() {
    clearToken();
    router.replace('/login');
  }

  return (
    <aside className="w-[210px] shrink-0 bg-[#0f0f11] border-r border-border flex flex-col h-full">
      {/* Logo row */}
      <div className="px-4 py-3.5 flex items-center justify-between border-b border-border">
        <Link href="/conversations" className="text-sm font-semibold tracking-tight text-foreground">
          BOT GPT
        </Link>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-zinc-300 hover:text-white hover:bg-zinc-800/60"
          aria-label="New chat"
          onClick={() => router.push('/conversations')}
        >
          <List className="h-4 w-4" />
        </Button>
      </div>

      {/* Conversation list */}
      <ScrollArea className="flex-1 px-2 py-2">
        <div className="space-y-0.5">
          {conversations.map((conv) => (
            <ConversationItem key={conv.id} conv={conv} />
          ))}
          {conversations.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              No conversations yet
            </p>
          )}
        </div>
      </ScrollArea>

      {/* Bottom links */}
      <div className="p-2 border-t border-border space-y-0.5">
        <Link
          href="/documents"
          className={cn(
            'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors',
            pathname === '/documents'
              ? 'bg-zinc-800/60 text-white'
              : 'text-zinc-300 hover:bg-zinc-800/40 hover:text-white',
          )}
        >
          <FileText className="h-4 w-4 shrink-0" />
          Documents
        </Link>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm text-zinc-300 hover:bg-zinc-800/40 hover:text-white transition-colors"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          Sign out
        </button>

        {usage && <TokenBar usage={usage} />}
      </div>
    </aside>
  );
}
