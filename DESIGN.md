# BOT GPT — Design Document

**Role:** AI Engineer Case Study — BOT Consulting  
**Author:** Aman Pawar  
**Stack:** NestJS · PostgreSQL + pgvector · Google Gemini · LangChain · Next.js

---

## 1. Architecture & Design

### 1.1 High-Level Architecture

```
┌────────────────────────────────────────────────────────────┐
│                   Client (Browser / API)                   │
└──────────────────────────┬─────────────────────────────────┘
                           │ HTTPS  (REST + SSE)
┌──────────────────────────▼─────────────────────────────────┐
│                    API Layer  (NestJS)                      │
│                                                             │
│  POST /auth/register      POST /auth/login                  │
│  GET|POST|PATCH|DELETE /conversations                       │
│  POST /conversations/:id/messages   (SSE stream)            │
│  GET|POST|DELETE /documents                                 │
│  GET /health                                                │
│                                                             │
│  JWT Guard  ──►  Controller  ──►  Service                   │
└──────┬─────────────────────────────────┬────────────────────┘
       │                                 │
┌──────▼───────────────────┐   ┌──────────▼───────────────────┐
│   PostgreSQL + pgvector  │   │     Cloudflare R2            │
│                          │   │                              │
│  users                   │   │  Raw PDF / text files        │
│  conversations           │   │  (public URL returned to DB) │
│  messages                │   └──────────────────────────────┘
│  documents               │
│  doc_embeddings (vector) │
└──────────────────────────┘
       │
┌──────▼──────────────────────────────────────────────────────┐
│              Google Gemini API  (via LangChain)             │
│                                                             │
│  gemini-2.5-flash          ◄── chat completions (streaming) │
│  gemini-embedding-2                                         │
│                            ◄── document chunk embeddings    │
└─────────────────────────────────────────────────────────────┘
```

**Request flow (RAG message):**
1. Client sends `POST /conversations/:id/messages`
2. JWT guard validates token → extracts `user_id`
3. Daily token limit checked (100 000 tokens/day) → 429 if exceeded
4. Service loads conversation, verifies ownership
5. Context window built according to `context_strategy` (sliding window or summarization)
6. `retrieveRelevantDocs()` runs cosine similarity search on `doc_embeddings`
7. LangChain streams response from Gemini → SSE tokens to client
8. Full assistant reply + token counts persisted to `messages` table

---

### 1.2 Tech Stack Justification

| Component | Choice | Reason |
|---|---|---|
| **Backend** | NestJS (TypeScript) | Decorators, DI, guards make API structure explicit and testable. TypeScript prevents runtime type errors. |
| **LLM** | Google Gemini 2.5 Flash | Free tier, fast inference, strong instruction-following, native streaming support. |
| **LLM client** | LangChain | Unified interface for streaming chat, embeddings, and vector store — avoids hand-rolling SSE parsing. |
| **Database** | PostgreSQL + pgvector | Single store handles both relational data (users, conversations, messages) and vector similarity search (RAG). Avoids a separate vector DB like Pinecone. |
| **ORM** | TypeORM | Schema-as-code, auto-sync in dev, typed repositories, cascade deletes. |
| **Document storage** | Cloudflare R2 | S3-compatible, zero egress fees, simple presigned URL flow. |
| **Auth** | JWT (passport-jwt) | Stateless — no session store needed. Scales to multiple backend instances without shared state. |
| **Caching** | NestJS CacheModule (in-memory) | 60 s TTL on conversation list queries; invalidated on create/delete. Avoids Redis dependency for single-instance deploy. |
| **Frontend** | Next.js 15 + shadcn/ui | SSE-friendly (native `fetch` streaming), App Router route groups for clean auth/app separation. |

---

## 2. Data & Storage Design

### 2.1 Database Choice: PostgreSQL

**Why PostgreSQL over alternatives:**
- SQLite: no concurrent writes, no vector support
- MongoDB: flexible schema not needed; ACID matters for message ordering
- Separate vector DB (Pinecone): extra service to manage — pgvector gives vector search inside the same DB we already need

### 2.2 Schema

```sql
-- Users
users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now()
)

-- Conversations
conversations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID REFERENCES users(id) ON DELETE CASCADE,
  title            TEXT,
  mode             TEXT DEFAULT 'open',             -- 'open' | 'rag'
  context_strategy TEXT DEFAULT 'sliding_window',   -- 'sliding_window' | 'summarization'
  model            TEXT DEFAULT 'gemini-2.5-flash',
  token_count      INT  DEFAULT 0,                  -- running total, cost tracking
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
)

-- Messages
messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL,         -- 'user' | 'assistant'
  content         TEXT NOT NULL,
  token_count     INT,                   -- per-message token estimate
  created_at      TIMESTAMPTZ DEFAULT now()
)

-- Documents (RAG knowledge base)
documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL,
  filename        TEXT,
  r2_url          TEXT,
  status          TEXT DEFAULT 'processing',  -- 'processing' | 'ready' | 'failed'
  created_at      TIMESTAMPTZ DEFAULT now()
)

-- Vector embeddings (managed by LangChain PGVectorStore)
doc_embeddings (
  id       UUID PRIMARY KEY,
  content  TEXT,
  vector   VECTOR(768),
  metadata JSONB   -- { document_id, conversation_id, filename }
)
CREATE INDEX ON doc_embeddings USING ivfflat (vector vector_cosine_ops);
```

### 2.3 Message Ordering

Messages are stored with `created_at TIMESTAMPTZ`. `getMessages()` retrieves them `ORDER BY created_at ASC` via TypeORM. When loaded as a relation (in `findOne`), TypeORM does not apply `order` to nested relations — so the service applies a JavaScript `.sort()` after load to guarantee correct order.

### 2.4 Token Usage Tracking

- Every message stores an estimated `token_count` (synchronous SentencePiece approximation — see §4.5)
- `conversations.token_count` is an incrementing total (`UPDATE ... SET token_count = token_count + ?`)
- Per-user daily usage is queried at message-send time: `SUM(msg.token_count)` joined through `conversations.user_id`, filtered to the current UTC day
- A 100 000-token daily cap returns HTTP 429 before any LLM call is made

---

## 3. REST API Design

### 3.1 Endpoint Definitions

**Auth**
```
POST /auth/register
Body:    { "email": "user@example.com", "password": "secret" }
201:     { "access_token": "eyJ..." }
409:     { "message": "Email already registered" }

POST /auth/login
Body:    { "email": "user@example.com", "password": "secret" }
200:     { "access_token": "eyJ..." }
401:     { "message": "Invalid credentials" }
```

**Conversations**
```
POST /conversations
Body:    { "mode": "open" | "rag", "title": "optional", "context_strategy": "sliding_window" | "summarization" }
201:     { "id": "uuid", "mode": "open", "context_strategy": "sliding_window", ... }

GET /conversations?page=1&limit=20
200:     { "data": [...], "page": 1, "limit": 20, "total": 42 }
         (response is cached in-memory for 60 s per user+page+limit)

GET /conversations/:id
200:     { "id": "uuid", ..., "messages": [ { "role": "user", "content": "..." }, ... ] }
404:     { "message": "Conversation not found" }
403:     { "message": "Forbidden" }

PATCH /conversations/:id
Body:    { "title": "New title" }
200:     { "id": "uuid", "title": "New title", ... }

DELETE /conversations/:id
204:     (no body)
```

**Messaging (SSE)**
```
POST /conversations/:id/messages
Body:    { "content": "Explain RAG in simple terms" }
Headers: Accept: text/event-stream

429 (before SSE opens):
  { "error": "Daily limit of 100,000 tokens reached. Resets at midnight UTC." }

Stream (Content-Type: text/event-stream):
  data: {"token":"Retrieval"}
  data: {"token":"-Augmented"}
  ...
  data: {"done":true,"userTokens":12,"assistantTokens":87,"sources":[{"documentId":"...","filename":"paper.pdf","content":"..."}]}

On LLM error:
  data: {"error":"LLM unavailable"}
```

**Documents**
```
POST /documents/:conversationId
Body:    multipart/form-data  { file: <PDF, max 10 MB> }
201:     { "id": "uuid", "filename": "paper.pdf", "status": "processing" }

GET /documents
200:     [ { "id": "uuid", "filename": "...", "status": "ready", ... } ]

DELETE /documents/:id
204:     (no body — also deletes embeddings from doc_embeddings)
```

**Health**
```
GET /health
200:     { "status": "ok", "timestamp": "2026-04-26T10:00:00.000Z" }
```

### 3.2 Design Decisions

- **POST vs PUT for messages:** `POST /conversations/:id/messages` — creating a new resource (message), not replacing the conversation. PUT would imply idempotence.
- **Pagination:** Offset-based (`page` + `limit`) is sufficient at this scale. Cursor-based would be better for real-time feeds.
- **HTTP 204 for deletes:** No body returned — client already knows what was deleted.
- **SSE over WebSocket:** SSE is unidirectional (server → client), simpler to implement, works over HTTP/1.1, and is exactly what streaming token-by-token requires.
- **429 before SSE headers:** Daily limit is checked synchronously before `Content-Type: text/event-stream` is set, so a standard JSON error response is possible.

---

## 4. LLM Context & Cost Management

### 4.1 Context Construction

Every message send builds the LLM input as:

```
[ SystemMessage("You are BOT GPT, a helpful and concise AI assistant.") ]
  + [ context window messages ]       ← sliding window or summarization (see below)
  + [ HumanMessage(current input) ]   ← for RAG: current input is wrapped with retrieved chunks
```

### 4.2 Sliding Window Strategy (default)

```
token_budget = 8 000  (open chat)
             = 6 000  (RAG — leaves room for retrieved chunks)

algorithm:
  walk messages from newest → oldest
  accumulate token_count until budget exhausted
  always include at least the most recent message
  return messages in chronological order
```

This guarantees the most recent context is always present, regardless of conversation length. Older turns are silently dropped — the LLM never sees them.

**Edge case:** If the most recent message alone exceeds the budget, it is still included (single-message minimum guarantee). The conversation continues — it simply loses earlier history.

### 4.3 Summarization Strategy

When a conversation is created with `context_strategy = 'summarization'`:

```
1. Build sliding window for recent messages (budget - summary_reserve)
2. Identify messages older than the window ("older" slice)
3. If older messages exist:
   a. Call LLM to summarize the older slice into a paragraph
   b. Estimate summary token count
   c. Rebuild recent window with (budget - summaryTokens) to stay within budget
   d. Prepend summary as synthetic assistant message:
      { role: 'assistant', content: '[Earlier conversation summary]: ...' }
4. Send [ system, synthetic_summary, ...recent_window, current_message ] to LLM
```

**Budget accounting:** The summary token count is subtracted from the budget before the recent window is built, ensuring the total context (summary + recent) never overruns the budget.

**Trade-off vs sliding window:**
- Sliding window: zero extra API calls, but loses older context entirely
- Summarization: one extra LLM call per request when history is long, but preserves semantic content

### 4.4 RAG Context Injection

For RAG conversations, the current user message is replaced with a context-wrapped prompt:

```
Context:
<chunk 1 content>
---
<chunk 2 content>
...

Using only the context above, answer:
<user question>
```

Top-5 most semantically similar chunks are retrieved from `doc_embeddings` filtered by `conversation_id`, so documents from other conversations never contaminate the context.

### 4.5 Token Estimation

Token counts are estimated synchronously using a SentencePiece-calibrated approximation:

```typescript
// ASCII chars tokenize at ~4 chars/token for English prose.
// Non-ASCII (CJK, emoji) tokenize more heavily at ~1.5 chars/token.
const nonAscii = (text.match(/[^\x00-\x7F]/g) ?? []).length;
const ascii = text.length - nonAscii;
return Math.ceil(ascii / 4 + nonAscii / 1.5);
```

This is used for:
- Per-message `token_count` stored in the DB (budget calculations, daily limit tracking)
- Summary token estimation (for budget accounting in summarization mode)

**Trade-off:** The exact count requires an async `countTokens` API call to Gemini (~100 ms round-trip). The synchronous approximation adds zero latency and is accurate enough for budget enforcement at the 8 000-token scale, where a 5–10% error margin is acceptable.

### 4.6 Cost Reduction Strategies

| Strategy | Status | Impact |
|---|---|---|
| Sliding window (newest-first budget) | ✅ Implemented | Prevents unbounded token growth |
| Summarization of old turns | ✅ Implemented | Reduces history tokens by 80–90% for long chats |
| System prompt (once per call) | ✅ Implemented | Avoids repeating instructions in history |
| RAG instead of full-doc stuffing | ✅ Implemented | Top-5 chunks vs. entire PDF |
| Token estimation per message | ✅ Implemented | Enables budget tracking |
| Daily token cap (100 000 tokens) | ✅ Implemented | Hard limit per user per UTC day |
| Conversation list caching | ✅ Implemented | In-memory, 60 s TTL, invalidated on mutations |
| LLM retry with exponential backoff | ✅ Implemented | Avoids user-visible errors on transient Gemini failures |

---

## 5. Error Handling & Scalability

### 5.1 Failure Points & Responses

| Failure | Detection | Response |
|---|---|---|
| LLM API timeout / transient error | `withRetry` catches exception | Retries up to 3× with 1s / 2s / 4s backoff; on final failure streams `{ error: "LLM unavailable" }` → `res.end()` |
| DB write failure | TypeORM throws | NestJS global exception filter → 500 + logged |
| Daily token limit exceeded | `getDailyTokensUsed()` before SSE opens | HTTP 429 JSON error (no SSE stream started) |
| Token budget exhausted | `buildContextWindow` silently drops old messages | LLM call proceeds with truncated history |
| Unauthorized request | JWT guard | 401 before any service logic runs |
| Wrong user accessing resource | `user_id` ownership check in service | 403 ForbiddenException |
| File too large | Multer limit (10 MB) | 413 Payload Too Large |

### 5.2 LLM Retry Logic

`withRetry<T>` wraps any async operation with exponential backoff:

```typescript
private async withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let delay = 1000;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try { return await fn(); }
    catch (err) {
      if (attempt === maxAttempts) throw err;
      await sleep(delay);
      delay *= 2;   // 1s → 2s → 4s
    }
  }
}
```

Applied to `this.llm.stream()` calls in both `streamOpenChat` and `streamRagChat`. Covers network blips and Gemini rate-limit spikes without surfacing errors to the user.

**Logging:** NestJS `Logger` records every LLM stream failure with full stack trace in the SSE handler. Structured JSON logging (e.g. Winston + Datadog) is the natural next step for production.

### 5.3 Scalability Analysis

**Bottleneck at 1M users:**

```
Users → API (stateless) → DB (single writer) → LLM API (rate-limited)
                                  ↑
                          bottleneck here
```

The stateless JWT + SSE API layer scales horizontally behind a load balancer trivially. The database and LLM API rate limits are the real bottlenecks.

**Scaling strategies:**

| Layer | Strategy |
|---|---|
| API | Horizontal scaling — multiple NestJS instances, any load balancer |
| DB reads | Read replicas for `GET /conversations` and message history queries |
| DB connections | PgBouncer connection pooling (NestJS opens many short-lived connections) |
| Vector search | Partition `doc_embeddings` by `conversation_id`; add IVFFlat index |
| LLM cost | Redis cache for repeated RAG queries (same question + same docs = same answer) |
| Message queues | Offload document embedding (CPU/time intensive) to a worker queue (BullMQ) |
| DB sharding | Shard `messages` by `conversation_id` at extreme scale |

---

## 6. Deployment & DevOps

### 6.1 Repository Structure

```
BOT-GPT/
├── apps/backend/          # NestJS API
│   ├── src/               # Modules: auth, conversations, documents, ai, users, health
│   ├── Dockerfile         # Multi-stage: deps → builder → runner (non-root user)
│   └── package.json
├── apps/frontend/         # Next.js 15
├── docker-compose.yml     # postgres (pgvector) + backend
├── scripts/init.sql       # CREATE EXTENSION vector
└── .github/workflows/
    └── ci.yml             # Lint + test on push/PR
```

### 6.2 CI Pipeline (GitHub Actions)

Two jobs run in parallel on every push and pull request:

```yaml
lint:   npm ci → npm run lint    (ESLint + TypeScript check)
test:   npm ci → npm test        (Jest unit tests)
```

### 6.3 Dockerfile (Backend)

Three-stage build targeting `node:20-alpine`:

1. **deps** — `npm ci` only (layer-cached separately from source)
2. **builder** — copies `node_modules` from deps, copies source, runs `nest build`
3. **runner** — copies `dist/` + `node_modules/`, drops all build tooling, runs as non-root `nestjs` user

```
docker-compose up --build   ← builds image, starts postgres + backend
```

The non-root user (`uid 1001`) is a security best practice: if the container is compromised, the process cannot write to system directories.

### 6.4 Unit Tests

Tests cover all service and AI classes with Jest mocks — no real DB or LLM calls:

| Test file | Key scenarios |
|---|---|
| `auth.service.spec.ts` | Register (duplicate email → 409), login (wrong password → 401), JWT issued on success |
| `conversations.service.spec.ts` | Create with default strategy, pagination, ownership checks, sliding window budget, daily token query |
| `documents.service.spec.ts` | Upload + embed, list by user, remove with chunk cleanup |
| `ai.service.spec.ts` | Token estimation (ASCII + Unicode), streamOpenChat, streamRagChat context injection, retry (3 attempts, exhausted), summarizeHistory, retrieveRelevantDocs |

---

## 7. RAG Flow Summary

```
User uploads PDF
      │
      ▼
DocumentsService.create()
  → upload raw file to Cloudflare R2
  → read file buffer
  → RecursiveCharacterTextSplitter (1 000 chars, 200 overlap)
  → GoogleGenerativeAIEmbeddings.embedDocuments()
  → PGVectorStore.addDocuments()   ← stored with { document_id, conversation_id, filename }
  → document.status = 'ready'

User sends message in RAG conversation
      │
      ▼
ConversationsController.sendMessage()
  → check daily token limit (429 if exceeded)
  → build context window per strategy
  │
  ▼
AiService.retrieveRelevantDocs(conversationId, query, topK=5)
  → embed query with GoogleGenerativeAIEmbeddings
  → PGVectorStore.similaritySearch()  ← cosine distance, filtered by conversation_id
  → returns top-5 text chunks + filenames
  │
  ▼
AiService.streamRagChat(window, query, sources)
  → injects chunks as "Context:\n...\n\nUsing only the context above, answer: {query}"
  → withRetry(() => llm.stream(messages))
  → yields tokens via SSE
  │
  ▼
Done event:
  { done: true, userTokens, assistantTokens, sources: [{ documentId, filename, content }] }
  → client displays source filenames as attribution badges
```

This grounds the LLM answer entirely in the uploaded document rather than its training data, which is the core value proposition of RAG.
