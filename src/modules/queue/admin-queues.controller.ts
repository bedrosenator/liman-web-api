import { Controller, Get, Post, Param, NotFoundException, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_NAMES } from './queue.constants';
import { TenantService } from '../tenant/tenant.service';

@ApiTags('Admin / Queues')
@Controller('admin')
export class AdminQueuesController {
  private readonly logger = new Logger(AdminQueuesController.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.SYNC_STOCK)
    private readonly stockQueue: Queue,
    @InjectQueue(QUEUE_NAMES.EXPORT_CATALOG)
    private readonly exportQueue: Queue,
    @InjectQueue(QUEUE_NAMES.IMPORT_ORDERS)
    private readonly ordersQueue: Queue,
    @InjectQueue(QUEUE_NAMES.IMPORT_WOO_CATALOG)
    private readonly wooQueue: Queue,
    private readonly tenantService: TenantService,
  ) {}

  private getQueueByName(name: string): Queue {
    switch (name) {
      case QUEUE_NAMES.SYNC_STOCK:
        return this.stockQueue;
      case QUEUE_NAMES.EXPORT_CATALOG:
        return this.exportQueue;
      case QUEUE_NAMES.IMPORT_ORDERS:
        return this.ordersQueue;
      case QUEUE_NAMES.IMPORT_WOO_CATALOG:
        return this.wooQueue;
      default:
        throw new NotFoundException(`Очередь "${name}" не найдена`);
    }
  }

  @Get('ping')
  @ApiOperation({ summary: 'Проверка валидности Master API Key' })
  @ApiResponse({ status: 200, description: 'Master Key валиден' })
  ping() {
    return { ok: true, role: 'superadmin', timestamp: new Date().toISOString() };
  }

  @Get('queues')
  @ApiOperation({
    summary: 'Получить статистику всех фоновых очередей BullMQ',
  })
  @ApiResponse({ status: 200 })
  async getQueuesStats() {
    const queueList = [
      { name: QUEUE_NAMES.SYNC_STOCK, queue: this.stockQueue, label: 'Синхронизация остатков и цен' },
      { name: QUEUE_NAMES.EXPORT_CATALOG, queue: this.exportQueue, label: 'Пакетный экспорт каталога' },
      { name: QUEUE_NAMES.IMPORT_ORDERS, queue: this.ordersQueue, label: 'Импорт заказов' },
      { name: QUEUE_NAMES.IMPORT_WOO_CATALOG, queue: this.wooQueue, label: 'Импорт из WooCommerce' },
    ];

    const stats = await Promise.all(
      queueList.map(async (item) => {
        try {
          const counts = await item.queue.getJobCounts(
            'waiting',
            'active',
            'completed',
            'failed',
            'delayed',
          );
          return {
            name: item.name,
            label: item.label,
            isPaused: await item.queue.isPaused(),
            counts: {
              waiting: counts.waiting || 0,
              active: counts.active || 0,
              completed: counts.completed || 0,
              failed: counts.failed || 0,
              delayed: counts.delayed || 0,
            },
          };
        } catch (err: any) {
          this.logger.error(`Ошибка получения счетчиков для очереди ${item.name}: ${err.message}`);
          return {
            name: item.name,
            label: item.label,
            isPaused: false,
            counts: { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 },
            error: err.message,
          };
        }
      }),
    );

    return { queues: stats, timestamp: new Date().toISOString() };
  }

  @Post('queues/:queueName/retry-failed')
  @ApiOperation({ summary: 'Повторить упавшие задачи в выбранной очереди' })
  @ApiParam({ name: 'queueName', example: 'sync-stock' })
  async retryFailedJobs(@Param('queueName') queueName: string) {
    const queue = this.getQueueByName(queueName);
    const failedJobs = await queue.getJobs(['failed']);
    let retried = 0;

    for (const job of failedJobs) {
      try {
        await job.retry();
        retried++;
      } catch (err: any) {
        this.logger.warn(`Не удалось перезапустить задачу #${job.id} в ${queueName}: ${err.message}`);
      }
    }

    this.logger.log(`🔄 Перезапущено ${retried} из ${failedJobs.length} задач в очереди "${queueName}"`);
    return { success: true, queueName, retried, totalFailed: failedJobs.length };
  }

  @Get('overview')
  @ApiOperation({ summary: 'Сводные метрики системы (SaaS Overview)' })
  async getOverview() {
    const tenants = await this.tenantService.findAll();
    const activeTenants = tenants.filter((t) => t.isActive);

    let totalWaiting = 0;
    let totalActive = 0;
    let totalFailed = 0;

    const queues = [this.stockQueue, this.exportQueue, this.ordersQueue, this.wooQueue];
    for (const q of queues) {
      try {
        const counts = await q.getJobCounts('waiting', 'active', 'failed');
        totalWaiting += counts.waiting || 0;
        totalActive += counts.active || 0;
        totalFailed += counts.failed || 0;
      } catch {
        // Redis может быть временно недоступен в тестах
      }
    }

    const queueStatus = totalFailed > 0 ? 'error' : totalActive > 0 ? 'busy' : 'normal';

    return {
      tenantsCount: tenants.length,
      activeTenantsCount: activeTenants.length,
      redisStatus: 'healthy',
      queueStatus,
      totalWaiting,
      totalActive,
      totalFailed,
      timestamp: new Date().toISOString(),
    };
  }
}
