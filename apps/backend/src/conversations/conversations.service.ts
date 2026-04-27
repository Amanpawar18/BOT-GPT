import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Conversation } from './conversation.entity';
import { Message } from './message.entity';
import { CreateConversationDto } from './dto/create-conversation.dto';

@Injectable()
export class ConversationsService {
  constructor(
    @InjectRepository(Conversation)
    private readonly convRepo: Repository<Conversation>,
    @InjectRepository(Message) private readonly msgRepo: Repository<Message>,
  ) {}

  create(userId: string, dto: CreateConversationDto): Promise<Conversation> {
    const conv = this.convRepo.create({
      user_id: userId,
      mode: dto.mode,
      title: dto.title,
      context_strategy: dto.context_strategy ?? 'sliding_window',
    });
    return this.convRepo.save(conv);
  }

  async findAll(userId: string, page: number, limit: number) {
    const [data, total] = await Promise.all([
      this.convRepo.find({
        where: { user_id: userId },
        order: { updated_at: 'DESC' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.convRepo.count({ where: { user_id: userId } }),
    ]);
    return { data, page, limit, total };
  }

  async findOne(id: string, userId: string): Promise<Conversation> {
    const conv = await this.convRepo.findOne({
      where: { id },
      relations: ['messages'],
    });
    if (!conv) throw new NotFoundException('Conversation not found');
    if (conv.user_id !== userId) throw new ForbiddenException();
    conv.messages?.sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
    return conv;
  }

  async update(
    id: string,
    userId: string,
    title: string,
  ): Promise<Conversation> {
    const conv = await this.findOne(id, userId);
    conv.title = title;
    return this.convRepo.save(conv);
  }

  async remove(id: string, userId: string): Promise<void> {
    await this.findOne(id, userId);
    await this.convRepo.delete(id);
  }

  async saveMessage(
    convId: string,
    role: 'user' | 'assistant',
    content: string,
    tokenCount = 0,
  ): Promise<Message> {
    const msg = this.msgRepo.create({
      conversation_id: convId,
      role,
      content,
      token_count: tokenCount,
    });
    const saved = await this.msgRepo.save(msg);
    await this.convRepo.increment({ id: convId }, 'token_count', tokenCount);
    return saved;
  }

  getMessages(convId: string): Promise<Message[]> {
    return this.msgRepo.find({
      where: { conversation_id: convId },
      order: { created_at: 'ASC' },
    });
  }

  async getDailyTokensUsed(userId: string): Promise<number> {
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const result = await this.msgRepo
      .createQueryBuilder('msg')
      .innerJoin(Conversation, 'conv', 'conv.id = msg.conversation_id')
      .where('conv.user_id = :userId', { userId })
      .andWhere('msg.created_at >= :startOfDay', { startOfDay })
      .select('COALESCE(SUM(msg.token_count), 0)', 'total')
      .getRawOne<{ total: string }>();
    return parseInt(result?.total ?? '0', 10);
  }

  buildContextWindow(messages: Message[], tokenBudget: number): Message[] {
    if (!messages.length) return [];
    const window: Message[] = [];
    let total = 0;
    for (let i = messages.length - 1; i >= 0; i--) {
      const tokens =
        messages[i].token_count ?? Math.ceil(messages[i].content.length / 4);
      if (total + tokens > tokenBudget) {
        if (window.length === 0) window.unshift(messages[i]); // always keep latest
        break;
      }
      window.unshift(messages[i]);
      total += tokens;
    }
    return window;
  }
}
