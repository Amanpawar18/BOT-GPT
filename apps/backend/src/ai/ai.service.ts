import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ChatGoogleGenerativeAI,
  GoogleGenerativeAIEmbeddings,
} from '@langchain/google-genai';
import {
  HumanMessage,
  AIMessage,
  SystemMessage,
} from '@langchain/core/messages';
import { PGVectorStore } from '@langchain/community/vectorstores/pgvector';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { Message } from '../conversations/message.entity';

const SYSTEM_PROMPT = 'You are BOT GPT, a helpful and concise AI assistant.';

export interface DocSource {
  content: string;
  documentId: string;
  filename: string;
}

@Injectable()
export class AiService implements OnModuleInit {
  private readonly llm: ChatGoogleGenerativeAI;
  private readonly embeddings: GoogleGenerativeAIEmbeddings;
  private vectorStore: PGVectorStore;

  constructor(private readonly config: ConfigService) {
    const apiKey = config.get<string>('GEMINI_API_KEY')!;
    const model = config.get<string>('GEMINI_MODEL') ?? 'gemini-2.5-flash';
    const embeddingModel =
      config.get<string>('GEMINI_EMBEDDING_MODEL') ?? 'gemini-embedding-2';
    this.llm = new ChatGoogleGenerativeAI({ apiKey, model });
    this.embeddings = new GoogleGenerativeAIEmbeddings({
      apiKey,
      model: embeddingModel,
    });
  }

  async onModuleInit(): Promise<void> {
    this.vectorStore = await PGVectorStore.initialize(this.embeddings, {
      postgresConnectionOptions: {
        connectionString: this.config.get<string>('DATABASE_URL')!,
      },
      tableName: 'doc_embeddings',
      columns: {
        idColumnName: 'id',
        vectorColumnName: 'vector',
        contentColumnName: 'content',
        metadataColumnName: 'metadata',
      },
      distanceStrategy: 'cosine',
    });
  }

  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  private async withRetry<T>(
    fn: () => Promise<T>,
    maxAttempts = 3,
  ): Promise<T> {
    let delay = 1000;
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err;
        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, delay));
          delay *= 2;
        }
      }
    }
    throw lastError;
  }

  private buildMessages(
    history: Pick<Message, 'role' | 'content'>[],
    userContent: string,
  ) {
    return [
      new SystemMessage(SYSTEM_PROMPT),
      ...history.map((m) =>
        m.role === 'user'
          ? new HumanMessage(m.content)
          : new AIMessage(m.content),
      ),
      new HumanMessage(userContent),
    ];
  }

  async *streamOpenChat(
    history: Pick<Message, 'role' | 'content' | 'token_count'>[],
    currentMessage: string,
  ): AsyncGenerator<string> {
    const messages = this.buildMessages(history, currentMessage);
    const stream = await this.withRetry(() => this.llm.stream(messages));
    for await (const chunk of stream) {
      if (typeof chunk.content === 'string') yield chunk.content;
    }
  }

  async *streamRagChat(
    history: Pick<Message, 'role' | 'content'>[],
    currentMessage: string,
    sources: DocSource[],
  ): AsyncGenerator<string> {
    const contextBlock = `Context:\n${sources.map((s) => s.content).join('\n---\n')}\n\nUsing only the context above, answer:\n${currentMessage}`;
    // const contextBlock = `Relevant document excerpts:\n${sources.map((s) => s.content).join('\n---\n')}\n\nAnswer the question below using the document excerpts as your primary source. Use the conversation history for context on follow-up questions.\nQuestion: ${currentMessage}`;
    const messages = this.buildMessages(history, contextBlock);
    const stream = await this.withRetry(() => this.llm.stream(messages));
    for await (const chunk of stream) {
      if (typeof chunk.content === 'string') yield chunk.content;
    }
  }

  async addDocumentsToStore(
    text: string,
    metadata: Record<string, string>,
  ): Promise<void> {
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });
    const docs = await splitter.createDocuments([text], [metadata]);
    await this.vectorStore.addDocuments(docs);
  }

  async retrieveRelevantDocs(
    documentIds: string[],
    query: string,
    topK = 5,
  ): Promise<DocSource[]> {
    if (!documentIds.length) return [];
    const perDoc = Math.max(1, Math.ceil(topK / documentIds.length));
    const nested = await Promise.all(
      documentIds.map((id) =>
        this.vectorStore.similaritySearch(query, perDoc, { document_id: id }),
      ),
    );
    return nested
      .flat()
      .slice(0, topK)
      .map((d) => ({
        content: d.pageContent,
        documentId: d.metadata.document_id as string,
        filename: d.metadata.filename as string,
      }));
  }

  async summarizeHistory(
    messages: Pick<Message, 'role' | 'content'>[],
  ): Promise<string> {
    const historyText = messages
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n');
    const result = await this.llm.invoke([
      new SystemMessage(
        'Summarize the following conversation history into a concise paragraph.',
      ),
      new HumanMessage(historyText),
    ]);
    return typeof result.content === 'string' ? result.content : '';
  }

  async deleteDocumentChunks(documentId: string): Promise<void> {
    await this.vectorStore.delete({ filter: { document_id: documentId } });
  }
}
