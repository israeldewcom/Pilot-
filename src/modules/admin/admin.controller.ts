import {
  Controller, Get, Post, Patch, Param, Body, Query, UseGuards, Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { AdminService } from './admin.service';
import { AdminGuard, AdminRoles } from './admin.guard';
import { AdminRole } from '../../entities/entities';
import { CurrentUser, RequestUser } from '../../common/decorators/decorators';

@ApiTags('Admin')
@Controller('api/admin')
@UseGuards(AdminGuard)
@ApiBearerAuth()
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('dashboard/stats')
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.READ_ONLY_ADMIN)
  @ApiOperation({ summary: 'Platform stats overview' })
  getStats() {
    return this.adminService.getPlatformStats();
  }

  @Get('users')
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.SUPPORT_ADMIN)
  listUsers(@Query('page') page = 1, @Query('limit') limit = 20, @Query('search') search?: string, @Query('filter') filter?: string) {
    return this.adminService.listUsers(page, limit, search, filter);
  }

  @Get('users/:id')
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.SUPPORT_ADMIN)
  getUser(@Param('id') id: string) {
    return this.adminService.getUser(id);
  }

  @Post('users/:id/ban')
  @AdminRoles(AdminRole.SUPER_ADMIN)
  banUser(@Param('id') userId: string, @Body() body: { reason: string }, @CurrentUser() admin: any, @Req() req: Request) {
    return this.adminService.banUser(userId, body.reason, admin.id, admin.email, req.ip, req.headers['user-agent']);
  }

  @Post('users/:id/unban')
  @AdminRoles(AdminRole.SUPER_ADMIN)
  unbanUser(@Param('id') userId: string, @CurrentUser() admin: any, @Req() req: Request) {
    return this.adminService.unbanUser(userId, admin.id, admin.email, req.ip, req.headers['user-agent']);
  }

  @Post('users/:id/make-admin')
  @AdminRoles(AdminRole.SUPER_ADMIN)
  makeAdmin(@Param('id') userId: string, @Body() body: { role: AdminRole }, @CurrentUser() admin: any) {
    return this.adminService.setPlatformAdmin(userId, body.role, admin.id, admin.email);
  }

  @Post('users/:id/enable-2fa')
  @AdminRoles(AdminRole.SUPER_ADMIN)
  enable2FA(@Param('id') userId: string) {
    return this.adminService.enable2FAForAdmin(userId);
  }

  @Get('orgs')
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.BILLING_ADMIN, AdminRole.READ_ONLY_ADMIN)
  listOrgs(@Query('page') page = 1, @Query('limit') limit = 20, @Query('search') search?: string) {
    return this.adminService.listOrganizations(page, limit, search);
  }

  @Get('orgs/:id')
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.BILLING_ADMIN)
  getOrg(@Param('id') id: string) {
    return this.adminService.getOrganization(id);
  }

  @Patch('orgs/:id/plan')
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.BILLING_ADMIN)
  updatePlan(@Param('id') orgId: string, @Body() body: { plan: string }, @CurrentUser() admin: any) {
    return this.adminService.updateOrgPlan(orgId, body.plan, admin.id);
  }

  @Post('orgs/:id/suspend')
  @AdminRoles(AdminRole.SUPER_ADMIN)
  suspendOrg(@Param('id') orgId: string, @Body() body: { reason: string }, @CurrentUser() admin: any) {
    return this.adminService.suspendOrg(orgId, body.reason, admin.id, admin.email);
  }

  @Post('orgs/:id/unsuspend')
  @AdminRoles(AdminRole.SUPER_ADMIN)
  unsuspendOrg(@Param('id') orgId: string, @CurrentUser() admin: any) {
    return this.adminService.unsuspendOrg(orgId, admin.id, admin.email);
  }

  @Post('cache/flush')
  @AdminRoles(AdminRole.SUPER_ADMIN)
  flushCache(@Body() body: { pattern?: string; orgId?: string }) {
    return this.adminService.clearCache(body.pattern || '*', body.orgId);
  }

  @Get('circuit-breakers')
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.READ_ONLY_ADMIN)
  getCircuitBreakers() {
    return this.adminService.getCircuitBreakers();
  }

  @Post('circuit-breakers/:name')
  @AdminRoles(AdminRole.SUPER_ADMIN)
  manageCircuitBreaker(@Param('name') name: string, @Body() body: { action: 'open' | 'close' | 'reset' }, @CurrentUser() admin: any) {
    return this.adminService.manageCircuitBreaker(name, body.action, admin.id);
  }

  @Post('announcements')
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.SUPPORT_ADMIN)
  createAnnouncement(@Body() body: any, @CurrentUser() admin: any) {
    return this.adminService.createAnnouncement({ ...body, createdBy: admin.email }, admin.id);
  }

  @Post('feature-flags')
  @AdminRoles(AdminRole.SUPER_ADMIN)
  setFeatureFlagOverride(@Body() body: { flag: string; targetType: string; targetId: string; enabled: boolean; config?: any }, @CurrentUser() admin: any) {
    return this.adminService.setFeatureFlagOverride(body.flag, body.targetType, body.targetId, body.enabled, admin.id, body.config);
  }

  @Get('gdpr')
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.SUPPORT_ADMIN)
  getGDPRRequests() {
    return this.adminService.getGDPRRequests();
  }

  @Post('gdpr/:id/process')
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.SUPPORT_ADMIN)
  processGDPR(@Param('id') id: string, @Body() body: { status: string; notes?: string }, @CurrentUser() admin: any) {
    return this.adminService.processGDPRRequest(id, admin.id, body.status as any, body.notes);
  }

  @Get('referrals')
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.READ_ONLY_ADMIN)
  getReferrals() {
    return this.adminService.getReferralStats();
  }

  @Get('dunning')
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.BILLING_ADMIN)
  getDunning(@Query('page') page = 1, @Query('limit') limit = 20) {
    return this.adminService.listDunningEvents(page, limit);
  }
}
