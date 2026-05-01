import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Organization, PromoCode, PromoUsage, AiGenerationLog, Document } from '../../entities/entities';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { StripeWebhookController } from './stripe-webhook.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Organization, PromoCode, PromoUsage, AiGenerationLog, Document]),
    NotificationsModule,
  ],
  providers: [BillingService],
  controllers: [BillingController, StripeWebhookController],
  exports: [BillingService],
})
export class BillingModule {}
