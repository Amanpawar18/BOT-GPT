import { IsEnum, IsOptional, IsString } from 'class-validator';

export class CreateConversationDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsEnum(['open', 'rag'])
  mode: 'open' | 'rag';

  @IsOptional()
  @IsEnum(['sliding_window', 'summarization'])
  context_strategy?: 'sliding_window' | 'summarization';
}
