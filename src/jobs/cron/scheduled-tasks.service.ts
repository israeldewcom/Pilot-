import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Project } from '../../entities/entities';
import { Organization } from '../../entities/entities';
import { CompanyProfile } from '../../entities/entities';
import { Notification, NotificationType } from '../../entities/entities';
import { WebhookDelivery, DeliveryStatus } from '../../entities/entities';
import { Webhook } from '../../entities/entities';
import { AiGenerationLog } from '../../entities/entities';
import { BillingService } from '../../modules/billing/billing.service';
import { SamGovService } from '../../modules/sam-gov/sam-gov.service';
import { NotificationsService } from '../../modules/notifications/notifications.service';
import { FeatureFlagsService } from '../../common/feature-flags/feature-flags.service';

@Injectable()
export class ScheduledTasksService {
  private readonly logger = new Logger(ScheduledTasksService.name);

  constructor(
    @InjectRepository(Project) private projectRepo: Repository<Project>,
    @InjectRepository(Organization) private orgRepo: Repository<Organization>,
    @InjectRepository(CompanyProfile) private companyProfileRepo: Repository<CompanyProfile>,
    @InjectRepository(Notification) private notifRepo: Repository<Notification>,
    @InjectRepository(WebhookDelivery) private deliveryRepo: Repository<WebhookDelivery>,
    @InjectRepository(AiGenerationLog) private logRepo: Repository<AiGenerationLog>,
    @InjectQueue('win-score-recalc') private winScoreQueue: Queue,
    @InjectQueue('compliance-scanner') private complianceQueue: Queue,
    private billingService: BillingService,
    private samGovService: SamGovService,
    private notificationsService: NotificationsService,
    private featureFlags: FeatureFlagsService,
  ) {}

  @Cron('0 8 * * *')
  async sendDeadlineReminders() {
    this.logger.log('Running deadline reminder job');
    const in7Days = new Date(Date.now() + 7 * 86400000);
    const in3Days = new Date(Date.now() + 3 * 86400000);
    const now = new Date();

    const urgentProjects = await this.projectRepo
      .createQueryBuilder('p')
      .where('p.dueDate BETWEEN :now AND :in3days', { now, in3days: in3Days })
      .andWhere('p.deleted = false')
      .andWhere('p.archived = false')
      .andWhere("p.status NOT IN ('completed', 'won', 'lost')")
      .getMany();

    const upcomingProjects = await this.projectRepo
      .createQueryBuilder('p')
      .where('p.dueDate BETWEEN :in3days AND :in7days', { in3days: in3Days, in7days: in7Days })
      .andWhere('p.deleted = false')
      .andWhere('p.archived = false')
      .andWhere("p.status NOT IN ('completed', 'won', 'lost')")
      .getMany();

    for (const project of [...urgentProjects, ...upcomingProjects]) {
      const daysLeft = Math.ceil((new Date(project.dueDate).getTime() - now.getTime()) / 86400000);
      await this.notifRepo.save({
        userId: project.ownerId,
        organizationId: project.organizationId,
        type: NotificationType.DEADLINE_APPROACHING,
        title: `🚨 ${daysLeft} Days Until Deadline`,
        description: `"${project.name}" is due ${new Date(project.dueDate).toLocaleDateString()}.`,
        actionUrl: `/projects/${project.id}`,
        actionLabel: 'Open Project',
        metadata: { daysLeft, projectId: project.id },
      });
    }

    this.logger.log(`Sent ${urgentProjects.length + upcomingProjects.length} deadline reminders`);
  }

  @Cron('0 2 1 * *')
  async processMonthlyOverages() {
    this.logger.log('Processing monthly AI token overages...');
    const orgs = await this.orgRepo.find({
      where: { isActive: true, subscriptionStatus: 'active' }
    });
    for (const org of orgs) {
      await this.billingService.processMonthlyOverage(org.id);
      await this.orgRepo.update(org.id, { aiTokensUsed: 0 });
    }
    this.logger.log(`Processed overages for ${orgs.length} orgs`);
  }

  @Cron('0 6 * * *')
  async syncSamOpportunities() {
    if (!this.featureFlags.isEnabled('sam_gov')) return;
    this.logger.log('Starting daily SAM.gov sync');
    
    const profiles = await this.companyProfileRepo.find();
    for (const profile of profiles) {
      if (!profile.naicsCode) continue;
      try {
        const results = await this.samGovService.searchOpportunities(
          [],
          profile.naicsCode
        );
        if (results?.opportunitiesData?.length > 0) {
          const members = await this.orgRepo.manager.query(
            `SELECT user_id FROM memberships WHERE organization_id = $1`,
            [profile.organizationId]
          );
          for (const m of members) {
            await this.notifRepo.save({
              userId: m.user_id,
              organizationId: profile.organizationId,
              type: NotificationType.SAM_OPPORTUNITY,
              title: 'New SAM.gov Opportunities',
              description: `${results.opportunitiesData.length} new opportunities match your NAICS code.`,
              actionUrl: '/sam-opportunities',
              actionLabel: 'View Opportunities',
            });
          }
        }
      } catch (e) {
        this.logger.warn(`SAM sync failed for org ${profile.organizationId}: ${e.message}`);
      }
    }
  }

  @Cron('0 2 * * 0')
  async recalculateWinScores() {
    this.logger.log('Running weekly win score recalculation');
    const activeProjects = await this.projectRepo.find({
      where: { deleted: false, archived: false },
      select: ['id', 'organizationId'],
    });
    for (const project of activeProjects) {
      await this.winScoreQueue.add('recalc', {
        projectId: project.id,
        organizationId: project.organizationId,
      }, { delay: Math.random() * 60000 });
    }
    this.logger.log(`Queued win score recalculation for ${activeProjects.length} projects`);
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupOldNotifications() {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
    const result = await this.notifRepo.delete({
      isArchived: true,
      createdAt: LessThan(thirtyDaysAgo) as any,
    });
    this.logger.log(`Cleaned up ${result.affected} archived notifications`);
  }

  @Cron('0 4 * * *')
  async cleanupOldAiLogs() {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000);
    const result = await this.logRepo.delete({ createdAt: LessThan(ninetyDaysAgo) as any });
    this.logger.log(`Cleaned up ${result.affected} old AI generation logs`);
  }

  @Cron('0 5 * * *')
  async cleanupWebhookDeliveries() {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
    const result = await this.deliveryRepo.delete({
      status: DeliveryStatus.FAILED,
      createdAt: LessThan(thirtyDaysAgo) as any,
    });
    this.logger.log(`Cleaned up ${result.affected} failed webhook deliveries`);
  }

  @Cron(CronExpression.EVERY_HOUR)
  async retryFailedWebhooks() {
    const now = new Date();
    const staleDeliveries = await this.deliveryRepo.find({
      where: {
        status: DeliveryStatus.FAILED,
        attemptCount: LessThan(3) as any,
        nextRetryAt: LessThan(now) as any,
      },
      take: 50,
    });

    for (const delivery of staleDeliveries) {
      const webhook = await this.deliveryRepo.manager.getRepository(Webhook).findOne({
        where: { id: delivery.webhookId, isActive: true },
      });
      if (!webhook) continue;
      await this.deliveryRepo.manager.getRepository(WebhookDelivery).update(
        delivery.id, { status: DeliveryStatus.PENDING }
      );
    }

    if (staleDeliveries.length > 0) {
      this.logger.log(`Retrying ${staleDeliveries.length} failed webhook deliveries`);
    }
  }

  @Cron('0 6 * * *')
  async dailyComplianceRescan() {
    const projects = await this.projectRepo.find({
      where: { deleted: false, archived: false },
      select: ['id', 'organizationId'],
    });

    for (const project of projects) {
      await this.complianceQueue.add(
        'scan-project',
        { projectId: project.id, organizationId: project.organizationId },
        { priority: 10, delay: Math.random() * 300000 },
      );
    }

    this.logger.log(`Scheduled daily compliance scan for ${projects.length} projects`);
  }
}
