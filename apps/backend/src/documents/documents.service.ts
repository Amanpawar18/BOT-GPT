import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { PDFParse } from 'pdf-parse';
import { Document } from './document.entity';
import { AiService } from '../ai/ai.service';

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);
  private readonly s3: S3Client;

  constructor(
    @InjectRepository(Document) private readonly docRepo: Repository<Document>,
    private readonly aiService: AiService,
    private readonly config: ConfigService,
  ) {
    this.s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${config.get('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.get<string>('R2_ACCESS_KEY_ID')!,
        secretAccessKey: config.get<string>('R2_SECRET_ACCESS_KEY')!,
      },
    });
  }

  private async uploadToR2(buffer: Buffer, filename: string): Promise<string> {
    const key = `documents/${Date.now()}-${filename}`;
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.config.get<string>('R2_BUCKET_NAME'),
        Key: key,
        Body: buffer,
        ContentType: 'application/pdf',
      }),
    );
    return `${this.config.get('R2_PUBLIC_URL')}/${key}`;
  }

  private async processDocument(
    docId: string,
    conversationId: string,
    filename: string,
    buffer: Buffer,
  ): Promise<void> {
    try {
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      const result = await parser.getText();
      await parser.destroy();
      await this.aiService.addDocumentsToStore(result.text, {
        conversation_id: conversationId,
        document_id: docId,
        filename,
      });
      await this.docRepo.save({ id: docId, status: 'ready' });
      this.logger.log(`Document ${docId} ready`);
    } catch (err: unknown) {
      await this.docRepo.save({ id: docId, status: 'failed' });
      this.logger.error(`Document ${docId} failed`, String(err));
    }
  }

  async create(
    userId: string,
    conversationId: string,
    file: Express.Multer.File,
  ): Promise<Document> {
    const r2Url = await this.uploadToR2(file.buffer, file.originalname);
    const doc = await this.docRepo.save(
      this.docRepo.create({
        user_id: userId,
        conversation_id: conversationId,
        filename: file.originalname,
        r2_url: r2Url,
      }),
    );
    void this.processDocument(doc.id, conversationId, file.originalname, file.buffer).catch(
      (err: unknown) => {
        this.logger.error(`processDocument failed for ${doc.id}`, String(err));
      },
    );
    return doc;
  }

  async findAllByUser(userId: string): Promise<Document[]> {
    return this.docRepo.find({
      where: { user_id: userId },
      order: { created_at: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Document> {
    const doc = await this.docRepo.findOne({ where: { id } });
    if (!doc) throw new NotFoundException('Document not found');
    return doc;
  }

  async remove(id: string, userId: string): Promise<void> {
    const doc = await this.docRepo.findOne({ where: { id, user_id: userId } });
    if (!doc) throw new NotFoundException('Document not found');
    await this.aiService.deleteDocumentChunks(id);
    await this.docRepo.delete(id);
  }
}
