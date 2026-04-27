import { ApiProperty } from '@nestjs/swagger';

export class DocumentResponseDto {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  id!: string;

  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  user_id!: string;

  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  conversation_id!: string;

  @ApiProperty({ example: 'research-paper.pdf', nullable: true })
  filename!: string;

  @ApiProperty({ nullable: true })
  r2_url!: string;

  @ApiProperty({ enum: ['processing', 'ready', 'failed'], example: 'ready' })
  status!: 'processing' | 'ready' | 'failed';

  @ApiProperty({ example: '2026-04-27T00:00:00.000Z' })
  created_at!: Date;
}
