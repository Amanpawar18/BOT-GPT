import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendMessageDto {
  @ApiProperty({
    example: 'What are the main findings of the paper?',
    description: 'Message content — minimum 1 character',
    minLength: 1,
  })
  @IsString()
  @MinLength(1)
  content: string;
}
