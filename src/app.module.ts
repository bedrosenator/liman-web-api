import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_GUARD } from '@nestjs/core';
import configuration from './config/configuration';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TenantModule } from './modules/tenant/tenant.module';
import { Tenant } from './modules/tenant/tenant.entity';
import { TenantIntegration } from './modules/tenant/tenant-integration.entity';
import { ProductMapping } from './modules/tenant/product-mapping.entity';
import { LimanModule } from './modules/liman/liman.module';
import { MediaModule } from './modules/media/media.module';
import { PromModule } from './modules/prom/prom.module';
import { AppQueueModule } from './modules/queue/queue.module';
import { WoocommerceModule } from './modules/woocommerce/woocommerce.module';
import { RozetkaModule } from './modules/rozetka/rozetka.module';
import { HoroshopModule } from './modules/horoshop/horoshop.module';
import { AlertModule } from './modules/alert/alert.module';
import { BackupModule } from './modules/backup/backup.module';
import { ApiKeyGuard } from './common/guards/api-key.guard';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000, // Окно лимитирования: 60 секунд
        limit: 120, // Максимум 120 запросов в минуту с одного IP
      },
    ]),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const dbType = configService.get<string>('database.type') ?? 'postgres';
        if (dbType === 'sqlite' || dbType === 'better-sqlite3') {
          return {
            type: 'better-sqlite3' as const,
            database:
              configService.get<string>('sqlite.databasePath') ??
              './data/liman_master.sqlite',
            entities: [Tenant, TenantIntegration, ProductMapping],
            synchronize: true,
          };
        }

        return {
          type: 'postgres' as const,
          host: configService.get<string>('database.host') ?? '127.0.0.1',
          port: configService.get<number>('database.port') ?? 5433,
          username: configService.get<string>('database.username') ?? 'postgres',
          password: configService.get<string>('database.password') ?? 'postgres',
          database:
            configService.get<string>('database.database') ?? 'liman_master',
          entities: [Tenant, TenantIntegration, ProductMapping],
          synchronize: true,
        };
      },
    }),
    TenantModule,
    LimanModule,
    MediaModule,
    PromModule,
    AppQueueModule,
    WoocommerceModule,
    RozetkaModule,
    HoroshopModule,
    AlertModule,
    BackupModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ApiKeyGuard,
    },
  ],
})
export class AppModule {}
