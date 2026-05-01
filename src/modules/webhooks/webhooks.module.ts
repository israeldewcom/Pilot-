import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { Webhook, WebhookDelivery } from '../../entities/entities';
import { WebhooksService } from './webhooks.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Webhook, WebhookDelivery]),
    BullModule.registerQueue({ name: 'webhook-delivery' }),
  ],
  providers: [WebhooksService],
  exports: [WebhooksService],
})
export class WebhooksModule {}
