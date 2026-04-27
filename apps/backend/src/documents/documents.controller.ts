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
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiConsumes,
  ApiBody,
  ApiResponse,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DocumentsService } from './documents.service';
import { DocumentResponseDto } from './dto/document-response.dto';

interface AuthRequest extends Request {
  user: { id: string; email: string };
}

@ApiTags('Documents')
@ApiBearerAuth()
@Controller('documents')
@UseGuards(JwtAuthGuard)
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post()
  @ApiOperation({ summary: 'Upload a PDF to the document library' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'PDF file — max 10 MB',
        },
      },
      required: ['file'],
    },
  })
  @ApiResponse({ status: 201, type: DocumentResponseDto })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  create(@Req() req: AuthRequest, @UploadedFile() file: Express.Multer.File) {
    return this.documentsService.create(req.user.id, file);
  }

  @Get()
  @ApiOperation({ summary: 'List all documents in the user library' })
  @ApiResponse({ status: 200, type: [DocumentResponseDto] })
  findAll(@Req() req: AuthRequest) {
    return this.documentsService.findAllByUser(req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single document by ID' })
  @ApiParam({ name: 'id', description: 'UUID of the document' })
  @ApiResponse({ status: 200, type: DocumentResponseDto })
  @ApiResponse({ status: 404, description: 'Document not found' })
  findOne(@Param('id') id: string) {
    return this.documentsService.findOne(id);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Delete a document, its R2 object, and all vector chunks',
  })
  @ApiParam({ name: 'id', description: 'UUID of the document' })
  @ApiResponse({ status: 204, description: 'Deleted' })
  @ApiResponse({ status: 404, description: 'Document not found or not owned' })
  remove(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.documentsService.remove(id, req.user.id);
  }
}
