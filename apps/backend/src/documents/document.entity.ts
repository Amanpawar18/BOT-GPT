import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('documents')
export class Document {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  user_id: string;

  @Column()
  conversation_id: string;

  @Column({ nullable: true })
  filename: string;

  @Column({ nullable: true })
  r2_url: string;

  @Column({ default: 'processing' })
  status: 'processing' | 'ready' | 'failed';

  @CreateDateColumn()
  created_at: Date;
}
