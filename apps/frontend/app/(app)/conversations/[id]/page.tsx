'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  Paperclip, Send, Loader2, FileText, ChevronDown, ChevronUp,
  BookOpen, X, Eye, Plus, Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  getConversation,
  getConversationDocuments,
  getDocuments,
  attachDocument,
  detachDocument,
  uploadDocument,
  streamMessage,
  type ConversationDetail,
  type Message,
  type Document,
  type StreamDoneMeta,
} from '@/lib/api';
import { cn } from '@/lib/utils';
import { MarkdownContent } from '@/components/markdown-content';

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
  const [error, setError] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const [attachedDocs, setAttachedDocs] = useState<Document[]>([]);
  const [library, setLibrary] = useState<Document[]>([]);
  const [showDocsPanel, setShowDocsPanel] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<Document | null>(null);

  useEffect(() => {
    setShowDetails(localStorage.getItem('botgpt:showDetails') === 'true');
  }, []);
  const bottomRef = useRef<HTMLDivElement>(null);

  const toggleDetails = useCallback(() => {
    setShowDetails((v) => {
      const next = !v;
      localStorage.setItem('botgpt:showDetails', String(next));
      return next;
    });
  }, []);

  useEffect(() => {
    if (!id) return;
    getConversationDocuments(id)
      .then(setAttachedDocs)
      .catch(console.error);
  }, [id]);

  useEffect(() => {
    if (!showDocsPanel) return;
    getDocuments().then(setLibrary).catch(console.error);
  }, [showDocsPanel]);

  const handleAttach = useCallback(async (doc: Document) => {
    try {
      await attachDocument(id, doc.id);
      setAttachedDocs((prev) => [...prev, doc]);
      toast.success(`"${doc.filename}" attached`);
    } catch {
      toast.error('Failed to attach document');
    }
  }, [id]);

  const handleDetach = useCallback(async (docId: string) => {
    try {
      await detachDocument(id, docId);
      setAttachedDocs((prev) => prev.filter((d) => d.id !== docId));
      toast.success('Document removed from conversation');
    } catch {
      toast.error('Failed to remove document');
    }
  }, [id]);

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
      (token: string) => setStreamingText((prev) => prev + token),
      (full: string, meta: StreamDoneMeta) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === userMsg.id ? { ...m, tokenCount: meta.userTokens } : m,
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
        window.dispatchEvent(new CustomEvent('botgpt:tokens-updated'));
      },
      (err: string) => {
        setError(err);
        toast.error(err || 'Failed to get a response');
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

  return (
    <div className="relative flex flex-col h-full">
      {/* Header */}
      <header className="px-6 py-3.5 border-b border-border flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="font-semibold text-foreground text-sm">
            {conv?.title ?? 'Loading…'}
          </h2>
          {conv?.mode === 'rag' && (
            <span className="text-[10px] text-zinc-500 border border-zinc-800 rounded px-1.5 py-0.5">
              RAG
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={toggleDetails}
            className="flex items-center gap-2 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
            title={showDetails ? 'Hide message details' : 'Show message details'}
          >
            <span>Details</span>
            <span
              className={cn(
                'relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border transition-colors duration-200',
                showDetails
                  ? 'bg-zinc-300 border-zinc-300'
                  : 'bg-zinc-700 border-zinc-700',
              )}
            >
              <span
                className={cn(
                  'pointer-events-none inline-block h-3 w-3 rounded-full bg-black shadow transition-transform duration-200 mt-[1px]',
                  showDetails ? 'translate-x-3.5' : 'translate-x-0.5',
                )}
              />
            </span>
          </button>

          {conv?.mode === 'rag' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDocsPanel(true)}
              className="border-border text-zinc-300 hover:text-white text-xs gap-1.5"
            >
              <BookOpen className="h-3 w-3" />
              Files
              {attachedDocs.length > 0 && (
                <span className="ml-0.5 text-[10px] text-zinc-500">
                  ({attachedDocs.length})
                </span>
              )}
            </Button>
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
            showDetails={showDetails}
          />
        ))}

        {sending && !streamingText && (
          <div className="flex justify-start">
            <div className="px-4 py-3 rounded-2xl rounded-bl-sm bg-card border border-border">
              <TypingDots />
            </div>
          </div>
        )}

        {streamingText && (
          <div className="flex justify-start">
            <div className="max-w-[75%] px-4 py-3 rounded-2xl rounded-bl-sm bg-card border border-border text-foreground text-sm">
              <MarkdownContent content={streamingText} />
              <span className="inline-block w-1.5 h-4 bg-muted-foreground ml-0.5 animate-pulse rounded-sm align-middle" />
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
        {showDetails && pendingUserTokens !== null && (
          <p className="text-[10px] text-muted-foreground mb-1.5 text-right">
            ~{pendingUserTokens} tokens
          </p>
        )}
        <div
          className={cn(
            'flex gap-3 items-end rounded-xl border border-border bg-card px-3 py-2 transition-shadow',
            'focus-within:ring-2 focus-within:ring-ring focus-within:border-ring/50',
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
            className="h-8 w-8 shrink-0 disabled:opacity-40"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Documents panel */}
      <DocsPanel
        open={showDocsPanel}
        onClose={() => setShowDocsPanel(false)}
        convId={id}
        attached={attachedDocs}
        library={library}
        onAttach={handleAttach}
        onDetach={handleDetach}
        onPreview={setPreviewDoc}
        onUpload={async (file) => {
          setUploading(true);
          try {
            const doc = await uploadDocument(id, file);
            setAttachedDocs((prev) => [...prev, doc]);
            setLibrary((prev) => [doc, ...prev]);
            toast.success(`"${file.name}" uploaded and attached`);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Upload failed');
          } finally {
            setUploading(false);
          }
        }}
        uploading={uploading}
      />

      {/* PDF preview modal */}
      <Dialog open={!!previewDoc} onOpenChange={(o) => !o && setPreviewDoc(null)}>
        <DialogContent className="bg-card border-border max-w-4xl w-full h-[80vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-4 py-3 border-b border-border shrink-0">
            <DialogTitle className="text-sm font-medium flex items-center gap-2">
              <FileText className="h-4 w-4 text-zinc-400" />
              {previewDoc?.filename}
            </DialogTitle>
          </DialogHeader>
          {previewDoc?.r2_url && (
            <iframe
              src={previewDoc.r2_url}
              className="flex-1 w-full border-0 rounded-b-lg"
              title={previewDoc.filename}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface MessageBubbleProps {
  msg: Message;
  showDetails: boolean;
}

function MessageBubble({ msg, showDetails }: MessageBubbleProps) {
  const isUser = msg.role === 'user';
  const [expanded, setExpanded] = useState(false);
  const showTokens = showDetails || expanded;

  const tokens = msg.tokenCount ?? 0;
  const sources = msg.sources ?? [];
  const hasSources = !isUser && sources.length > 0;
  const hasTokens = tokens > 0;

  return (
    <div className={cn('flex flex-col', isUser ? 'items-end' : 'items-start')}>
      <div
        className={cn(
          'max-w-[75%] px-4 py-3 rounded-2xl text-sm',
          isUser
            ? 'bg-zinc-800 text-foreground rounded-br-sm leading-relaxed whitespace-pre-wrap'
            : 'bg-card border border-border text-foreground rounded-bl-sm',
        )}
      >
        {isUser ? msg.content : <MarkdownContent content={msg.content} />}
      </div>

      {/* File references — always visible */}
      {hasSources && (
        <div className="max-w-[75%] mt-1.5 flex flex-wrap gap-1.5 px-1">
          {sources.map((s) => (
            <span
              key={s.documentId}
              className="inline-flex items-center gap-1 text-[10px] text-zinc-500 bg-zinc-800/40 border border-zinc-800 rounded-md px-2 py-0.5"
            >
              <FileText className="h-2.5 w-2.5 shrink-0" />
              {s.filename}
            </span>
          ))}
        </div>
      )}

      {/* Token count — behind the Details toggle */}
      {hasTokens && (
        <div className="mt-0.5 px-1">
          {!showDetails && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="flex items-center gap-1 text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              {showTokens ? <ChevronUp className="h-2.5 w-2.5" /> : <ChevronDown className="h-2.5 w-2.5" />}
              {showTokens ? 'hide' : 'details'}
            </button>
          )}
          {showTokens && (
            <span className="text-[10px] text-zinc-500">{tokens} tokens</span>
          )}
        </div>
      )}
    </div>
  );
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-0.5">
      <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce [animation-delay:0ms]" />
      <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce [animation-delay:160ms]" />
      <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce [animation-delay:320ms]" />
    </div>
  );
}

interface DocsPanelProps {
  open: boolean;
  onClose: () => void;
  convId: string;
  attached: Document[];
  library: Document[];
  onAttach: (doc: Document) => Promise<void>;
  onDetach: (docId: string) => Promise<void>;
  onPreview: (doc: Document) => void;
  onUpload: (file: File) => Promise<void>;
  uploading: boolean;
}

function DocsPanel({
  open, onClose, attached, library, onAttach, onDetach, onPreview, onUpload, uploading,
}: DocsPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachedIds = new Set(attached.map((d) => d.id));
  const unattached = library.filter((d) => !attachedIds.has(d.id));

  if (!open) return null;

  return (
    <div className="absolute inset-0 z-20 flex">
      {/* backdrop */}
      <div className="flex-1 bg-black/40" onClick={onClose} />

      {/* panel */}
      <div className="w-80 bg-[#111114] border-l border-border flex flex-col h-full shrink-0">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between shrink-0">
          <span className="text-sm font-medium text-foreground">Files</span>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Attached */}
          <div>
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">
              Attached ({attached.length})
            </p>
            {attached.length === 0 ? (
              <p className="text-xs text-zinc-600">No files attached yet.</p>
            ) : (
              <ul className="space-y-1">
                {attached.map((doc) => (
                  <li key={doc.id} className="flex items-center gap-2 group">
                    <FileText className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                    <span className="text-xs text-zinc-300 truncate flex-1">{doc.filename}</span>
                    <button
                      onClick={() => onPreview(doc)}
                      className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-zinc-300 transition-all"
                      title="Preview"
                    >
                      <Eye className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => void onDetach(doc.id)}
                      className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400 transition-all"
                      title="Remove from conversation"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Library */}
          {unattached.length > 0 && (
            <div>
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">
                Library
              </p>
              <ul className="space-y-1">
                {unattached.map((doc) => (
                  <li key={doc.id} className="flex items-center gap-2 group">
                    <FileText className="h-3.5 w-3.5 text-zinc-600 shrink-0" />
                    <span className="text-xs text-zinc-500 truncate flex-1">{doc.filename}</span>
                    <button
                      onClick={() => onPreview(doc)}
                      className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-zinc-300 transition-all"
                      title="Preview"
                    >
                      <Eye className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => void onAttach(doc)}
                      className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-zinc-300 transition-all"
                      title="Attach to conversation"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Upload new */}
        <div className="p-4 border-t border-border shrink-0">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onUpload(file);
              if (fileInputRef.current) fileInputRef.current.value = '';
            }}
          />
          <Button
            variant="outline"
            size="sm"
            className="w-full border-border text-zinc-400 hover:text-white text-xs gap-1.5"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Paperclip className="h-3 w-3" />
            )}
            {uploading ? 'Uploading…' : 'Upload new PDF'}
          </Button>
        </div>
      </div>
    </div>
  );
}
