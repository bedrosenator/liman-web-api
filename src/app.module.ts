import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_GUARD } from '@nestjs/core';
import configuration from './config/configuration';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TenantModule } from './modules/tenant/tenant.module';
import { Tenant } from './modules/tenant/tenant.entity';
import { LimanModule } from './modules/liman/liman.module';
import { MediaModule } from './modules/media/media.module';
import { PromModule } from './modules/prom/prom.module';
import { AppQueueModule } from './modules/queue/queue.module';
import { WoocommerceModule } from './modules/woocommerce/woocommerce.module';
import { RozetkaModule } from './modules/rozetka/rozetka.module';
import { HoroshopModule } from './modules/horoshop/horoshop.module';
import { ApiKeyGuard } from './common/guards/api-key.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'better-sqlite3',
        database:
          configService.get<string>('sqlite.databasePath') ??
          './data/liman_master.sqlite',
        entities: [Tenant],
        synchronize: true,
      }),
    }),
    TenantModule,
    LimanModule,
    MediaModule,
    PromModule,
    AppQueueModule,
    WoocommerceModule,
    RozetkaModule,
    HoroshopModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ApiKeyGuard,
    },
  ],
})
export class AppModule {}
