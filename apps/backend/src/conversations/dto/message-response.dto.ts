import { ApiProperty } from '@nestjs/swagger';

export class MessageResponseDto {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  id!: string;

  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  conversation_id!: string;

  @ApiProperty({ enum: ['user', 'assistant', 'system'], example: 'user' })
  role!: 'user' | 'assistant' | 'system';

  @ApiProperty({ example: 'What are the main findings?' })
  content!: string;

  @ApiProperty({ example: 12, nullable: true })
  token_count!: number;

  @ApiProperty({ example: '2026-04-27T00:00:00.000Z' })
  created_at!: Date;
}
