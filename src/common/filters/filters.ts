import {
  ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus,
  Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { Observable, throwError } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';
import { MetricsService } from '../../monitoring/metrics.service';
import * as Sentry from '@sentry/node';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const responseBody = exception.getResponse();
      message = typeof responseBody === 'string' ? responseBody : (responseBody as any).message || message;
    } else if (exception instanceof Error) {
      message = exception.message;
      Sentry.captureException(exception);
    }

    this.logger.error(`${request.method} ${request.url} - ${status}: ${message}`);

    response.status(status).json({
      statusCode: status,
      message: Array.isArray(message) ? message : [message],
      timestamp: new Date().toISOString(),
      path: request.url,
      requestId: (request as any).requestId,
    });
  }
}

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');
  constructor(private readonly metricsService?: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const { method, url } = request;
    const startTime = Date.now();
    const requestId = (request as any).requestId || uuidv4();
    (request as any).requestId = requestId;

    return next.handle().pipe(
      tap(() => {
        const response = context.switchToHttp().getResponse<Response>();
        const duration = Date.now() - startTime;
        this.logger.log(`${method} ${url} ${response.statusCode} ${duration}ms [${requestId}]`);
        if (this.metricsService) {
          this.metricsService.recordHttp(method, url, response.statusCode, duration / 1000);
        }
      }),
      catchError((error) => {
        const duration = Date.now() - startTime;
        this.logger.error(`${method} ${url} ${error.status || 500} ${duration}ms [${requestId}] - ${error.message}`);
        if (this.metricsService) {
          this.metricsService.recordHttp(method, url, error.status || 500, duration / 1000);
        }
        return throwError(() => error);
      }),
    );
  }
}

@Injectable()
export class TransformInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((data) => ({
        data,
        timestamp: new Date().toISOString(),
        requestId: (context.switchToHttp().getRequest<Request>() as any).requestId,
      })),
    );
  }
}

export function RequestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  (req as any).requestId = req.headers['x-request-id'] || uuidv4();
  res.setHeader('X-Request-ID', (req as any).requestId);
  next();
}
