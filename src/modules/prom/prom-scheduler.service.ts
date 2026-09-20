import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { TenantService } from '../tenant/tenant.service';
import { SyncService } from '../queue/sync.service';
import { PromSyncService } from './prom-sync.service';

/**
 * Сервис периодического авто-планирования фоновой синхронизации Prom.ua.
 *
 * Функции:
 * 1. Каждую минуту проверяет всех арендаторов (Tenants), у которых включен тумблер `promExportEnabled`.
 * 2. Если прошло >= `promSyncIntervalMinutes` (5, 15, 30 или 60 мин) с момента последней синхронизации,
 *    ставит фоновую задачу обновления цен и остатков в надежную очередь BullMQ (`sync-stock`).
 * 3. Выполняет автоматический периодический опрос (Polling) новых заказов Prom.ua раз в 15 минут
 *    и списывает остатки через LimanOrderService.
 */
@Injectable()
export class PromSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PromSchedulerService.name);
  private timer: NodeJS.Timeout | null = null;
  private isTickRunning = false;

  // Хранит время последнего опроса заказов per-tenant (мс)
  private readonly lastOrderPoll = new Map<string, number>();

  constructor(
    private readonly tenantService: TenantService,
    @Inject(forwardRef(() => SyncService))
    private readonly syncService: SyncService,
    private readonly promSyncService: PromSyncService,
  ) {}

  onModuleInit() {
    this.logger.log('⏰ Запуск планировщика автосинхронизации Prom.ua...');
    // Запускаем интервал каждые 60 секунд
    this.timer = setInterval(() => {
      void this.handleCronTick();
    }, 60_000);

    // Первичный запуск через 12 секунд после старта приложения
    setTimeout(() => {
      void this.handleCronTick();
    }, 12_000);
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this.logger.log('🛑 Планировщик автосинхронизации Prom.ua остановлен');
    }
  }

  /**
   * Периодический тик планировщика
   */
  async handleCronTick() {
    if (this.isTickRunning) {
      return;
    }
    this.isTickRunning = true;

    try {
      const tenants = await this.tenantService.findAll();
      const activeTenants = tenants.filter(
        (t) => t.isActive && t.promExportEnabled && t.promApiKey,
      );

      for (const tenant of activeTenants) {
        await this.processTenant(tenant);
      }
    } catch (err: any) {
      this.logger.error(
        `❌ Ошибка в цикле планировщика Prom.ua: ${err.message}`,
        err.stack,
      );
    } finally {
      this.isTickRunning = false;
    }
  }

  /**
   * Обработка одного тенанта в тике планировщика.
   *
   * ВАЖНО: НЕ обновляем lastSyncAt здесь — это делает SyncQueueProcessor
   * (sync-queue.processor.ts) только после успешного завершения воркера.
   * Обновление lastSyncAt до завершения воркера приводит к тому, что при сбое
   * задачи следующий тик ошибочно считает синхронизацию выполненной и пропускает её.
   */
  private async processTenant(
    tenant: Awaited<ReturnType<TenantService['findOne']>>,
  ) {
    const now = Date.now();
    const intervalMinutes = tenant.promSyncIntervalMinutes || 15;
    const intervalMs = intervalMinutes * 60 * 1000;

    // 1. Проверка синхронизации остатков и цен
    const lastSyncTime = tenant.lastSyncAt
      ? new Date(tenant.lastSyncAt).getTime()
      : 0;

    if (now - lastSyncTime >= intervalMs) {
      this.logger.log(
        `⏰ [${tenant.id}] Наступило время автосинхронизации Prom.ua (интервал: ${intervalMinutes} мин). Постановка в BullMQ...`,
      );

      try {
        // lastSyncAt будет обновлён в SyncQueueProcessor после успешного завершения задачи
        await this.syncService.triggerStockSync(tenant.id, 'prom');
      } catch (err: any) {
        this.logger.error(
          `❌ [${tenant.id}] Не удалось поставить задачу синхронизации Prom в очередь: ${err.message}`,
        );
      }
    }

    // 2. Фоновый опрос новых заказов (раз в 15 минут) для автосписания
    const lastOrderTime = this.lastOrderPoll.get(tenant.id) || 0;
    const orderPollIntervalMs = 15 * 60 * 1000;

    if (now - lastOrderTime >= orderPollIntervalMs) {
      this.lastOrderPoll.set(tenant.id, now);
      try {
        const orderResult = await this.promSyncService.syncOrders(tenant, {
          status: 'pending',
          limit: 20,
        });

        if (orderResult.processedOrders > 0) {
          this.logger.log(
            `🛒 [${tenant.id}] Фоновый опрос Prom: списаны остатки по ${orderResult.processedOrders} заказам (${orderResult.itemsDeducted.length} позиций)`,
          );
        }
      } catch (err: any) {
        this.logger.warn(
          `⚠️ [${tenant.id}] Ошибка фонового опроса заказов Prom.ua: ${err.message}`,
        );
      }
    }
  }
}
