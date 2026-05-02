import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const logger = new Logger('Worker');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
  });
  logger.log('🚀 RFPilot Worker started');
  process.on('SIGTERM', async () => {
    logger.warn('SIGTERM received — shutting down worker');
    await app.close();
    process.exit(0);
  });
  process.on('SIGINT', async () => {
    logger.warn('SIGINT received — shutting down worker');
    await app.close();
    process.exit(0);
  });
}
bootstrap();
