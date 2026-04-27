import { ApiProperty } from '@nestjs/swagger';

export class ConversationResponseDto {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  id!: string;

  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  user_id!: string;

  @ApiProperty({ example: 'Research notes', nullable: true })
  title!: string;

  @ApiProperty({ enum: ['open', 'rag'], example: 'open' })
  mode!: 'open' | 'rag';

  @ApiProperty({
    enum: ['sliding_window', 'summarization'],
    example: 'sliding_window',
  })
  context_strategy!: 'sliding_window' | 'summarization';

  @ApiProperty({ example: 'gemini-2.0-flash' })
  model!: string;

  @ApiProperty({ example: 1234 })
  token_count!: number;

  @ApiProperty({ example: '2026-04-27T00:00:00.000Z' })
  created_at!: Date;

  @ApiProperty({ example: '2026-04-27T00:00:00.000Z' })
  updated_at!: Date;
}
