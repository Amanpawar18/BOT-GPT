'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Paperclip, Send, Loader2, Eye, EyeOff, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  getConversation,
  streamMessage,
  uploadDocument,
  type ConversationDetail,
  type Message,
  type DocSource,
} from '@/lib/api';
import { cn } from '@/lib/utils';

export default function ChatPage() {
  const params = useParams();
  const id = params.id as string;

  const [conv, setConv] = useState<ConversationDetail | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [pendingUserTokens, setPendingUserTokens] = useState<number | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadDone, setUploadDone] = useState(false);
  const [error, setError] = useState('');
  const [showTokens, setShowTokens] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!id) return;
    getConversation(id)
      .then((data) => {
        setConv(data);
        setMessages(data.messages ?? []);
      })
      .catch(console.error);
  }, [id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  const send = useCallback(async () => {
    const content = input.trim();
    if (!content || sending) return;
    setInput('');
    setError('');
    setSending(true);

    const estimatedUserTokens = Math.ceil(content.length / 4);
    setPendingUserTokens(estimatedUserTokens);

    const userMsg: Message = {
      id: `tmp-${Date.now()}`,
      role: 'user',
      content,
      created_at: new Date().toISOString(),
      tokenCount: estimatedUserTokens,
    };
    setMessages((prev) => [...prev, userMsg]);

    await streamMessage(
      id,
      content,
      (token) => setStreamingText((prev) => prev + token),
      (full, meta) => {
        // Backfill server-confirmed token count onto the user message
        setMessages((prev) =>
          prev.map((m) =>
            m.id === userMsg.id
              ? { ...m, tokenCount: meta.userTokens }
              : m,
          ),
        );

        const assistantMsg: Message = {
          id: `tmp-${Date.now() + 1}`,
          role: 'assistant',
          content: full,
          created_at: new Date().toISOString(),
          tokenCount: meta.assistantTokens,
          sources: meta.sources,
        };
        setMessages((prev) => [...prev, assistantMsg]);
        setStreamingText('');
        setPendingUserTokens(null);
        setSending(false);
      },
      (err) => {
        setError(err);
        setStreamingText('');
        setPendingUserTokens(null);
        setSending(false);
      },
    );
  }, [id, input, sending]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadDone(false);
    try {
      await uploadDocument(id, file);
      setUploadDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="px-6 py-3.5 border-b border-border flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="font-semibold text-foreground text-sm">
              {conv?.title ?? 'Loading…'}
            </h2>
          </div>
          {conv?.mode === 'rag' && (
            <Badge className="bg-purple-900/40 text-purple-300 border-purple-700 gap-1.5 text-[10px]">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse-dot" />
              RAG
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Token usage toggle */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowTokens((v) => !v)}
            className={cn(
              'gap-1.5 text-xs h-7 px-2',
              showTokens
                ? 'text-purple-400 hover:text-purple-300'
                : 'text-muted-foreground hover:text-foreground',
            )}
            title={showTokens ? 'Hide token usage' : 'Show token usage'}
          >
            {showTokens ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            Tokens
          </Button>

          {conv?.mode === 'rag' && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                onChange={handleUpload}
                className="hidden"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="border-zinc-700 text-xs gap-1.5"
              >
                <Paperclip className="h-3 w-3" />
                {uploading ? 'Uploading…' : 'Upload PDF'}
              </Button>
              {uploadDone && (
                <span className="text-xs text-green-400">Uploaded ✓</span>
              )}
            </>
          )}
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
        {messages.length === 0 && !streamingText && (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground text-sm">
              {conv?.mode === 'rag'
                ? 'Upload a PDF then ask questions about it.'
                : 'Start a conversation.'}
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            msg={msg}
            showTokens={showTokens}
            isRag={conv?.mode === 'rag'}
          />
        ))}

        {streamingText && (
          <div className="flex justify-start">
            <div className="max-w-[75%] px-4 py-3 rounded-2xl rounded-bl-sm bg-zinc-800 border border-border text-foreground text-sm leading-relaxed whitespace-pre-wrap">
              {streamingText}
              <span className="inline-block w-1.5 h-4 bg-muted-foreground ml-0.5 animate-pulse rounded-sm" />
            </div>
          </div>
        )}

        {error && (
          <div className="flex justify-center">
            <p className="text-xs text-destructive bg-destructive/10 px-3 py-1.5 rounded-lg">
              {error}
            </p>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="px-6 py-4 border-t border-border shrink-0">
        {showTokens && pendingUserTokens !== null && (
          <p className="text-[10px] text-muted-foreground mb-1.5 text-right">
            ~{pendingUserTokens} tokens
          </p>
        )}
        <div
          className={cn(
            'flex gap-3 items-end rounded-xl border border-border bg-zinc-900 px-3 py-2 transition-shadow',
            'focus-within:ring-2 focus-within:ring-primary focus-within:border-primary/50',
          )}
        >
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={sending}
            rows={1}
            placeholder="Message… (Enter to send, Shift+Enter for newline)"
            className="flex-1 resize-none border-0 bg-transparent text-sm focus-visible:ring-0 focus-visible:ring-offset-0 disabled:opacity-50 max-h-40 overflow-y-auto p-0 shadow-none"
            style={{ lineHeight: '1.5' }}
          />
          <Button
            onClick={() => void send()}
            disabled={sending || !input.trim()}
            size="icon"
            className="h-8 w-8 shrink-0 bg-primary hover:bg-primary/90 disabled:opacity-40"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

interface MessageBubbleProps {
  msg: Message;
  showTokens: boolean;
  isRag: boolean | undefined;
}

function MessageBubble({ msg, showTokens, isRag }: MessageBubbleProps) {
  const isUser = msg.role === 'user';
  const hasSources = !isUser && isRag && msg.sources && msg.sources.length > 0;

  return (
    <div className={cn('flex flex-col', isUser ? 'items-end' : 'items-start')}>
      <div
        className={cn(
          'max-w-[75%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap',
          isUser
            ? 'bg-primary text-primary-foreground rounded-br-sm'
            : 'bg-zinc-800 border border-border text-foreground rounded-bl-sm',
        )}
      >
        {msg.content}
      </div>

      {/* Token count */}
      {showTokens && msg.tokenCount !== undefined && msg.tokenCount > 0 && (
        <p className="text-[10px] text-muted-foreground mt-0.5 px-1">
          {msg.tokenCount} tokens
        </p>
      )}

      {/* Document sources — only on assistant RAG messages */}
      {hasSources && (
        <Sources sources={msg.sources as DocSource[]} />
      )}
    </div>
  );
}

function Sources({ sources }: { sources: DocSource[] }) {
  return (
    <div className="mt-1.5 max-w-[75%] flex flex-wrap gap-1.5">
      {sources.map((s) => (
        <span
          key={s.documentId}
          className="inline-flex items-center gap-1 text-[10px] text-purple-300 bg-purple-900/20 border border-purple-800/40 rounded-md px-2 py-0.5"
        >
          <FileText className="h-2.5 w-2.5 shrink-0" />
          {s.filename}
        </span>
      ))}
    </div>
  );
}
