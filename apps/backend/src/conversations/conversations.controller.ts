import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Logger,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ConversationsService } from './conversations.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { AiService } from '../ai/ai.service';
import { ConfigService } from '@nestjs/config';
import type { Message } from './message.entity';

interface AuthRequest extends Request {
  user: { id: string; email: string };
}

@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ConversationsController {
  private readonly logger = new Logger(ConversationsController.name);

  constructor(
    private readonly conversationsService: ConversationsService,
    private readonly aiService: AiService,
    private readonly config: ConfigService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  @Post()
  async create(@Req() req: AuthRequest, @Body() dto: CreateConversationDto) {
    const result = await this.conversationsService.create(req.user.id, dto);
    await this.cache.del(`convlist:${req.user.id}`);
    return result;
  }

  @Get()
  async findAll(
    @Req() req: AuthRequest,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    const cacheKey = `convlist:${req.user.id}:${page}:${limit}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;
    const result = await this.conversationsService.findAll(
      req.user.id,
      +page,
      +limit,
    );
    await this.cache.set(cacheKey, result);
    return result;
  }

  @Get(':id')
  findOne(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.conversationsService.findOne(id, req.user.id);
  }

  @Patch(':id')
  update(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body('title') title: string,
  ) {
    return this.conversationsService.update(id, req.user.id, title);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Req() req: AuthRequest, @Param('id') id: string) {
    await this.conversationsService.remove(id, req.user.id);
    await this.cache.del(`convlist:${req.user.id}`);
  }

  @Post(':id/messages')
  async sendMessage(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
    @Res() res: Response,
  ) {
    const dailyLimit = this.config.get<number>('DAILY_TOKEN_LIMIT') ?? 100_000;
    const dailyUsed = await this.conversationsService.getDailyTokensUsed(
      req.user.id,
    );
    if (dailyUsed >= dailyLimit) {
      res.status(429).json({
        error: `Daily limit of ${dailyLimit.toLocaleString()} tokens reached. Resets at midnight UTC.`,
      });
      return;
    }

    const conv = await this.conversationsService.findOne(id, req.user.id);
    const messages = await this.conversationsService.getMessages(id);

    const budget = conv.mode === 'rag' ? 6000 : 8000;
    let window: Pick<Message, 'role' | 'content' | 'token_count'>[];

    if (conv.context_strategy === 'summarization') {
      const firstPass = this.conversationsService.buildContextWindow(
        messages,
        budget,
      );
      const olderCount = messages.length - firstPass.length;
      if (olderCount > 0) {
        const older = messages.slice(0, olderCount);
        const summary = await this.aiService.summarizeHistory(older);
        const summaryTokens = this.aiService.estimateTokens(summary);
        // Rebuild recent window with summary tokens reserved so total stays within budget
        const recent = this.conversationsService.buildContextWindow(
          messages,
          budget - summaryTokens,
        );
        window = [
          {
            role: 'assistant',
            content: `[Earlier conversation summary]: ${summary}`,
            token_count: summaryTokens,
          },
          ...recent,
        ];
      } else {
        window = firstPass;
      }
    } else {
      window = this.conversationsService.buildContextWindow(messages, budget);
    }

    this.logger.debug(
      `Context window for conversation ${id}: ${window.map((m) => `${m.role}: ${m.content}`).join(' | ')}`,
    );

    const userTokens = this.aiService.estimateTokens(dto.content);
    await this.conversationsService.saveMessage(
      id,
      'user',
      dto.content,
      userTokens,
    );

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    let fullResponse = '';
    let stream: AsyncGenerator<string>;
    let sources: import('../ai/ai.service').DocSource[] = [];

    if (conv.mode === 'rag') {
      sources = await this.aiService.retrieveRelevantDocs(id, dto.content);
      stream = this.aiService.streamRagChat(window, dto.content, sources);
    } else {
      stream = this.aiService.streamOpenChat(window, dto.content);
    }

    try {
      for await (const token of stream) {
        fullResponse += token;
        res.write(`data: ${JSON.stringify({ token })}\n\n`);
      }

      const assistantTokens = this.aiService.estimateTokens(fullResponse);
      await this.conversationsService.saveMessage(
        id,
        'assistant',
        fullResponse,
        assistantTokens,
      );

      // Deduplicate sources by documentId for attribution display
      const seen = new Set<string>();
      const uniqueSources = sources.filter((s) => {
        if (seen.has(s.documentId)) return false;
        seen.add(s.documentId);
        return true;
      });

      res.write(
        `data: ${JSON.stringify({ done: true, userTokens, assistantTokens, sources: uniqueSources.map((s) => ({ documentId: s.documentId, filename: s.filename, content: s.content })) })}\n\n`,
      );
    } catch (err: unknown) {
      this.logger.error(
        'LLM stream failed',
        err instanceof Error ? err.stack : String(err),
      );
      res.write(`data: ${JSON.stringify({ error: 'LLM unavailable' })}\n\n`);
    } finally {
      res.end();
    }
  }
}
