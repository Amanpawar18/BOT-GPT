'use client';
import { useEffect, useState } from 'react';
import { FileText, Trash2, Upload, FolderOpen, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import {
  getDocuments,
  deleteDocument,
  getConversations,
  uploadDocument,
  type Document,
  type Conversation,
} from '@/lib/api';

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadConvId, setUploadConvId] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const ragConversations = conversations.filter((c) => c.mode === 'rag');

  useEffect(() => {
    Promise.all([
      getDocuments(),
      getConversations(),
    ])
      .then(([docs, convs]) => {
        setDocuments(docs);
        setConversations(convs);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  function getConversationTitle(convId: string) {
    return conversations.find((c) => c.id === convId)?.title ?? convId;
  }

  async function handleDelete(id: string) {
    await deleteDocument(id);
    setDocuments((prev) => prev.filter((d) => d.id !== id));
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!uploadFile || !uploadConvId) return;
    setUploading(true);
    try {
      await uploadDocument(uploadConvId, uploadFile);
      const docs = await getDocuments();
      setDocuments(docs);
      setUploadOpen(false);
      setUploadFile(null);
      setUploadConvId('');
    } catch (err) {
      console.error(err);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <header className="px-6 py-4 border-b border-border flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Documents</h1>
          <p className="text-sm text-muted-foreground">
            {documents.length} file{documents.length !== 1 ? 's' : ''} across
            all conversations
          </p>
        </div>
        <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
          <DialogTrigger asChild>
            <Button
              className="bg-primary hover:bg-primary/90 gap-1.5"
              disabled={ragConversations.length === 0}
              title={
                ragConversations.length === 0
                  ? 'Create a RAG conversation first'
                  : undefined
              }
            >
              <Upload className="h-4 w-4" />
              Upload
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-zinc-900 border-zinc-700">
            <DialogHeader>
              <DialogTitle>Upload document</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleUpload} className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label>Conversation</Label>
                <Select value={uploadConvId} onValueChange={setUploadConvId}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700">
                    <SelectValue placeholder="Select a RAG conversation…" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-800 border-zinc-700">
                    {ragConversations.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.title || 'Untitled'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>PDF file</Label>
                <input
                  type="file"
                  accept=".pdf"
                  required
                  onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-muted-foreground file:mr-4 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:bg-zinc-700 file:text-foreground hover:file:bg-zinc-600 cursor-pointer"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 border-zinc-700"
                  onClick={() => setUploadOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={uploading || !uploadFile || !uploadConvId}
                  className="flex-1 bg-primary hover:bg-primary/90"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Uploading…
                    </>
                  ) : (
                    'Upload'
                  )}
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
              <Skeleton key={i} className="h-12 w-full rounded-lg bg-zinc-800" />
            ))}
          </div>
        ) : documents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-60 gap-4">
            <FolderOpen className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground text-sm text-center">
              No documents yet.
              <br />
              Upload a PDF in any RAG conversation.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground">Name</TableHead>
                  <TableHead className="text-muted-foreground">
                    Conversation
                  </TableHead>
                  <TableHead className="text-muted-foreground">Status</TableHead>
                  <TableHead className="text-muted-foreground">
                    Uploaded
                  </TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((doc) => (
                  <TableRow key={doc.id} className="border-border">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium truncate max-w-[200px]">
                          {doc.filename}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {getConversationTitle(doc.conversation_id)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          doc.status === 'ready'
                            ? 'border-green-700 text-green-400 text-[10px]'
                            : doc.status === 'failed'
                              ? 'border-red-700 text-red-400 text-[10px]'
                              : 'border-zinc-600 text-zinc-400 text-[10px]'
                        }
                      >
                        {doc.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(doc.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="bg-zinc-900 border-zinc-700">
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete document?</AlertDialogTitle>
                            <AlertDialogDescription className="text-muted-foreground">
                              This will permanently delete{' '}
                              <strong className="text-foreground">
                                {doc.filename}
                              </strong>{' '}
                              and remove all its vector chunks. This action
                              cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel className="border-zinc-700">
                              Cancel
                            </AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDelete(doc.id)}
                              className="bg-destructive hover:bg-destructive/90"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
