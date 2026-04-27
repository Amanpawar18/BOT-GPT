import {
  Entity,
  PrimaryColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Document } from './document.entity';

@Entity('conversation_documents')
export class ConversationDocument {
  @PrimaryColumn()
  conversation_id: string;

  @PrimaryColumn()
  document_id: string;

  @CreateDateColumn()
  attached_at: Date;

  @ManyToOne(() => Document, { onDelete: 'CASCADE', eager: true })
  @JoinColumn({ name: 'document_id' })
  document: Document;
}
