import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { BillingService } from './billing.service';
import { AuthGuard, RolesGuard } from '../../common/guards/guards';
import { CurrentUser, RequestUser } from '../../common/decorators/decorators';

@ApiTags('Billing')
@Controller('api/billing')
@UseGuards(AuthGuard, RolesGuard)
@ApiBearerAuth()
export class BillingController {
  constructor(private billingService: BillingService) {}

  @Get('plan')
  @ApiOperation({ summary: 'Get current plan and status' })
  getPlan(@CurrentUser() user: RequestUser) {
    return this.billingService.getCurrentPlan(user.organizationId);
  }

  @Get('invoices')
  @ApiOperation({ summary: 'Get invoice history' })
  getInvoices(@CurrentUser() user: RequestUser) {
    return this.billingService.getInvoices(user.organizationId);
  }

  @Get('usage')
  @ApiOperation({ summary: 'Get current billing period usage' })
  getUsage(@CurrentUser() user: RequestUser) {
    return this.billingService.getRealUsageMetrics(user.organizationId);
  }

  @Post('create-checkout')
  @ApiOperation({ summary: 'Create Stripe checkout session' })
  createCheckout(
    @CurrentUser() user: RequestUser,
    @Body() body: { plan: string; successUrl: string; cancelUrl: string },
  ) {
    return this.billingService.createCheckoutSession(
      user.organizationId, body.plan, user.email, user.id,
      body.successUrl, body.cancelUrl,
    );
  }

  @Post('portal')
  @ApiOperation({ summary: 'Create Stripe billing portal session' })
  createPortal(
    @CurrentUser() user: RequestUser,
    @Body() body: { returnUrl: string },
  ) {
    return this.billingService.createPortalSession(user.organizationId, body.returnUrl);
  }

  @Post('cancel')
  @ApiOperation({ summary: 'Cancel subscription at period end' })
  cancelSubscription(@CurrentUser() user: RequestUser) {
    return this.billingService.cancelSubscription(user.organizationId);
  }

  @Post('apply-promo')
  @ApiOperation({ summary: 'Apply a promo code' })
  applyPromo(
    @CurrentUser() user: RequestUser,
    @Body() body: { code: string; plan: string },
  ) {
    return this.billingService.applyPromoCode(body.code, user.organizationId, body.plan);
  }
}
