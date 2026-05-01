import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { Organization } from '../../entities/entities';
import { PromoCode, DiscountType } from '../../entities/entities';
import { PromoUsage } from '../../entities/entities';
import { AiGenerationLog } from '../../entities/entities';
import { Document } from '../../entities/entities';
import { startOfMonth } from '../../common/utils/utils';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private stripe: Stripe;

  constructor(
    private configService: ConfigService,
    @InjectRepository(Organization) private orgRepo: Repository<Organization>,
    @InjectRepository(PromoCode) private promoRepo: Repository<PromoCode>,
    @InjectRepository(PromoUsage) private promoUsageRepo: Repository<PromoUsage>,
    @InjectRepository(AiGenerationLog) private logRepo: Repository<AiGenerationLog>,
    @InjectRepository(Document) private documentRepo: Repository<Document>,
  ) {
    this.stripe = new Stripe(this.configService.get('STRIPE_SECRET_KEY') || '', { apiVersion: '2024-06-20' });
  }

  async getOrCreateCustomer(organizationId: string, email: string, name: string): Promise<string> {
    const org = await this.orgRepo.findOne({ where: { id: organizationId } });
    if (org?.stripeCustomerId) return org.stripeCustomerId;

    const customer = await this.stripe.customers.create({ email, name, metadata: { organizationId } });
    await this.orgRepo.update(organizationId, { stripeCustomerId: customer.id, billingEmail: email });
    return customer.id;
  }

  async createCheckoutSession(
    organizationId: string,
    plan: string,
    email: string,
    name: string,
    successUrl: string,
    cancelUrl: string,
  ) {
    const priceIds = JSON.parse(this.configService.get('STRIPE_PRICE_IDS') || '{}');
    const priceId = priceIds[plan];
    if (!priceId) throw new BadRequestException(`Invalid plan: ${plan}`);

    const customerId = await this.getOrCreateCustomer(organizationId, email, name);

    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: 14,
        metadata: { organizationId, plan },
      },
      metadata: { organizationId, plan },
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: organizationId,
      allow_promotion_codes: true,
    });

    return { checkoutUrl: session.url, sessionId: session.id };
  }

  async createPortalSession(organizationId: string, returnUrl: string) {
    const org = await this.orgRepo.findOne({ where: { id: organizationId } });
    if (!org?.stripeCustomerId) throw new BadRequestException('No billing account found');

    const session = await this.stripe.billingPortal.sessions.create({
      customer: org.stripeCustomerId,
      return_url: returnUrl,
    });

    return { url: session.url };
  }

  async cancelSubscription(organizationId: string): Promise<void> {
    const org = await this.orgRepo.findOne({ where: { id: organizationId } });
    if (!org?.stripeSubscriptionId) throw new NotFoundException('No active subscription');

    await this.stripe.subscriptions.update(org.stripeSubscriptionId, { cancel_at_period_end: true });
    await this.orgRepo.update(organizationId, { subscriptionStatus: 'cancelling' });
  }

  async applyPromoCode(code: string, organizationId: string, plan: string): Promise<{ discount: number; type: string; message: string }> {
    const promo = await this.promoRepo.findOne({
      where: { code: code.toUpperCase(), isActive: true },
    });

    if (!promo) throw new BadRequestException('Invalid promo code');
    if (promo.expiresAt && new Date(promo.expiresAt) < new Date()) throw new BadRequestException('Promo code expired');
    if (promo.currentRedemptions >= promo.maxRedemptions) throw new BadRequestException('Promo code limit reached');
    if (promo.applicablePlans?.length && !promo.applicablePlans.includes(plan)) {
      throw new BadRequestException(`Code not valid for ${plan} plan`);
    }

    const existing = await this.promoUsageRepo.findOne({ where: { promoCodeId: promo.id, organizationId } });
    if (existing) throw new BadRequestException('Already used this promo code');

    let stripeDiscount: any = {};
    if (promo.discountType === DiscountType.PERCENTAGE) {
      const coupon = await this.stripe.coupons.create({ percent_off: promo.discountValue, duration: 'once' });
      stripeDiscount = { couponId: coupon.id };
    } else if (promo.discountType === DiscountType.FIXED) {
      const coupon = await this.stripe.coupons.create({ amount_off: promo.discountValue * 100, currency: 'usd', duration: 'once' });
      stripeDiscount = { couponId: coupon.id };
    }

    await this.promoUsageRepo.save({ promoCodeId: promo.id, organizationId });
    await this.promoRepo.increment({ id: promo.id }, 'currentRedemptions', 1);

    return {
      discount: promo.discountValue,
      type: promo.discountType,
      message: promo.discountType === DiscountType.PERCENTAGE
        ? `${promo.discountValue}% discount applied!`
        : `$${promo.discountValue} off applied!`,
      ...stripeDiscount,
    };
  }

  async activateSubscription(data: {
    organizationId: string;
    stripeCustomerId: string;
    stripeSubscriptionId: string;
    plan: string;
    trialEnd?: number;
    periodEnd?: number;
  }) {
    await this.orgRepo.update(data.organizationId, {
      plan: data.plan,
      stripeCustomerId: data.stripeCustomerId,
      stripeSubscriptionId: data.stripeSubscriptionId,
      subscriptionStatus: 'active',
      trialEndsAt: data.trialEnd ? new Date(data.trialEnd * 1000) : null,
      subscriptionEndsAt: data.periodEnd ? new Date(data.periodEnd * 1000) : null,
    });
  }

  async handleSubscriptionUpdate(subscription: Stripe.Subscription) {
    const organizationId = subscription.metadata?.organizationId;
    if (!organizationId) return;

    await this.orgRepo.update(organizationId, {
      subscriptionStatus: subscription.status,
      subscriptionEndsAt: subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000)
        : null,
    });
  }

  async handleSubscriptionCanceled(subscription: Stripe.Subscription) {
    const organizationId = subscription.metadata?.organizationId;
    if (!organizationId) return;
    await this.orgRepo.update(organizationId, { plan: 'free', subscriptionStatus: 'canceled', stripeSubscriptionId: null });
  }

  async incrementPaymentFailure(organizationId: string): Promise<number> {
    const org = await this.orgRepo.findOne({ where: { id: organizationId } });
    const failCount = ((org?.metadata as any)?.paymentFailures || 0) + 1;
    await this.orgRepo.update(organizationId, { metadata: { ...(org?.metadata || {}), paymentFailures: failCount } });
    return failCount;
  }

  async downgradeToFree(organizationId: string) {
    await this.orgRepo.update(organizationId, { plan: 'free', subscriptionStatus: 'canceled' });
  }

  async getInvoices(organizationId: string) {
    const org = await this.orgRepo.findOne({ where: { id: organizationId } });
    if (!org?.stripeCustomerId) return [];

    const invoices = await this.stripe.invoices.list({ customer: org.stripeCustomerId, limit: 24 });
    return invoices.data.map((inv) => ({
      id: inv.id,
      period: new Date((inv.period_start || 0) * 1000).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      amount: ((inv.amount_paid || 0) / 100).toFixed(2),
      status: inv.status,
      pdfUrl: inv.invoice_pdf,
      paidAt: inv.status === 'paid' && inv.status_transitions?.paid_at
        ? new Date(inv.status_transitions.paid_at * 1000)
        : null,
    }));
  }

  async getCurrentPlan(organizationId: string) {
    const org = await this.orgRepo.findOne({ where: { id: organizationId } });
    return {
      plan: org?.plan || 'free',
      status: org?.subscriptionStatus || 'none',
      trialEndsAt: org?.trialEndsAt,
      subscriptionEndsAt: org?.subscriptionEndsAt,
    };
  }

  async getRealUsageMetrics(organizationId: string) {
    const since = startOfMonth();
    const [tokensUsed, storageResult] = await Promise.all([
      this.logRepo.createQueryBuilder('l')
        .select('SUM(l.totalTokens)', 'total')
        .where('l.organizationId = :organizationId', { organizationId })
        .andWhere('l.createdAt > :since', { since })
        .getRawOne(),
      this.documentRepo.createQueryBuilder('d')
        .select('SUM(d.sizeBytes)', 'total')
        .where('d.organizationId = :organizationId', { organizationId })
        .getRawOne(),
    ]);

    return {
      tokensUsed: parseInt(tokensUsed?.total || '0'),
      storageUsedGB: parseFloat(((parseFloat(storageResult?.total || '0')) / 1073741824).toFixed(2)),
    };
  }

  async processMonthlyOverage(organizationId: string): Promise<void> {
    const org = await this.orgRepo.findOne({ where: { id: organizationId } });
    if (!org || !org.stripeCustomerId) return;

    const overage = org.aiTokensUsed - org.aiTokensLimit;
    if (overage > 0) {
      const overageCost = overage * 0.000002; // $2 per 1M tokens
      await this.stripe.invoiceItems.create({
        customer: org.stripeCustomerId,
        amount: Math.round(overageCost * 100),
        currency: 'usd',
        description: `AI token overage: ${overage.toLocaleString()} tokens`,
      });
    }
  }
}
