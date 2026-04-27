import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DocumentsService } from './documents.service';

interface AuthRequest extends Request {
  user: { id: string; email: string };
}

@Controller('documents')
@UseGuards(JwtAuthGuard)
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post(':conversationId')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  create(
    @Req() req: AuthRequest,
    @Param('conversationId') conversationId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.documentsService.create(req.user.id, conversationId, file);
  }

  @Get()
  findAll(@Req() req: AuthRequest) {
    return this.documentsService.findAllByUser(req.user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.documentsService.findOne(id);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.documentsService.remove(id, req.user.id);
  }
}
