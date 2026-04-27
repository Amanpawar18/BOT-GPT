import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { PDFParse } from 'pdf-parse';
import { Document } from './document.entity';
import { ConversationDocument } from './conversation-document.entity';
import { AiService } from '../ai/ai.service';

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly publicUrl: string;

  constructor(
    @InjectRepository(Document) private readonly docRepo: Repository<Document>,
    @InjectRepository(ConversationDocument)
    private readonly convDocRepo: Repository<ConversationDocument>,
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
    this.bucket = config.get<string>('R2_BUCKET_NAME')!;
    this.publicUrl = config.get<string>('R2_PUBLIC_URL')!;
  }

  private async uploadToR2(buffer: Buffer, filename: string): Promise<string> {
    const key = `documents/${Date.now()}-${filename}`;
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: 'application/pdf',
      }),
    );
    return `${this.publicUrl}/${key}`;
  }

  private async deleteFromR2(r2Url: string): Promise<void> {
    const key = r2Url.replace(`${this.publicUrl}/`, '');
    await this.s3.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  private processDocument(
    docId: string,
    filename: string,
    buffer: Buffer,
  ): void {
    void (async () => {
      try {
        const parser = new PDFParse({ data: new Uint8Array(buffer) });
        const result = await parser.getText();
        await parser.destroy();
        await this.aiService.addDocumentsToStore(result.text, {
          document_id: docId,
          filename,
        });
        await this.docRepo.save({ id: docId, status: 'ready' });
        this.logger.log(`Document ${docId} ready`);
      } catch (err: unknown) {
        await this.docRepo.save({ id: docId, status: 'failed' });
        this.logger.error(`Document ${docId} failed`, String(err));
      }
    })();
  }

  async create(userId: string, file: Express.Multer.File): Promise<Document> {
    const r2Url = await this.uploadToR2(file.buffer, file.originalname);
    const doc = await this.docRepo.save(
      this.docRepo.create({
        user_id: userId,
        filename: file.originalname,
        r2_url: r2Url,
      }),
    );
    this.processDocument(doc.id, file.originalname, file.buffer);
    return doc;
  }

  async attachToConversation(
    docId: string,
    convId: string,
    userId: string,
  ): Promise<void> {
    const doc = await this.docRepo.findOne({
      where: { id: docId, user_id: userId },
    });
    if (!doc) throw new NotFoundException('Document not found');

    const exists = await this.convDocRepo.findOne({
      where: { document_id: docId, conversation_id: convId },
    });
    if (exists) throw new ConflictException('Document already attached');

    await this.convDocRepo.save(
      this.convDocRepo.create({ conversation_id: convId, document_id: docId }),
    );
  }

  async detachFromConversation(
    docId: string,
    convId: string,
    userId: string,
  ): Promise<void> {
    const doc = await this.docRepo.findOne({
      where: { id: docId, user_id: userId },
    });
    if (!doc) throw new NotFoundException('Document not found');
    await this.convDocRepo.delete({
      document_id: docId,
      conversation_id: convId,
    });
  }

  getAttachedDocuments(convId: string): Promise<ConversationDocument[]> {
    return this.convDocRepo.find({ where: { conversation_id: convId } });
  }

  findAllByUser(userId: string): Promise<Document[]> {
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
    if (doc.r2_url) {
      await this.deleteFromR2(doc.r2_url).catch((err: unknown) =>
        this.logger.warn(`R2 delete failed for ${id}: ${String(err)}`),
      );
    }
    await this.docRepo.delete(id);
  }

  async verifyOwnership(docId: string, userId: string): Promise<void> {
    const doc = await this.docRepo.findOne({
      where: { id: docId, user_id: userId },
    });
    if (!doc) throw new ForbiddenException();
  }
}
