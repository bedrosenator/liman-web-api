import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from '../tenant/tenant.entity';
import { LimanModule } from '../liman/liman.module';
import { BackupService, BACKUP_REDIS_CLIENT } from './backup.service';
import { BackupController } from './backup.controller';
import IORedis from 'ioredis';

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([Tenant]), LimanModule],
  controllers: [BackupController],
  providers: [
    BackupService,
    {
      provide: BACKUP_REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): IORedis => {
        return new IORedis({
          host: configService.get<string>('redis.host', 'localhost'),
          port: configService.get<number>('redis.port', 6379),
          password: configService.get<string>('redis.password') || undefined,
          lazyConnect: true,
        });
      },
    },
  ],
  exports: [BackupService],
})
export class BackupModule {}
