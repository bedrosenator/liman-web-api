import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AppService } from './app.service';
import { Public } from './common/decorators/public.decorator';

@ApiTags('Health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  @Public()
  @ApiOperation({ summary: 'Проверка работоспособности сервиса' })
  @ApiResponse({
    status: 200,
    description: 'Сервис активен и готов к обработке запросов',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'ok' },
        timestamp: { type: 'string', example: '2026-09-02T12:00:00.000Z' },
        uptime: { type: 'number', example: 12.34 },
      },
    },
  })
  getHealth() {
    return this.appService.getHealth();
  }
}
