import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // Global Prefix
  app.setGlobalPrefix('api/v1');

  // Enable CORS
  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // Global Pipes & Interceptors
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  // Swagger Documentation Setup
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Liman Web API - E-commerce Sync Engine')
    .setDescription(
      `REST API для двусторонней синхронизации каталогов товаров, цен, остатков и заказов
      между базами данных Limansoft (MariaDB/MySQL) и маркетплейсами (Prom.ua, Rozetka, WooCommerce, Horoshop).
      
      Поддерживает мультиарендность (отдельная БД под каждого клиента), фоновые очереди BullMQ
      для батчинга каталогов 10 000+ SKU и потоковую отдачу изображений из BLOB.`,
    )
    .setVersion('1.0.0')
    .addApiKey(
      { type: 'apiKey', name: 'x-api-key', in: 'header', description: 'Master API Key' },
      'api-key',
    )
    .addTag('Health', 'Проверка жизнеспособности сервиса')
    .addTag('Tenants', 'Управление магазинами и подключениями к БД Limansoft')
    .addTag('Liman Catalog', 'Прямой доступ к товарам, ценам и категориям Limansoft')
    .addTag('Liman Stock', 'Просмотр и синхронизация складских остатков')
    .addTag('Media', 'Потоковая отдача фото товаров из BLOB namedesc в HTTP URL')
    .addTag('Prom.ua', 'Интеграция с Prom.ua (YML XML фиды, REST API, Webhooks)')
    .addTag('WooCommerce', 'Интеграция с WooCommerce (REST API, батчевая синхронизация, вебхуки заказов)')
    .addTag('Rozetka', 'Интеграция с Rozetka (XML/YML фиды, Seller API, дельта-синхронизация цен и остатков, вебхуки)')
    .addTag('Horoshop', 'Интеграция с Хорошоп (YML/XML фиды, REST API обновление цен и остатков, вебхуки заказов)')
    .addTag('Sync Jobs', 'Управление фоновыми задачами и мониторинг очередей BullMQ')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    customSiteTitle: 'Liman Web API Docs',
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      filter: true,
    },
  });

  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  await app.listen(port);
  logger.log(`🚀 Сервис запущен: http://localhost:${port}`);
  logger.log(`📚 Swagger документация: http://localhost:${port}/api/docs`);
}

bootstrap();
