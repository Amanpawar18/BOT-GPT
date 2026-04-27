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
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiBody,
  ApiParam,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ConversationsService } from './conversations.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { ConversationResponseDto } from './dto/conversation-response.dto';
import { DocumentResponseDto } from '../documents/dto/document-response.dto';
import { AiService } from '../ai/ai.service';
import { DocumentsService } from '../documents/documents.service';
import { ConfigService } from '@nestjs/config';
import type { Message } from './message.entity';

interface AuthRequest extends Request {
  user: { id: string; email: string };
}

@ApiTags('Conversations')
@ApiBearerAuth()
@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ConversationsController {
  private readonly logger = new Logger(ConversationsController.name);

  constructor(
    private readonly conversationsService: ConversationsService,
    private readonly aiService: AiService,
    private readonly documentsService: DocumentsService,
    private readonly config: ConfigService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  @Get('token-usage')
  @ApiOperation({ summary: 'Get daily token usage for the authenticated user' })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        used: 4200,
        limit: 100000,
        resetAt: '2026-04-28T00:00:00.000Z',
      },
    },
  })
  async getTokenUsage(@Req() req: AuthRequest) {
    const limit = this.config.get<number>('DAILY_TOKEN_LIMIT') ?? 100_000;
    const used = await this.conversationsService.getDailyTokensUsed(
      req.user.id,
    );
    const resetAt = new Date();
    resetAt.setUTCHours(24, 0, 0, 0);
    return { used, limit, resetAt };
  }

  @Post()
  @ApiOperation({ summary: 'Create a new conversation' })
  @ApiBody({ type: CreateConversationDto })
  @ApiResponse({ status: 201, type: ConversationResponseDto })
  async create(@Req() req: AuthRequest, @Body() dto: CreateConversationDto) {
    const result = await this.conversationsService.create(req.user.id, dto);
    await this.cache.del(`convlist:${req.user.id}`);
    return result;
  }

  @Get()
  @ApiOperation({ summary: 'List conversations for the authenticated user' })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    example: 1,
    description: 'Page number (1-based)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    example: 20,
    description: 'Items per page',
  })
  @ApiResponse({ status: 200, type: [ConversationResponseDto] })
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
  @ApiOperation({ summary: 'Get a single conversation with its messages' })
  @ApiParam({ name: 'id', description: 'UUID of the conversation' })
  @ApiResponse({ status: 200, type: ConversationResponseDto })
  @ApiResponse({
    status: 404,
    description: 'Not found or belongs to a different user',
  })
  findOne(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.conversationsService.findOne(id, req.user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Rename a conversation' })
  @ApiParam({ name: 'id', description: 'UUID of the conversation' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { title: { type: 'string', example: 'New title' } },
      required: ['title'],
    },
  })
  @ApiResponse({ status: 200, type: ConversationResponseDto })
  update(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body('title') title: string,
  ) {
    return this.conversationsService.update(id, req.user.id, title);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a conversation and all its messages' })
  @ApiParam({ name: 'id', description: 'UUID of the conversation' })
  @ApiResponse({ status: 204, description: 'Deleted successfully' })
  async remove(@Req() req: AuthRequest, @Param('id') id: string) {
    await this.conversationsService.remove(id, req.user.id);
    await this.cache.del(`convlist:${req.user.id}`);
  }

  @Get(':id/documents')
  @ApiOperation({ summary: 'List documents attached to a conversation' })
  @ApiParam({ name: 'id', description: 'UUID of the conversation' })
  @ApiResponse({ status: 200, type: [DocumentResponseDto] })
  async listAttachedDocuments(@Param('id') id: string) {
    const rows = await this.documentsService.getAttachedDocuments(id);
    return rows.map((r) => r.document);
  }

  @Post(':id/documents/:docId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Attach a library document to a conversation' })
  @ApiParam({ name: 'id', description: 'UUID of the conversation' })
  @ApiParam({ name: 'docId', description: 'UUID of the document' })
  @ApiResponse({ status: 204, description: 'Attached' })
  async attachDocument(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Param('docId') docId: string,
  ) {
    await this.documentsService.attachToConversation(docId, id, req.user.id);
  }

  @Delete(':id/documents/:docId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Detach a document from a conversation' })
  @ApiParam({ name: 'id', description: 'UUID of the conversation' })
  @ApiParam({ name: 'docId', description: 'UUID of the document' })
  @ApiResponse({ status: 204, description: 'Detached' })
  async detachDocument(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Param('docId') docId: string,
  ) {
    await this.documentsService.detachFromConversation(docId, id, req.user.id);
  }

  @Post(':id/messages')
  @ApiOperation({
    summary: 'Send a message and stream the AI response (SSE)',
    description:
      'Returns a Server-Sent Events stream (`Content-Type: text/event-stream`).\n\n' +
      'Each event carries JSON on the `data` field:\n' +
      '- During generation: `{ "token": "word" }`\n' +
      '- On completion: `{ "done": true, "userTokens": 12, "assistantTokens": 84, "sources": [{ "documentId": "...", "filename": "paper.pdf", "content": "..." }] }`\n' +
      '- On error: `{ "error": "LLM unavailable" }`\n\n' +
      'Note: this endpoint cannot be tested via the Swagger "Try it out" button because browsers do not support SSE with custom auth headers through Swagger UI. Use `curl` or your frontend client instead.',
  })
  @ApiParam({ name: 'id', description: 'UUID of the conversation' })
  @ApiBody({ type: SendMessageDto })
  @ApiResponse({
    status: 200,
    description: 'SSE stream — see description for event format',
  })
  @ApiResponse({ status: 429, description: 'Daily token limit reached' })
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
      const attached = await this.documentsService.getAttachedDocuments(id);
      const documentIds = attached.map((r) => r.document_id);
      sources = await this.aiService.retrieveRelevantDocs(
        documentIds,
        dto.content,
      );
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

      const seen = new Set<string>();
      const uniqueSources = sources.filter((s) => {
        if (seen.has(s.documentId)) return false;
        seen.add(s.documentId);
        return true;
      });
      const sourcesForDb = uniqueSources.map((s) => ({
        documentId: s.documentId,
        filename: s.filename,
      }));

      await this.conversationsService.saveMessage(
        id,
        'assistant',
        fullResponse,
        assistantTokens,
        sourcesForDb.length ? sourcesForDb : undefined,
      );

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
