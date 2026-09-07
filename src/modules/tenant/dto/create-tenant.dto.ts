import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsBoolean,
  Min,
  Max,
  Matches,
} from 'class-validator';

export class CreateTenantDto {
  @ApiProperty({
    description: 'Уникальный идентификатор (slug) клиента',
    example: 'columb',
  })
  @IsString()
  @IsNotEmpty()
  id!: string;

  @ApiProperty({
    description: 'Название магазина/клиента',
    example: 'Columb Shop',
  })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({
    description: 'Хост базы данных MariaDB Limansoft',
    example: '127.0.0.1',
    default: '127.0.0.1',
  })
  @IsString()
  @IsNotEmpty()
  dbHost!: string;

  @ApiProperty({
    description: 'Порт базы данных MariaDB Limansoft',
    example: 3306,
    default: 3306,
  })
  @IsNumber()
  @Min(1)
  @Max(65535)
  dbPort!: number;

  @ApiProperty({
    description: 'Имя базы данных Limansoft',
    example: 'columbDB',
  })
  @IsString()
  @IsNotEmpty()
  dbName!: string;

  @ApiProperty({
    description: 'Пользователь БД',
    example: 'root',
    default: 'root',
  })
  @IsString()
  @IsNotEmpty()
  dbUser!: string;

  @ApiPropertyOptional({
    description: 'Пароль к БД',
    example: 'rootpassword',
    default: '',
  })
  @IsString()
  @IsOptional()
  dbPassword?: string;

  @ApiPropertyOptional({
    description: 'API токен Prom.ua',
    example: 'prom_api_token_here',
  })
  @IsString()
  @IsOptional()
  promApiKey?: string;

  @ApiPropertyOptional({
    description: 'Включить авто-экспорт в Prom.ua',
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  promExportEnabled?: boolean;

  @ApiPropertyOptional({
    description: 'Колонка цены в таблице name2 (cena1...cena31)',
    example: 'cena2',
    default: 'cena2',
  })
  @IsString()
  @IsOptional()
  @Matches(/^[a-zA-Z0-9_]{1,32}$/, { message: 'priceColumn must be a valid alphanumeric SQL identifier (1-32 chars)' })
  priceColumn?: string;

  @ApiPropertyOptional({
    description: 'Колонка остатка в таблице name2ost (skl_k, skl_kt, skl_r)',
    example: 'skl_k',
    default: 'skl_k',
  })
  @IsString()
  @IsOptional()
  @Matches(/^[a-zA-Z0-9_]{1,32}$/, { message: 'stockColumn must be a valid alphanumeric SQL identifier (1-32 chars)' })
  stockColumn?: string;

  @ApiPropertyOptional({
    description: 'Интервал синхронизации в минутах',
    example: 15,
    default: 15,
  })
  @IsNumber()
  @IsOptional()
  syncIntervalMinutes?: number;

  @ApiPropertyOptional({
    description: 'Активен ли клиент',
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'API Key тенанта (UUID). Если не указан — генерируется автоматически.',
    example: 'a1b2c3d4-e5f6-...',
  })
  @IsString()
  @IsOptional()
  apiKey?: string;

  @ApiPropertyOptional({
    description: 'URL WooCommerce магазина (без слеша на конце)',
    example: 'http://localhost:8080',
  })
  @IsString()
  @IsOptional()
  woocommerceUrl?: string;

  @ApiPropertyOptional({
    description: 'WooCommerce Consumer Key (REST API)',
    example: 'ck_xxxx',
  })
  @IsString()
  @IsOptional()
  woocommerceConsumerKey?: string;

  @ApiPropertyOptional({
    description: 'WooCommerce Consumer Secret (REST API)',
    example: 'cs_xxxx',
  })
  @IsString()
  @IsOptional()
  woocommerceConsumerSecret?: string;

  @ApiPropertyOptional({
    description: 'Включить фоновую авто-синхронизацию с WooCommerce по расписанию',
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  woocommerceSyncEnabled?: boolean;

  @ApiPropertyOptional({
    description: 'Интервал фоновой синхронизации с WooCommerce (минуты: 15, 30, 60)',
    example: 15,
    default: 15,
  })
  @IsNumber()
  @IsOptional()
  woocommerceSyncIntervalMinutes?: number;

  @ApiPropertyOptional({
    description: 'Дата и время последней успешной синхронизации',
  })
  @IsOptional()
  lastSyncAt?: Date;

  @ApiPropertyOptional({
    description: 'Rozetka Seller API Client ID (username)',
    example: 'my-rozetka-user',
  })
  @IsString()
  @IsOptional()
  rozetkaClientId?: string;

  @ApiPropertyOptional({
    description: 'Rozetka Seller API Client Secret (password)',
    example: 'my-rozetka-secret',
  })
  @IsString()
  @IsOptional()
  rozetkaClientSecret?: string;

  @ApiPropertyOptional({
    description: 'Включить экспорт в Rozetka',
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  rozetkaExportEnabled?: boolean;

  @ApiPropertyOptional({
    description: 'Домен магазина Хорошоп (например: myshop.horoshop.ua или myshop.com.ua)',
    example: 'myshop.horoshop.ua',
  })
  @IsString()
  @IsOptional()
  horoshopDomain?: string;

  @ApiPropertyOptional({
    description: 'Логин API-пользователя Хорошоп (создается в админке: Настройки -> Пользователи)',
    example: 'api_user',
  })
  @IsString()
  @IsOptional()
  horoshopLogin?: string;

  @ApiPropertyOptional({
    description: 'Пароль API-пользователя Хорошоп',
    example: 'api_password_123',
  })
  @IsString()
  @IsOptional()
  horoshopPassword?: string;

  @ApiPropertyOptional({
    description: 'Включить интеграцию/экспорт в Хорошоп',
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  horoshopExportEnabled?: boolean;

  @ApiPropertyOptional({
    description: 'Интервал синхронизации с Хорошоп (в минутах)',
    example: 15,
    default: 15,
  })
  @IsNumber()
  @IsOptional()
  horoshopSyncIntervalMinutes?: number;

  @ApiPropertyOptional({
    description: 'Метка времени последней успешной синхронизации',
  })
  @IsOptional()
  lastSyncAt?: Date;
}

