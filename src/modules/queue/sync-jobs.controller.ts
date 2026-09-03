import { Controller, Post, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { SyncService } from './sync.service';

@ApiTags('Sync Jobs')
@Controller('sync')
export class SyncJobsController {
  constructor(private readonly syncService: SyncService) {}

  @Post(':tenantId/stock')
  @ApiOperation({
    summary: 'Запустить фоновую синхронизацию остатков и цен через очередь BullMQ',
  })
  @ApiParam({ name: 'tenantId', example: 'columb' })
  @ApiQuery({ name: 'platform', required: false, example: 'prom', enum: ['prom', 'rozetka', 'woocommerce'] })
  @ApiResponse({ status: 202, description: 'Задача поставлена в очередь' })
  async triggerStockSync(
    @Param('tenantId') tenantId: string,
    @Query('platform') platform: 'prom' = 'prom',
  ) {
    return this.syncService.triggerStockSync(tenantId, platform);
  }

  @Get('jobs/:queueName/:jobId')
  @ApiOperation({ summary: 'Проверить статус фоновой задачи и прогресс в %' })
  @ApiParam({ name: 'queueName', example: 'sync-stock' })
  @ApiParam({ name: 'jobId', example: '1' })
  async getJobStatus(
    @Param('queueName') queueName: string,
    @Param('jobId') jobId: string,
  ) {
    return this.syncService.getJobStatus(queueName, jobId);
  }
}
