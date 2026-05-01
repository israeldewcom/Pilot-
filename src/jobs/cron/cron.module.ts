import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Organization, Notification, AiGenerationLog, Webhook, WebhookDelivery, Project, CompanyProfile } from '../../entities/entities';
import { ScheduledTasksService } from './scheduled-tasks.service';
import { GrowthHacksService } from './growth-hacks.service';
import { EmailModule } from '../../modules/email/email.module';
import { BillingModule } from '../../modules/billing/billing.module';
import { SamGovModule } from '../../modules/sam-gov/sam-gov.module';
import { NotificationsModule } from '../../modules/notifications/notifications.module';
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [
    TypeOrmModule.forFeature([Organization, Notification, AiGenerationLog, Webhook, WebhookDelivery, Project, CompanyProfile]),
    BullModule.registerQueue({ name: 'win-score-recalc' }, { name: 'compliance-scanner' }),
    EmailModule,
    BillingModule,
    SamGovModule,
    NotificationsModule,
  ],
  providers: [ScheduledTasksService, GrowthHacksService],
  exports: [ScheduledTasksService, GrowthHacksService],
})
export class CronModule {}
