import { getToken } from './auth';

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/v1';

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
      ...(init?.headers as Record<string, string>),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function apiLogin(
  email: string,
  password: string,
): Promise<string> {
  const data = await request<{ access_token: string }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  return data.access_token;
}

export async function apiRegister(
  email: string,
  password: string,
): Promise<string> {
  const data = await request<{ access_token: string }>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  return data.access_token;
}

export interface Conversation {
  id: string;
  title: string;
  mode: 'open' | 'rag';
  context_strategy: 'sliding_window' | 'summarization';
  created_at: string;
  updated_at: string;
}

export interface DocSource {
  documentId: string;
  filename: string;
  content?: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  tokenCount?: number;
  sources?: DocSource[];
}

export interface ConversationDetail extends Conversation {
  messages: Message[];
}

export async function getConversations(): Promise<Conversation[]> {
  const data = await request<{ data: Conversation[] }>('/conversations');
  return data.data;
}

export async function createConversation(
  title: string,
  mode: 'open' | 'rag',
  context_strategy: 'sliding_window' | 'summarization' = 'sliding_window',
): Promise<Conversation> {
  return request<Conversation>('/conversations', {
    method: 'POST',
    body: JSON.stringify({ title, mode, context_strategy }),
  });
}

export async function getConversation(
  id: string,
): Promise<ConversationDetail> {
  return request<ConversationDetail>(`/conversations/${id}`);
}

export async function deleteConversation(id: string): Promise<void> {
  await fetch(`${API_BASE}/conversations/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
}

export interface StreamDoneMeta {
  userTokens: number;
  assistantTokens: number;
  sources: DocSource[];
}

export async function streamMessage(
  conversationId: string,
  content: string,
  onToken: (token: string) => void,
  onDone: (full: string, meta: StreamDoneMeta) => void,
  onError: (err: string) => void,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
      },
      body: JSON.stringify({ content }),
    });
  } catch (err) {
    onError(String(err));
    return;
  }

  if (!res.ok) {
    try {
      const data = await res.json() as { error?: string };
      onError(data.error ?? `HTTP ${res.status}`);
    } catch {
      onError(`HTTP ${res.status}`);
    }
    return;
  }
  if (!res.body) {
    onError('No response body');
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let accumulated = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const payload = line.slice(6);
      try {
        const parsed = JSON.parse(payload) as {
          token?: string;
          error?: string;
          done?: boolean;
          userTokens?: number;
          assistantTokens?: number;
          sources?: DocSource[];
        };
        if (parsed.error) {
          onError(parsed.error);
          return;
        }
        if (parsed.done) {
          onDone(accumulated, {
            userTokens: parsed.userTokens ?? 0,
            assistantTokens: parsed.assistantTokens ?? 0,
            sources: parsed.sources ?? [],
          });
          return;
        }
        if (parsed.token) {
          accumulated += parsed.token;
          onToken(parsed.token);
        }
      } catch {
        // skip malformed lines
      }
    }
  }
  onDone(accumulated, { userTokens: 0, assistantTokens: 0, sources: [] });
}

export async function uploadDocument(
  conversationId: string,
  file: File,
): Promise<void> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${API_BASE}/documents/${conversationId}`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
}

export interface Document {
  id: string;
  user_id: string;
  conversation_id: string;
  filename: string;
  r2_url: string;
  status: 'processing' | 'ready' | 'failed';
  created_at: string;
}

export async function getDocuments(): Promise<Document[]> {
  return request<Document[]>('/documents');
}

export async function deleteDocument(id: string): Promise<void> {
  await fetch(`${API_BASE}/documents/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
}
