# BOT GPT

A production-grade conversational AI platform with two chat modes: **Open Chat** (general-purpose LLM conversation) and **RAG Mode** (retrieval-augmented generation grounded in uploaded documents).

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Next.js Frontend                     │
│   Auth pages │ Conversations list │ Chat UI │ Documents UI  │
└────────────────────────┬────────────────────────────────────┘
                         │ REST + SSE
┌────────────────────────▼────────────────────────────────────┐
│                     NestJS Backend (API Layer)              │
│  /auth  │  /conversations  │  /conversations/:id/messages   │
│                      /documents  │  /health                 │
└─────────────────────┬───────────────────┬───────────────────┘
                      │                   │
┌─────────────────────▼──────┐  ┌─────────▼──────────────────────────┐
│   PostgreSQL               |  |                                    |
|           + pgvector       │  |   Cloudflare R2.                   │
│  Users, Conversations.     │  │   Raw document file storage        │
│  Messages, Documents       │  └────────────────────────────────────┘
│  doc_embeddings (vector).  │
└─────────────┬──────────────┘
              │
┌─────────────▼───────────────────────────────────────────────┐
│           Google Gemini API (via LangChain)                 │
│  gemini-2.5-flash (chat)  │  gemini-embedding-2 (RAG)       │
└─────────────────────────────────────────────────────────────┘
```

**Layers:**
- **API layer** — NestJS controllers with JWT guards, DTOs, and SSE streaming
- **Service layer** — Business logic: conversation management, context window, RAG retrieval
- **Persistence layer** — TypeORM + PostgreSQL for relational data; PGVectorStore for embeddings
- **LLM integration** — LangChain `ChatGoogleGenerativeAI` for streaming chat; `GoogleGenerativeAIEmbeddings` + cosine similarity for RAG

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Backend framework | NestJS (TypeScript) | Modular DI, guards, interceptors — scales cleanly |
| LLM provider | Google Gemini 2.5 Flash | Free tier, fast, strong instruction following |
| LLM orchestration | LangChain | Unified streaming + embeddings interface |
| Database | PostgreSQL + pgvector | ACID transactions + native vector similarity search |
| ORM | TypeORM | Schema as code, migrations, typed queries |
| Document storage | Cloudflare R2 | S3-compatible, free egress |
| Auth | JWT (passport-jwt) | Stateless, scales horizontally |
| Frontend | Next.js 15 + shadcn/ui | Optional bonus UI |

---

## Prerequisites

- Node.js 22+
- Docker & Docker Compose
- A [Google Gemini API key](https://aistudio.google.com/app/apikey) (free tier)
- A [Cloudflare R2](https://developers.cloudflare.com/r2/) bucket (free tier)

---

## Quick Start

### 1. Clone and install

```bash
git clone <repo-url>
cd BOT-GPT
npm install --prefix apps/backend
```

### 2. Configure environment

```bash
cp apps/backend/.env.example apps/backend/.env
```

Edit `apps/backend/.env`:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/botgpt
JWT_SECRET=change-me-in-production
JWT_EXPIRES_IN=7d

# Get from https://aistudio.google.com/app/apikey
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-2.5-flash
GEMINI_EMBEDDING_MODEL=text-embedding-004

# Cloudflare R2 credentials
R2_ACCOUNT_ID=your-cloudflare-account-id
R2_ACCESS_KEY_ID=your-r2-access-key
R2_SECRET_ACCESS_KEY=your-r2-secret-key
R2_BUCKET_NAME=botgpt-documents
R2_PUBLIC_URL=https://your-bucket.r2.dev

PORT=3001
```

### 3. Start the database

```bash
docker-compose up postgres -d
```

This starts PostgreSQL 17 with the `pgvector` extension enabled (required for RAG embeddings).

### 4. Start the backend

```bash
cd apps/backend
npm run start:dev
```

The API is now running at `http://localhost:3001`.

### 5. (Optional) Start the frontend

```bash
cd apps/frontend
cp .env.local.example .env.local  # set NEXT_PUBLIC_API_URL=http://localhost:3001
npm install
npm run dev
```

The UI is available at `http://localhost:3000`.

### Run everything with Docker Compose

```bash
docker-compose up --build
```

---

## API Reference

All endpoints (except `/auth/*` and `/health`) require a JWT bearer token:
```
Authorization: Bearer <token>
```

### Auth

| Method | Endpoint | Body | Description |
|---|---|---|---|
| POST | `/auth/register` | `{ email, password }` | Register a new user |
| POST | `/auth/login` | `{ email, password }` | Login, returns JWT |

### Conversations

| Method | Endpoint | Description |
|---|---|---|
| POST | `/conversations` | Create a conversation (`mode`: `open` or `rag`) |
| GET | `/conversations?page=1&limit=20` | List user's conversations (paginated) |
| GET | `/conversations/:id` | Get conversation with full message history |
| PATCH | `/conversations/:id` | Update conversation title |
| DELETE | `/conversations/:id` | Delete conversation and all its messages |

### Messaging (SSE Streaming)

```
POST /conversations/:id/messages
Content-Type: application/json
Body: { "content": "What is machine learning?" }

Response: text/event-stream
data: {"token":"Machine"}
data: {"token":" learning"}
...
data: [DONE]
```

The backend:
1. Fetches conversation history
2. Builds a token-budget context window (sliding window — most recent messages first)
3. For RAG conversations, retrieves the top-5 semantically similar document chunks
4. Streams the LLM response token-by-token
5. Persists both the user message and full assistant response

### Documents (RAG)

| Method | Endpoint | Description |
|---|---|---|
| POST | `/documents/:conversationId` | Upload a PDF/text file (multipart, max 10 MB) |
| GET | `/documents` | List all user's documents |
| GET | `/documents/:id` | Get a single document |
| DELETE | `/documents/:id` | Delete document and its embeddings |

### Health

```
GET /health → { "status": "ok", "timestamp": "..." }
```

---

## LLM Context & Cost Management

### Sliding Window (default)
Each message send computes a token budget (8 000 tokens for open chat, 6 000 for RAG to leave room for retrieved chunks). The service walks backwards through message history, adding messages until the budget is full — most recent context is always preserved.

```
token_budget = 8000 (open) | 6000 (rag)
window = messages walked from newest → oldest until budget exhausted
```

### RAG Retrieval Flow
```
User message
     │
     ▼
GoogleGenerativeAIEmbeddings.embed(message)
     │
     ▼
PGVectorStore.similaritySearch(query, topK=5, { conversation_id })
     │
     ▼
Retrieved chunks injected as context block before user message
     │
     ▼
LLM answers using only retrieved context
```

Documents are chunked with `RecursiveCharacterTextSplitter` (1 000 chars, 200 overlap) and stored as vectors in the `doc_embeddings` Postgres table using cosine distance.

---

## Data Schema

```sql
users           (id UUID PK, email, password_hash, created_at)
conversations   (id UUID PK, user_id FK, title, mode, model, token_count, created_at, updated_at)
messages        (id UUID PK, conversation_id FK, role, content, token_count, created_at)
documents       (id UUID PK, user_id FK, conversation_id FK, filename, r2_url, status, created_at)
doc_embeddings  (id UUID PK, content, vector, metadata JSONB)   -- managed by PGVectorStore
```

Message ordering is maintained by `created_at ASC` on retrieval.

---

## Running Tests

```bash
cd apps/backend
npm test                  # unit tests
npm run test:cov          # with coverage report
```

Tests cover: `AuthService`, `ConversationsService`, `DocumentsService`, `AiService`.

CI runs lint + tests on every push/PR via GitHub Actions (`.github/workflows/ci.yml`).

---

## Project Structure

```
BOT-GPT/
├── apps/
│   ├── backend/
│   │   ├── src/
│   │   │   ├── auth/           # JWT auth (register, login, guard, strategy)
│   │   │   ├── conversations/  # CRUD + SSE message streaming
│   │   │   ├── documents/      # Upload, embed, delete
│   │   │   ├── ai/             # LangChain: Gemini chat + PGVector RAG
│   │   │   ├── users/          # User entity + service
│   │   │   └── database/       # TypeORM module
│   │   └── Dockerfile
│   └── frontend/               # Next.js 15 UI (optional)
├── docker-compose.yml
├── scripts/init.sql            # CREATE EXTENSION vector
└── .github/workflows/ci.yml   # Lint + test pipeline
```

---

## Error Handling

| Failure | Behaviour |
|---|---|
| LLM API error | Caught in SSE handler; streams `{ error: "LLM unavailable" }` then closes |
| Conversation not found | `404 NotFoundException` |
| Access to another user's conversation | `403 ForbiddenException` |
| File too large | Multer rejects at 10 MB |

---

## Known Limitations & Future Work

- **Summarization**: Long conversations are truncated via sliding window. A summarization step (compress old turns into a summary message) would preserve more context at lower token cost.
- **Caching**: Conversation list queries hit the DB on every request. Redis caching would reduce load at scale.
- **Retry logic**: LLM stream failures respond with an error event; automatic retries with backoff are not yet implemented.
- **Horizontal scaling**: The stateless JWT + SSE architecture supports multiple backend instances behind a load balancer. The DB becomes the bottleneck at scale — read replicas and connection pooling (PgBouncer) would be the next step.
