import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Organization, Notification, NotificationType } from '../../entities/entities';
import { EmailService } from '../../modules/email/email.service';
import { BillingService } from '../../modules/billing/billing.service';
import { FeatureFlagsService } from '../../common/feature-flags/feature-flags.service';

@Injectable()
export class GrowthHacksService {
  private readonly logger = new Logger(GrowthHacksService.name);

  constructor(
    @InjectRepository(Organization) private orgRepo: Repository<Organization>,
    @InjectRepository(Notification) private notifRepo: Repository<Notification>,
    private emailService: EmailService,
    private billingService: BillingService,
    private featureFlags: FeatureFlagsService,
  ) {}

  @Cron('0 9 * * *')
  async runGrowthChecks() {
    if (!this.featureFlags.isEnabled('auto_upsell')) return;

    const orgs = await this.orgRepo.find({ where: { isActive: true } });
    for (const org of orgs) {
      await this.checkTrialExpiry(org);
      await this.checkUsageLimits(org);
    }
  }

  private async checkTrialExpiry(org: Organization) {
    if (org.plan === 'free' && org.trialEndsAt) {
      const daysLeft = Math.ceil((new Date(org.trialEndsAt).getTime() - Date.now()) / 86400000);
      if (daysLeft === 7 || daysLeft === 3 || daysLeft === 1) {
        const members = await this.orgRepo.manager.query(
          `SELECT user_id FROM memberships WHERE organization_id = $1`, [org.id]
        );
        for (const m of members) {
          await this.notifRepo.save({
            userId: m.user_id,
            organizationId: org.id,
            type: NotificationType.TRIAL_EXPIRING,
            title: `Trial ends in ${daysLeft} day(s)`,
            description: 'Upgrade to keep full access.',
            actionUrl: '/billing/upgrade',
          });
        }
        if (org.billingEmail) {
          await this.emailService.sendTrialExpiring(org.billingEmail, 'User', {
            plan: org.plan,
            daysLeft,
          });
        }
      }
    }
  }

  private async checkUsageLimits(org: Organization) {
    const usage = await this.billingService.getRealUsageMetrics(org.id);
    const tokenLimit = 5_000_000;
    const storageLimitGB = 100;
    if (usage.tokensUsed > tokenLimit * 0.8 || usage.storageUsedGB > storageLimitGB * 0.8) {
      const members = await this.orgRepo.manager.query(
        `SELECT user_id FROM memberships WHERE organization_id = $1`, [org.id]
      );
      for (const m of members) {
        await this.notifRepo.save({
          userId: m.user_id,
          organizationId: org.id,
          type: NotificationType.USAGE_LIMIT,
          title: 'Approaching usage limit',
          description: `You've used ${((usage.tokensUsed / tokenLimit) * 100).toFixed(0)}% of your AI tokens. Upgrade for more.`,
          actionUrl: '/billing/upgrade',
        });
      }
    }
  }
}
