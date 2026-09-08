import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import type { AlertLevel, AlertSource } from '../interfaces/alert.interface';

export class TestAlertDto {
  @ApiPropertyOptional({
    description: 'Уровень критичности алерта',
    enum: ['CRITICAL', 'WARNING', 'INFO'],
    default: 'CRITICAL',
    example: 'CRITICAL',
  })
  @IsOptional()
  @IsEnum(['CRITICAL', 'WARNING', 'INFO'])
  level?: AlertLevel = 'CRITICAL';

  @ApiPropertyOptional({
    description: 'Источник сбоя',
    enum: ['mariadb', 'bullmq', 'prom', 'rozetka', 'woocommerce', 'horoshop', 'system'],
    default: 'system',
    example: 'system',
  })
  @IsOptional()
  @IsEnum(['mariadb', 'bullmq', 'prom', 'rozetka', 'woocommerce', 'horoshop', 'system'])
  source?: AlertSource = 'system';

  @ApiPropertyOptional({
    description: 'Идентификатор тенанта',
    example: 'columb',
  })
  @IsOptional()
  @IsString()
  tenantId?: string = 'columb';

  @ApiPropertyOptional({
    description: 'Заголовок алерта',
    example: 'Тестовый сигнал системы мониторинга',
  })
  @IsOptional()
  @IsString()
  title?: string = 'Тестовый сигнал системы мониторинга';

  @ApiPropertyOptional({
    description: 'Текст сообщения',
    example: 'Проверка доставки уведомлений в Telegram и Webhook',
  })
  @IsOptional()
  @IsString()
  message?: string = 'Проверка доставки уведомлений в Telegram и Webhook';

  @ApiPropertyOptional({
    description: 'Технические подробности ошибки',
    example: 'Error: Connection timeout at LimanWebApiClient.test()',
  })
  @IsOptional()
  @IsString()
  errorDetails?: string = 'Тестовые детали ошибки (Stack trace simulation)';
}
