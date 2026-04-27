import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { Document } from './document.entity';
import { ConversationDocument } from './conversation-document.entity';
import { AiService } from '../ai/ai.service';

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: jest.fn() })),
  PutObjectCommand: jest.fn(),
}));

const mockDocRepo = {
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
  delete: jest.fn(),
};
const mockConvDocRepo = {
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
  delete: jest.fn(),
};
const mockAi = {
  addDocumentsToStore: jest.fn().mockResolvedValue(undefined),
  deleteDocumentChunks: jest.fn().mockResolvedValue(undefined),
};
const mockConfig = { get: jest.fn().mockReturnValue('test-value') };

describe('DocumentsService', () => {
  let service: DocumentsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentsService,
        { provide: getRepositoryToken(Document), useValue: mockDocRepo },
        { provide: getRepositoryToken(ConversationDocument), useValue: mockConvDocRepo },
        { provide: AiService, useValue: mockAi },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();
    service = module.get<DocumentsService>(DocumentsService);
  });

  describe('findAllByUser', () => {
    it('returns all documents for a user ordered by created_at DESC', async () => {
      const docs = [
        { id: 'doc-1', user_id: 'user-1', filename: 'a.pdf' },
        { id: 'doc-2', user_id: 'user-1', filename: 'b.pdf' },
      ];
      mockDocRepo.find = jest.fn().mockResolvedValue(docs);
      const result = await service.findAllByUser('user-1');
      expect(mockDocRepo.find).toHaveBeenCalledWith({
        where: { user_id: 'user-1' },
        order: { created_at: 'DESC' },
      });
      expect(result).toEqual(docs);
    });
  });

  describe('findOne', () => {
    it('returns a document when found', async () => {
      const doc = { id: 'doc-1', filename: 'test.pdf', user_id: 'user-1' };
      mockDocRepo.findOne.mockResolvedValue(doc);
      await expect(service.findOne('doc-1')).resolves.toEqual(doc);
      expect(mockDocRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'doc-1' },
      });
    });

    it('throws NotFoundException when not found', async () => {
      mockDocRepo.findOne.mockResolvedValue(null);
      await expect(service.findOne('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('deletes vector chunks and document record', async () => {
      const doc = { id: 'doc-1', user_id: 'user-1', filename: 'test.pdf' };
      mockDocRepo.findOne.mockResolvedValue(doc);
      mockDocRepo.delete.mockResolvedValue({ affected: 1 });

      await service.remove('doc-1', 'user-1');

      expect(mockDocRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'doc-1', user_id: 'user-1' },
      });
      expect(mockAi.deleteDocumentChunks).toHaveBeenCalledWith('doc-1');
      expect(mockDocRepo.delete).toHaveBeenCalledWith('doc-1');
    });

    it('throws NotFoundException when document not found or not owned', async () => {
      mockDocRepo.findOne.mockResolvedValue(null);
      await expect(service.remove('missing', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
      expect(mockAi.deleteDocumentChunks).not.toHaveBeenCalled();
    });
  });
});
