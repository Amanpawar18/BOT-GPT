import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Service health check' })
  @ApiResponse({
    status: 200,
    schema: {
      example: { status: 'ok', timestamp: '2026-04-27T00:00:00.000Z' },
    },
  })
  check() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
