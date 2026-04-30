'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, MessageSquare, FileSearch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  getConversations,
  createConversation,
  deleteConversation,
  type Conversation,
} from '@/lib/api';

export default function ConversationsPage() {
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newMode, setNewMode] = useState<'open' | 'rag'>('open');
  const [newStrategy, setNewStrategy] = useState<'sliding_window' | 'summarization'>('sliding_window');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    getConversations()
      .then(setConversations)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const conv = await createConversation(newTitle.trim(), newMode, newStrategy);
      router.push(`/conversations/${conv.id}`);
    } catch (err) {
      console.error(err);
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.preventDefault();
    await deleteConversation(id);
    setConversations((prev) => prev.filter((c) => c.id !== id));
    window.dispatchEvent(new CustomEvent('botgpt:conversations-updated'));
  }

  return (
    <div className="flex flex-col h-full">
      <header className="px-6 py-4 border-b border-border flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Conversations</h1>
          <p className="text-sm text-muted-foreground">
            {conversations.length} conversation{conversations.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-1.5">
              <Plus className="h-4 w-4" />
              New chat
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-border">
            <DialogHeader>
              <DialogTitle>New conversation</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  autoFocus
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Research assistant"
                  className="bg-background border-border"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Mode</Label>
                <Select value={newMode} onValueChange={(v) => setNewMode(v as 'open' | 'rag')}>
                  <SelectTrigger className="bg-background border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="open">Open chat</SelectItem>
                    <SelectItem value="rag">RAG (docs)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Context strategy</Label>
                <Select
                  value={newStrategy}
                  onValueChange={(v) => setNewStrategy(v as 'sliding_window' | 'summarization')}
                >
                  <SelectTrigger className="bg-background border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="sliding_window">Sliding window</SelectItem>
                    <SelectItem value="summarization">Summarization</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  {newStrategy === 'summarization'
                    ? 'Old messages are summarized to save tokens.'
                    : 'Recent messages are kept within the token budget.'}
                </p>
              </div>
              <div className="flex gap-2 pt-1">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={creating || !newTitle.trim()} className="flex-1">
                  {creating ? 'Creating…' : 'Create'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl bg-card" />
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-60 gap-4">
            <MessageSquare className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground text-sm">No conversations yet</p>
            <Button onClick={() => setOpen(true)}>Start your first chat</Button>
          </div>
        ) : (
          <ul className="space-y-2">
            {conversations.map((conv) => (
              <li key={conv.id}>
                <a
                  href={`/conversations/${conv.id}`}
                  className="flex items-center justify-between px-4 py-3.5 bg-card border border-border rounded-xl hover:border-zinc-600 transition-colors group"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2.5">
                      <p className="font-medium text-foreground truncate text-sm">
                        {conv.title || 'Untitled'}
                      </p>
                      {conv.mode === 'rag' && (
                        <span className="text-[10px] text-zinc-500 font-medium flex items-center gap-1">
                          <FileSearch className="h-2.5 w-2.5" />
                          RAG
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(conv.updated_at).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    onClick={(e) => handleDelete(conv.id, e)}
                    className="ml-3 text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100 p-1"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
