import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiSecurity } from '@nestjs/swagger';
import { AlertService } from './alert.service';
import { AlertThrottlerService } from './alert-throttler.service';
import { TestAlertDto } from './dto/test-alert.dto';

@ApiTags('Alerts & Monitoring')
@ApiSecurity('x-api-key')
@Controller('alerts')
export class AlertController {
  constructor(
    private readonly alertService: AlertService,
    private readonly throttlerService: AlertThrottlerService,
  ) {}

  @Post('test')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Отправить тестовый алерт в Telegram и Webhook',
    description:
      'Используется для проверки работоспособности Telegram-бота, формата HTML и доставки внешних Webhook уведомлений.',
  })
  @ApiResponse({
    status: 200,
    description: 'Результат отправки алерта по каналам связи',
  })
  async sendTestAlert(@Body() dto: TestAlertDto) {
    const result = await this.alertService.sendAlert({
      level: dto.level || 'CRITICAL',
      source: dto.source || 'system',
      tenantId: dto.tenantId || 'columb',
      title: dto.title || 'Тестовый сигнал системы мониторинга',
      message: dto.message || 'Проверка доставки уведомлений в Telegram и Webhook',
      errorDetails: dto.errorDetails,
      timestamp: new Date(),
    });

    return {
      success: true,
      data: result,
    };
  }

  @Post('reset-throttle')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Сбросить кэш троттлинга алертов',
    description: 'Сбрасывает все временные счетчики подавления дубликатов для тестирования.',
  })
  @ApiResponse({
    status: 200,
    description: 'Кэш троттлинга успешно очищен',
  })
  resetThrottle() {
    this.throttlerService.clear();
    return {
      success: true,
      message: 'Кэш троттлинга алертов успешно очищен',
    };
  }
}
