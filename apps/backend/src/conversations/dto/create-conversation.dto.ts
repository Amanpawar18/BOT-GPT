import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateConversationDto {
  @ApiPropertyOptional({
    example: 'Research notes',
    description: 'Display title for the conversation',
  })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiProperty({
    enum: ['open', 'rag'],
    example: 'open',
    description: 'open = free-form chat; rag = document-grounded answers',
  })
  @IsEnum(['open', 'rag'])
  mode: 'open' | 'rag';

  @ApiPropertyOptional({
    enum: ['sliding_window', 'summarization'],
    example: 'sliding_window',
    description:
      'sliding_window keeps the most recent messages within the token budget; summarization condenses older history into a single summary message',
  })
  @IsOptional()
  @IsEnum(['sliding_window', 'summarization'])
  context_strategy?: 'sliding_window' | 'summarization';
}
