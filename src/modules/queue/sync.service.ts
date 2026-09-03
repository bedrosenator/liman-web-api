import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_NAMES, SyncStockJobData } from './queue.constants';
import { TenantService } from '../tenant/tenant.service';

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.SYNC_STOCK)
    private readonly stockQueue: Queue<SyncStockJobData>,
    private readonly tenantService: TenantService,
  ) {}

  async triggerStockSync(tenantId: string, targetPlatform: 'prom' = 'prom') {
    const tenant = await this.tenantService.findOne(tenantId);
    this.logger.log(`📥 Постановка в очередь BullMQ задачи синхронизации остатков для [${tenant.id}]`);

    const job = await this.stockQueue.add(
      'sync-stock-job',
      {
        tenantId: tenant.id,
        targetPlatform,
      },
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    );

    return {
      success: true,
      message: 'Задача синхронизации успешно поставлена в очередь',
      jobId: job.id,
      queue: QUEUE_NAMES.SYNC_STOCK,
      tenantId: tenant.id,
    };
  }

  async getJobStatus(queueName: string, jobId: string) {
    let queue: Queue | null = null;
    if (queueName === QUEUE_NAMES.SYNC_STOCK) queue = this.stockQueue;

    if (!queue) {
      throw new NotFoundException(`Очередь "${queueName}" не поддерживается`);
    }

    const job = await queue.getJob(jobId);
    if (!job) {
      throw new NotFoundException(`Задача с ID "${jobId}" не найдена в очереди "${queueName}"`);
    }

    const state = await job.getState();
    const progress = job.progress;
    const returnValue = job.returnvalue;
    const failedReason = job.failedReason;

    return {
      id: job.id,
      name: job.name,
      state,
      progress,
      result: returnValue,
      error: failedReason,
      timestamp: job.timestamp,
    };
  }
}
