import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Conversation } from './conversation.entity';

@Entity('messages')
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  conversation_id: string;

  @Column()
  role: 'user' | 'assistant' | 'system';

  @Column('text')
  content: string;

  @Column({ nullable: true })
  token_count: number;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => Conversation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversation_id' })
  conversation: Conversation;
}
