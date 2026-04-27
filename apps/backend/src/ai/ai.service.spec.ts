import { Test, TestingModule } from '@nestjs/testing';
import { AiService } from './ai.service';
import { ConfigService } from '@nestjs/config';
import { PGVectorStore } from '@langchain/community/vectorstores/pgvector';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

const mockStream = jest.fn().mockResolvedValue(
  (function* () {
    yield { content: 'Hello' };
    yield { content: ' world' };
  })(),
);

const mockInvoke = jest.fn().mockResolvedValue({ content: 'Summary text' });

jest.mock('@langchain/google-genai', () => ({
  ChatGoogleGenerativeAI: jest
    .fn()
    .mockImplementation(() => ({ stream: mockStream, invoke: mockInvoke })),
  GoogleGenerativeAIEmbeddings: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@langchain/community/vectorstores/pgvector', () => ({
  PGVectorStore: { initialize: jest.fn() },
}));

jest.mock('@langchain/textsplitters', () => ({
  RecursiveCharacterTextSplitter: jest.fn(),
}));

const mockConfig = { get: jest.fn().mockReturnValue('test-key') };

describe('AiService', () => {
  let service: AiService;
  let mockAddDocuments: jest.Mock;
  let mockSimilaritySearch: jest.Mock;
  let mockDelete: jest.Mock;
  let mockCreateDocuments: jest.Mock;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockAddDocuments = jest.fn().mockResolvedValue(undefined);
    mockSimilaritySearch = jest.fn().mockResolvedValue([
      { pageContent: 'chunk 1', metadata: { conversation_id: 'conv-1' } },
      { pageContent: 'chunk 2', metadata: { conversation_id: 'conv-1' } },
    ]);
    mockDelete = jest.fn().mockResolvedValue(undefined);
    mockCreateDocuments = jest.fn().mockResolvedValue([
      {
        pageContent: 'split chunk',
        metadata: { conversation_id: 'conv-1', document_id: 'doc-1' },
      },
    ]);

    mockStream.mockResolvedValue(
      (function* () {
        yield { content: 'Hello' };
        yield { content: ' world' };
      })(),
    );

    (PGVectorStore.initialize as jest.Mock).mockResolvedValue({
      addDocuments: mockAddDocuments,
      similaritySearch: mockSimilaritySearch,
      delete: mockDelete,
    });

    (RecursiveCharacterTextSplitter as unknown as jest.Mock).mockImplementation(
      () => ({ createDocuments: mockCreateDocuments }),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [AiService, { provide: ConfigService, useValue: mockConfig }],
    }).compile();
    service = module.get<AiService>(AiService);
    await service.onModuleInit();
  });

  describe('estimateTokens', () => {
    it('estimates tokens as roughly text length / 4', () => {
      expect(service.estimateTokens('Hello world')).toBeGreaterThan(0);
      expect(service.estimateTokens('Hello world')).toBeLessThan(10);
    });

    it('returns 0 for empty string', () => {
      expect(service.estimateTokens('')).toBe(0);
    });
  });

  describe('streamOpenChat', () => {
    it('yields streamed string chunks from the LLM', async () => {
      const tokens: string[] = [];
      for await (const token of service.streamOpenChat([], 'Hello?')) {
        tokens.push(token);
      }
      expect(tokens).toEqual(['Hello', ' world']);
      expect(mockStream).toHaveBeenCalledTimes(1);
    });

    it('passes system + history + current message to the LLM', async () => {
      await service
        .streamOpenChat(
          [{ role: 'user', content: 'Hi', token_count: 2 }],
          'How are you?',
        )
        .next();
      const [[messages]] = mockStream.mock.calls as [[unknown[]]];
      expect(messages).toHaveLength(3);
    });

    it('retries up to 3 times on transient LLM failure then succeeds', async () => {
      jest.spyOn(global, 'setTimeout').mockImplementation((fn: TimerHandler) => {
        if (typeof fn === 'function') (fn as () => void)();
        return 0 as unknown as ReturnType<typeof setTimeout>;
      });
      mockStream
        .mockRejectedValueOnce(new Error('network error'))
        .mockRejectedValueOnce(new Error('network error'))
        .mockResolvedValue(
          (function* () {
            yield { content: 'Retry worked' };
          })(),
        );

      const tokens: string[] = [];
      for await (const token of service.streamOpenChat([], 'Hi?')) {
        tokens.push(token);
      }
      jest.restoreAllMocks();

      expect(tokens).toEqual(['Retry worked']);
      expect(mockStream).toHaveBeenCalledTimes(3);
    });

    it('throws after exhausting all retries', async () => {
      jest.spyOn(global, 'setTimeout').mockImplementation((fn: TimerHandler) => {
        if (typeof fn === 'function') (fn as () => void)();
        return 0 as unknown as ReturnType<typeof setTimeout>;
      });
      mockStream.mockRejectedValue(new Error('persistent error'));

      await expect(async () => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const _ of service.streamOpenChat([], 'Hi?')) {
          /* consume */
        }
      }).rejects.toThrow('persistent error');
      jest.restoreAllMocks();

      expect(mockStream).toHaveBeenCalledTimes(3);
    });
  });

  describe('streamRagChat', () => {
    it('injects context block into the final user message using source content', async () => {
      const sources = [
        { content: 'Chunk A', documentId: 'doc-1', filename: 'paper.pdf' },
        { content: 'Chunk B', documentId: 'doc-1', filename: 'paper.pdf' },
      ];
      await service.streamRagChat([], 'What is this?', sources).next();
      const [[messages]] = mockStream.mock.calls as [
        [Array<{ content: string }>],
      ];
      const lastContent = messages[messages.length - 1].content;
      expect(lastContent).toContain('Context:');
      expect(lastContent).toContain('Chunk A');
      expect(lastContent).toContain('What is this?');
    });
  });

  describe('addDocumentsToStore', () => {
    it('splits text and stores documents with metadata', async () => {
      await service.addDocumentsToStore('some long text', {
        conversation_id: 'conv-1',
        document_id: 'doc-1',
      });

      expect(mockCreateDocuments).toHaveBeenCalledWith(
        ['some long text'],
        [{ conversation_id: 'conv-1', document_id: 'doc-1' }],
      );
      expect(mockAddDocuments).toHaveBeenCalledWith([
        {
          pageContent: 'split chunk',
          metadata: { conversation_id: 'conv-1', document_id: 'doc-1' },
        },
      ]);
    });
  });

  describe('retrieveRelevantDocs', () => {
    beforeEach(() => {
      mockSimilaritySearch.mockResolvedValue([
        {
          pageContent: 'chunk 1',
          metadata: {
            conversation_id: 'conv-1',
            document_id: 'doc-1',
            filename: 'paper.pdf',
          },
        },
        {
          pageContent: 'chunk 2',
          metadata: {
            conversation_id: 'conv-1',
            document_id: 'doc-2',
            filename: 'notes.pdf',
          },
        },
      ]);
    });

    it('searches by conversation_id filter and returns DocSource objects', async () => {
      const results = await service.retrieveRelevantDocs('conv-1', 'my query');

      expect(mockSimilaritySearch).toHaveBeenCalledWith('my query', 5, {
        conversation_id: 'conv-1',
      });
      expect(results).toEqual([
        { content: 'chunk 1', documentId: 'doc-1', filename: 'paper.pdf' },
        { content: 'chunk 2', documentId: 'doc-2', filename: 'notes.pdf' },
      ]);
    });

    it('respects custom topK', async () => {
      await service.retrieveRelevantDocs('conv-1', 'query', 3);
      expect(mockSimilaritySearch).toHaveBeenCalledWith('query', 3, {
        conversation_id: 'conv-1',
      });
    });

    it('returns all chunks even when they share a documentId', async () => {
      mockSimilaritySearch.mockResolvedValue([
        {
          pageContent: 'chunk 1',
          metadata: {
            conversation_id: 'conv-1',
            document_id: 'doc-1',
            filename: 'paper.pdf',
          },
        },
        {
          pageContent: 'chunk 2',
          metadata: {
            conversation_id: 'conv-1',
            document_id: 'doc-1',
            filename: 'paper.pdf',
          },
        },
      ]);
      const results = await service.retrieveRelevantDocs('conv-1', 'query');
      expect(results).toHaveLength(2);
      expect(results[0].content).toBe('chunk 1');
      expect(results[1].content).toBe('chunk 2');
    });
  });

  describe('deleteDocumentChunks', () => {
    it('deletes vector chunks filtered by document_id', async () => {
      await service.deleteDocumentChunks('doc-1');
      expect(mockDelete).toHaveBeenCalledWith({
        filter: { document_id: 'doc-1' },
      });
    });
  });

  describe('summarizeHistory', () => {
    it('summarizes messages into a string using the LLM', async () => {
      mockInvoke.mockResolvedValue({ content: 'Concise summary' });
      const result = await service.summarizeHistory([
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there' },
      ]);
      expect(result).toBe('Concise summary');
      expect(mockInvoke).toHaveBeenCalledTimes(1);
    });

    it('returns empty string when LLM returns non-string content', async () => {
      mockInvoke.mockResolvedValue({ content: [{ type: 'text', text: 'x' }] });
      const result = await service.summarizeHistory([
        { role: 'user', content: 'Test' },
      ]);
      expect(result).toBe('');
    });

    it('includes all messages in the prompt sent to the LLM', async () => {
      mockInvoke.mockResolvedValue({ content: 'ok' });
      await service.summarizeHistory([
        { role: 'user', content: 'First message' },
        { role: 'assistant', content: 'First reply' },
      ]);
      const [[messages]] = mockInvoke.mock.calls as [
        [Array<{ content: string }>],
      ][];
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      const combinedContent = messages.map((m) => m.content).join(' ');
      expect(combinedContent).toContain('First message');
      expect(combinedContent).toContain('First reply');
    });
  });
});
