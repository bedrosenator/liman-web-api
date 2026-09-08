import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
  Optional,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AlertService } from '../../modules/alert/alert.service';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(@Optional() private readonly alertService?: AlertService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const isProd = process.env.NODE_ENV === 'production';
    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : isProd
          ? 'Внутренняя ошибка сервера. Обратитесь к администратору.'
          : exception instanceof Error
            ? exception.message
            : 'Internal server error';

    this.logger.error(
      `[${request.method}] ${request.url} - Status: ${status}`,
      exception instanceof Error ? exception.stack : JSON.stringify(exception),
    );

    // Если статус ошибки 500+, отправляем алерт администратору
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      const tenantId =
        (request.params as any)?.tenantId ||
        ((request as any).tenant as any)?.id;

      void this.alertService?.sendCritical(
        'system',
        `Ошибка HTTP ${status}: [${request.method}] ${request.url}`,
        typeof message === 'object' ? JSON.stringify(message) : String(message),
        exception instanceof Error ? exception.stack : JSON.stringify(exception),
        tenantId,
        {
          method: request.method,
          url: request.url,
          ip: request.ip,
        },
      );
    }

    response.status(status).json({
      success: false,
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      error: typeof message === 'object' ? message : { message },
    });
  }
}
