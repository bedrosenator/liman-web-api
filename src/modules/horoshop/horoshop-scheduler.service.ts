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
import { HoroshopSyncService } from './horoshop-sync.service';

/**
 * Сервис периодического авто-планирования фоновой синхронизации Хорошоп.
 *
 * Функции:
 * 1. Каждую минуту проверяет всех арендаторов (Tenants), у которых включен тумблер `horoshopExportEnabled`.
 * 2. Если прошло >= `horoshopSyncIntervalMinutes` (15, 30 или 60 мин) с момента последней синхронизации,
 *    ставит фоновую задачу обновления цен и остатков в надежную очередь BullMQ (`sync-stock`).
 * 3. Для клиентов на тарифах Хорошоп без поддержки вебхуков выполняет автоматический опрос (Polling)
 *    новых заказов и списывает остатки в таблице `name2ost` базы данных Limansoft.
 */
@Injectable()
export class HoroshopSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HoroshopSchedulerService.name);
  private timer: NodeJS.Timeout | null = null;
  private isTickRunning = false;

  // Хранит время последнего опроса заказов per-tenant (мс)
  private readonly lastOrderPoll = new Map<string, number>();

  constructor(
    private readonly tenantService: TenantService,
    @Inject(forwardRef(() => SyncService))
    private readonly syncService: SyncService,
    private readonly horoshopSyncService: HoroshopSyncService,
  ) {}

  onModuleInit() {
    this.logger.log('⏰ Запуск планировщика автосинхронизации Хорошоп...');
    // Запускаем интервал каждые 60 секунд
    this.timer = setInterval(() => {
      void this.handleCronTick();
    }, 60_000);

    // Первичный запуск через 10 секунд после старта приложения
    setTimeout(() => {
      void this.handleCronTick();
    }, 10_000);
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this.logger.log('🛑 Планировщик автосинхронизации Хорошоп остановлен');
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
        (t) => t.isActive && t.horoshopExportEnabled && t.horoshopDomain,
      );

      for (const tenant of activeTenants) {
        await this.processTenant(tenant);
      }
    } catch (err: any) {
      this.logger.error(
        `❌ Ошибка в цикле планировщика Хорошоп: ${err.message}`,
        err.stack,
      );
    } finally {
      this.isTickRunning = false;
    }
  }

  private async processTenant(tenant: any) {
    const now = Date.now();
    const intervalMinutes = tenant.horoshopSyncIntervalMinutes || 15;
    const intervalMs = intervalMinutes * 60 * 1000;

    // 1. Проверка синхронизации остатков и цен
    const lastSyncTime = tenant.lastSyncAt
      ? new Date(tenant.lastSyncAt).getTime()
      : 0;

    if (now - lastSyncTime >= intervalMs) {
      this.logger.log(
        `⏰ [${tenant.id}] Наступило время автосинхронизации Хорошоп (интервал: ${intervalMinutes} мин). Постановка в BullMQ...`,
      );

      try {
        await this.syncService.triggerStockSync(tenant.id, 'horoshop');
        // Обновляем lastSyncAt, чтобы предотвратить повторный запуск на следующем тике
        await this.tenantService.update(tenant.id, {
          lastSyncAt: new Date(),
        });
      } catch (err: any) {
        this.logger.error(
          `❌ [${tenant.id}] Не удалось поставить задачу синхронизации в очередь: ${err.message}`,
        );
      }
    }

    // 2. Фоновый опрос новых заказов (раз в 15 минут) для автосписания
    const lastOrderTime = this.lastOrderPoll.get(tenant.id) || 0;
    const orderPollIntervalMs = 15 * 60 * 1000;

    if (now - lastOrderTime >= orderPollIntervalMs) {
      this.lastOrderPoll.set(tenant.id, now);
      try {
        const orderResult = await this.horoshopSyncService.syncOrders(tenant, {
          status: 'new',
          limit: 20,
        });

        if (orderResult.processedOrders > 0) {
          this.logger.log(
            `🛒 [${tenant.id}] Фоновый опрос: списаны остатки по ${orderResult.processedOrders} заказам Хорошоп (${orderResult.itemsDeducted.length} позиций)`,
          );
        }
      } catch (err: any) {
        this.logger.warn(
          `⚠️ [${tenant.id}] Ошибка фонового опроса заказов Хорошоп: ${err.message}`,
        );
      }
    }
  }
}
