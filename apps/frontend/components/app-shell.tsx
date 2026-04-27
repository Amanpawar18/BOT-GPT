'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { getConversations, type Conversation } from '@/lib/api';

export function AppShell({ children }: { children: React.ReactNode }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const pathname = usePathname();

  useEffect(() => {
    getConversations().then(setConversations).catch(console.error);
  }, [pathname]);

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar conversations={conversations} />
      <main className="flex-1 overflow-y-auto min-w-0">{children}</main>
    </div>
  );
}
