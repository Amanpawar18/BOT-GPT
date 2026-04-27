import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

@Entity('conversations')
export class Conversation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  user_id: string;

  @Column({ nullable: true })
  title: string;

  @Column({ default: 'open' })
  mode: 'open' | 'rag';

  @Column({ default: 'sliding_window' })
  context_strategy: 'sliding_window' | 'summarization';

  @Column({ default: 'gemini-2.0-flash' })
  model: string;

  @Column({ default: 0 })
  token_count: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @OneToMany('Message', 'conversation')
  messages: any[];
}
