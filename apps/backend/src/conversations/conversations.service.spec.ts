import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConversationsService } from './conversations.service';
import { Conversation } from './conversation.entity';
import { Message } from './message.entity';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

const mockConv = {
  id: 'c-1',
  user_id: 'u-1',
  title: 'Chat',
  mode: 'open',
  token_count: 0,
  messages: [],
};

const mockConvRepo = {
  create: jest.fn(),
  save: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn(),
  count: jest.fn(),
  delete: jest.fn(),
  increment: jest.fn(),
};
const mockQueryBuilder = {
  innerJoin: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  getRawOne: jest.fn().mockResolvedValue({ total: '0' }),
};

const mockMsgRepo = {
  create: jest.fn(),
  save: jest.fn(),
  find: jest.fn(),
  createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
};

describe('ConversationsService', () => {
  let service: ConversationsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationsService,
        { provide: getRepositoryToken(Conversation), useValue: mockConvRepo },
        { provide: getRepositoryToken(Message), useValue: mockMsgRepo },
      ],
    }).compile();
    service = module.get<ConversationsService>(ConversationsService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('creates a conversation for the user', async () => {
      mockConvRepo.create.mockReturnValue(mockConv);
      mockConvRepo.save.mockResolvedValue(mockConv);

      const result = await service.create('u-1', {
        mode: 'open',
        title: 'Chat',
      });

      expect(result).toEqual(mockConv);
      expect(mockConvRepo.create).toHaveBeenCalledWith({
        user_id: 'u-1',
        mode: 'open',
        title: 'Chat',
        context_strategy: 'sliding_window',
      });
    });
  });

  describe('findAll', () => {
    it('returns paginated conversations for the user', async () => {
      mockConvRepo.find.mockResolvedValue([mockConv]);
      mockConvRepo.count.mockResolvedValue(1);

      const result = await service.findAll('u-1', 1, 20);

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });

  describe('findOne', () => {
    it('returns conversation for its owner', async () => {
      mockConvRepo.findOne.mockResolvedValue(mockConv);
      const result = await service.findOne('c-1', 'u-1');
      expect(result.id).toBe('c-1');
    });

    it('throws NotFoundException when not found', async () => {
      mockConvRepo.findOne.mockResolvedValue(null);
      await expect(service.findOne('c-999', 'u-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException for wrong user', async () => {
      mockConvRepo.findOne.mockResolvedValue({ ...mockConv, user_id: 'other' });
      await expect(service.findOne('c-1', 'u-1')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('remove', () => {
    it('deletes conversation owned by the user', async () => {
      mockConvRepo.findOne.mockResolvedValue(mockConv);
      mockConvRepo.delete.mockResolvedValue({ affected: 1 });

      await service.remove('c-1', 'u-1');

      expect(mockConvRepo.delete).toHaveBeenCalledWith('c-1');
    });
  });

  describe('buildContextWindow', () => {
    it('returns messages that fit within token budget', () => {
      const messages = [
        { role: 'user', content: 'A', token_count: 10 },
        { role: 'assistant', content: 'B', token_count: 10 },
        { role: 'user', content: 'C', token_count: 10 },
      ] as Message[];

      const result = service.buildContextWindow(messages, 25);

      // 10+10+10=30 exceeds 25, so oldest message dropped → 2 messages returned
      expect(result).toHaveLength(2);
      expect(result[0].content).toBe('B');
    });

    it('returns all messages when they fit in budget', () => {
      const messages = [
        { role: 'user', content: 'Hello', token_count: 5 },
      ] as Message[];

      expect(service.buildContextWindow(messages, 8000)).toHaveLength(1);
    });

    it('always includes the most recent message even when it exceeds budget', () => {
      const messages = [
        { role: 'user', content: 'older', token_count: 5 },
        { role: 'assistant', content: 'huge reply', token_count: 9999 },
      ] as Message[];

      const result = service.buildContextWindow(messages, 100);

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('huge reply');
    });

    it('returns empty array when messages array is empty', () => {
      expect(service.buildContextWindow([], 8000)).toHaveLength(0);
    });

    it('uses content length fallback when token_count is null', () => {
      const messages = [
        { role: 'user', content: 'A'.repeat(40), token_count: null },
      ] as unknown as Message[];
      // 40 chars → ceil(40/4) = 10 tokens → fits in budget of 20
      const result = service.buildContextWindow(messages, 20);
      expect(result).toHaveLength(1);
    });
  });

  describe('getDailyTokensUsed', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockMsgRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);
    });

    it('returns total tokens used today by the user', async () => {
      mockQueryBuilder.getRawOne.mockResolvedValue({ total: '12500' });
      const result = await service.getDailyTokensUsed('u-1');
      expect(result).toBe(12500);
      expect(mockMsgRepo.createQueryBuilder).toHaveBeenCalledWith('msg');
    });

    it('returns 0 when user has no usage today', async () => {
      mockQueryBuilder.getRawOne.mockResolvedValue({ total: '0' });
      const result = await service.getDailyTokensUsed('u-1');
      expect(result).toBe(0);
    });

    it('filters by userId and start of UTC day', async () => {
      mockQueryBuilder.getRawOne.mockResolvedValue({ total: '0' });
      await service.getDailyTokensUsed('u-1');
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'conv.user_id = :userId',
        { userId: 'u-1' },
      );
      const andWhereCalls = mockQueryBuilder.andWhere.mock.calls as [
        string,
        unknown,
      ][];
      expect(andWhereCalls.some(([q]) => q.includes('created_at'))).toBe(true);
    });
  });
});
