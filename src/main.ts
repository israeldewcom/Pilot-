import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import * as compression from 'compression';
import * as cookieParser from 'cookie-parser';
import * as Sentry from '@sentry/node';
import { RedisIoAdapter } from './redis-io.adapter';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  if (process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'development',
      tracesSampleRate: 0.1,
      profilesSampleRate: 0.1,
    });
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    logger: ['error', 'warn', 'log', 'debug'],
    cors: false,
  });

  app.use(helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false,
  }));
  app.use(compression());
  app.use(cookieParser());

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  app.enableCors({
    origin: [frontendUrl, /\.rfpilot\.io$/],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Organization-Id', 'X-Admin-Token', 'X-Admin-TOTP'],
    credentials: true,
    maxAge: 86400,
  });

  app.set('trust proxy', 1);

  const redisIoAdapter = new RedisIoAdapter(app);
  try {
    await redisIoAdapter.connectToRedis();
    app.useWebSocketAdapter(redisIoAdapter);
    logger.log('Connected to Redis for Socket.io scaling');
  } catch (err) {
    logger.warn(`Redis adapter not available: ${err.message}. Using default adapter.`);
  }

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
    stopAtFirstError: false,
  }));

  if (process.env.NODE_ENV !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('RFPilot API')
      .setDescription('AI-Powered Proposal Engine — Complete API Reference (v2.3)')
      .setVersion('2.3.0')
      .addBearerAuth()
      .addTag('Projects')
      .addTag('Documents')
      .addTag('AI Generation')
      .addTag('Evidence')
      .addTag('Compliance')
      .addTag('Billing')
      .addTag('Notifications')
      .addTag('Webhooks')
      .addTag('Experiments')
      .addTag('Analytics')
      .addTag('Admin')
      .addTag('Metrics')
      .addTag('SAM.gov')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
      },
    });
    logger.log('Swagger docs: http://localhost:3000/api/docs');
  }

  app.enableShutdownHooks();

  process.on('SIGTERM', async () => {
    logger.warn('SIGTERM received — shutting down gracefully');
    await app.close();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.warn('SIGINT received — shutting down gracefully');
    await app.close();
    process.exit(0);
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error(`Unhandled Rejection at: ${promise}, reason: ${reason}`);
    Sentry.captureException(reason);
  });

  process.on('uncaughtException', (error) => {
    logger.error(`Uncaught Exception: ${error.message}`, error.stack);
    Sentry.captureException(error);
    process.exit(1);
  });

  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');

  logger.log(`🚀 RFPilot API v2.3 running on port ${port}`);
  logger.log(`📦 Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.log(`🌐 Frontend URL: ${frontendUrl}`);
  logger.log(`📊 Prometheus metrics: http://localhost:${port}/metrics`);
  logger.log(`👑 Admin endpoints: http://localhost:${port}/api/admin`);
}

bootstrap().catch((err) => {
  console.error('Bootstrap failed:', err);
  process.exit(1);
});
