'use client';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { FileText, LogOut, Plus } from 'lucide-react';
import { AnimatedGradientText } from '@/components/ui/aceternity/animated-gradient-text';
import { ConversationItem } from '@/components/conversation-item';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { clearToken } from '@/lib/auth';
import { cn } from '@/lib/utils';
import type { Conversation } from '@/lib/api';

interface Props {
  conversations: Conversation[];
}

export function Sidebar({ conversations }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  function handleSignOut() {
    clearToken();
    router.replace('/login');
  }

  return (
    <aside className="w-60 shrink-0 bg-zinc-900 border-r border-border flex flex-col h-full">
      {/* Logo */}
      <div className="p-4 flex items-center justify-between">
        <Link href="/conversations">
          <AnimatedGradientText className="text-sm font-bold tracking-tight">
            BOT GPT
          </AnimatedGradientText>
        </Link>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          aria-label="New chat"
          onClick={() => router.push('/conversations')}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <Separator />

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

      <Separator />

      {/* Bottom links */}
      <div className="p-2 space-y-0.5">
        <Link
          href="/documents"
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors',
            pathname === '/documents'
              ? 'bg-zinc-800 text-foreground'
              : 'text-muted-foreground hover:bg-zinc-800/60 hover:text-foreground',
          )}
        >
          <FileText className="h-4 w-4 shrink-0" />
          Documents
        </Link>
        <Button
          variant="ghost"
          onClick={handleSignOut}
          className="flex items-center gap-2 w-full justify-start px-3 py-2 text-sm text-muted-foreground hover:bg-zinc-800/60 hover:text-foreground"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          Sign out
        </Button>
      </div>
    </aside>
  );
}
