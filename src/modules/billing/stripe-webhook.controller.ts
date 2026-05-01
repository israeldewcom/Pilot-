import {
  Controller, Post, Req, Headers, Res, RawBodyRequest, Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import Redis from 'ioredis';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { BillingService } from './billing.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PostHogService } from '../analytics/posthog.service';
import { Public } from '../../common/decorators/decorators';
import { NotificationType } from '../../entities/entities';

@ApiTags('Stripe Webhooks')
@Controller('api/billing')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);
  private stripe: Stripe;

  constructor(
    private configService: ConfigService,
    private billingService: BillingService,
    private notificationsService: NotificationsService,
    private posthog: PostHogService,
    @InjectRedis() private redis: Redis,
  ) {
    this.stripe = new Stripe(this.configService.get('STRIPE_SECRET_KEY') || '', { apiVersion: '2024-06-20' });
  }

  @Public()
  @Post('webhook')
  @ApiOperation({ summary: 'Stripe webhook receiver' })
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
    @Res() res: Response,
  ) {
    let event: Stripe.Event;

    try {
      event = this.stripe.webhooks.constructEvent(
        req.rawBody || '',
        signature,
        this.configService.get('STRIPE_WEBHOOK_SECRET') || '',
      );
    } catch (err) {
      this.logger.warn(`Webhook signature verification failed: ${err.message}`);
      return res.status(400).json({ error: 'Invalid signature' });
    }

    // Idempotency check
    const eventKey = `stripe:event:${event.id}`;
    const alreadyProcessed = await this.redis.get(eventKey);
    if (alreadyProcessed) {
      this.logger.warn(`Duplicate Stripe event skipped: ${event.id}`);
      return res.status(200).json({ received: true, duplicate: true });
    }

    res.status(200).json({ received: true });

    try {
      await this.processEvent(event);
      await this.redis.setex(eventKey, 86400, '1'); // 24hr TTL
    } catch (err) {
      this.logger.error(`Webhook processing error for ${event.type}: ${err.message}`);
    }
  }

  private async processEvent(event: Stripe.Event) {
    this.logger.log(`Processing Stripe event: ${event.type}`);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.CheckoutSession;
        const organizationId = session.metadata?.organizationId;
        const plan = session.metadata?.plan;
        if (!organizationId || !plan) return;

        const subscription = await this.stripe.subscriptions.retrieve(session.subscription as string);
        await this.billingService.activateSubscription({
          organizationId,
          stripeCustomerId: session.customer as string,
          stripeSubscriptionId: session.subscription as string,
          plan,
          trialEnd: subscription.trial_end || undefined,
          periodEnd: subscription.current_period_end,
        });

        this.posthog.track(organizationId, 'subscription.started', {
          plan,
          amount: ((session.amount_total || 0) / 100).toFixed(2),
        });

        await this.notificationsService.createSystemNotification(
          organizationId,
          NotificationType.PAYMENT_PROCESSED,
          'Subscription Activated 🎉',
          `Your ${plan} plan is now active. Welcome to RFPilot!`,
        );
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        await this.billingService.handleSubscriptionUpdate(subscription);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const orgId = subscription.metadata?.organizationId;
        await this.billingService.handleSubscriptionCanceled(subscription);
        if (orgId) {
          this.posthog.track(orgId, 'subscription.cancelled', {});
          await this.notificationsService.createSystemNotification(
            orgId,
            NotificationType.PAYMENT_FAILED,
            'Subscription Ended',
            'Your subscription has ended. You have been moved to the free plan.',
          );
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customer = await this.stripe.customers.retrieve(invoice.customer as string) as Stripe.Customer;
        const organizationId = customer.metadata?.organizationId;
        if (!organizationId) return;

        const failCount = await this.billingService.incrementPaymentFailure(organizationId);
        if (failCount >= 3) {
          await this.billingService.downgradeToFree(organizationId);
        }

        await this.notificationsService.createSystemNotification(
          organizationId,
          NotificationType.PAYMENT_FAILED,
          'Payment Failed',
          `Payment attempt ${failCount}/3 failed. Please update your billing information.`,
        );
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        const customer = await this.stripe.customers.retrieve(invoice.customer as string) as Stripe.Customer;
        const organizationId = customer.metadata?.organizationId;
        if (!organizationId) return;

        await this.notificationsService.createSystemNotification(
          organizationId,
          NotificationType.PAYMENT_PROCESSED,
          'Payment Received',
          `Invoice for $${((invoice.amount_paid || 0) / 100).toFixed(2)} has been paid.`,
        );
        break;
      }

      default:
        this.logger.debug(`Unhandled Stripe event: ${event.type}`);
    }
  }
}
