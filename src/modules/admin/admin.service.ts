import { Injectable, Logger, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Cache } from 'cache-manager';
import { Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import * as speakeasy from 'speakeasy';
import { encrypt, decrypt } from '../../common/utils/encryption';
import {
  Organization, User, Project, AiGenerationLog, PromoCode,
  AdminAuditLog, PlatformAnnouncement, FeatureFlagOverride,
  DunningEvent, GDPRRequest, ReferralTracking, CircuitBreakerState,
  CircuitState, GDPRRequestStatus, AdminRole,
} from '../../entities/entities';
import { S3Service } from '../tools/s3.service';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    @InjectRepository(Organization) private orgRepo: Repository<Organization>,
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Project) private projectRepo: Repository<Project>,
    @InjectRepository(AiGenerationLog) private logRepo: Repository<AiGenerationLog>,
    @InjectRepository(PromoCode) private promoRepo: Repository<PromoCode>,
    @InjectRepository(AdminAuditLog) private adminAuditRepo: Repository<AdminAuditLog>,
    @InjectRepository(PlatformAnnouncement) private announcementRepo: Repository<PlatformAnnouncement>,
    @InjectRepository(FeatureFlagOverride) private featureOverrideRepo: Repository<FeatureFlagOverride>,
    @InjectRepository(DunningEvent) private dunningRepo: Repository<DunningEvent>,
    @InjectRepository(GDPRRequest) private gdprRepo: Repository<GDPRRequest>,
    @InjectRepository(ReferralTracking) private referralRepo: Repository<ReferralTracking>,
    @InjectRepository(CircuitBreakerState) private circuitBreakerRepo: Repository<CircuitBreakerState>,
    private configService: ConfigService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private s3Service: S3Service,
  ) {}

  async auditAction(adminId: string, adminEmail: string, adminRole: string, action: string, resource: string, resourceId?: string, orgId?: string, targetUserId?: string, details?: Record<string, any>, reason?: string, ip?: string, ua?: string) {
    await this.adminAuditRepo.save({
      adminId, adminEmail, adminRole, action, resource, resourceId,
      organizationId: orgId, targetUserId, details, reason: reason || 'admin action',
      ipAddress: ip, userAgent: ua,
    });
  }

  async getPlatformStats() {
    const [totalOrgs, totalUsers, totalProjects, totalAiCalls] = await Promise.all([
      this.orgRepo.count(),
      this.userRepo.count(),
      this.projectRepo.count({ where: { deleted: false } }),
      this.logRepo.count(),
    ]);

    const revenue = await this.orgRepo.createQueryBuilder('o')
      .select("COUNT(CASE WHEN o.plan = 'pro' THEN 1 END)", 'pro')
      .addSelect("COUNT(CASE WHEN o.plan = 'starter' THEN 1 END)", 'starter')
      .addSelect("COUNT(CASE WHEN o.plan = 'enterprise' THEN 1 END)", 'enterprise')
      .addSelect("COUNT(CASE WHEN o.plan = 'free' THEN 1 END)", 'free')
      .getRawOne();

    const totalCost = await this.logRepo.createQueryBuilder('l')
      .select('SUM(l.cost)', 'total')
      .getRawOne();

    return {
      totalOrgs, totalUsers, totalProjects, totalAiCalls,
      planBreakdown: revenue,
      totalAiCost: parseFloat(totalCost?.total || '0'),
    };
  }

  async listOrganizations(page = 1, limit = 20, search?: string) {
    const qb = this.orgRepo.createQueryBuilder('o')
      .orderBy('o.createdAt', 'DESC')
      .skip((page - 1) * limit).take(limit);

    if (search) qb.where('o.name ILIKE :search OR o.billingEmail ILIKE :search', { search: `%${search}%` });

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit };
  }

  async getOrganization(id: string) {
    const org = await this.orgRepo.findOne({ where: { id } });
    if (!org) throw new NotFoundException('Org not found');
    const [projectCount, userCount] = await Promise.all([
      this.projectRepo.count({ where: { organizationId: id, deleted: false } }),
      this.orgRepo.manager.query(`SELECT COUNT(*) FROM memberships WHERE organization_id = $1`, [id]),
    ]);
    return { ...org, projectCount, userCount: parseInt(userCount[0]?.count || '0') };
  }

  async updateOrgPlan(orgId: string, plan: string, adminId: string) {
    await this.orgRepo.update(orgId, { plan });
    return this.getOrganization(orgId);
  }

  async suspendOrg(orgId: string, reason: string, adminId: string, adminEmail: string) {
    await this.orgRepo.update(orgId, { isSuspended: true, suspendedAt: new Date(), suspendedReason: reason, suspendedBy: adminId });
    await this.cacheManager.del(`org:${orgId}:*`);
    await this.auditAction(adminId, adminEmail, 'super_admin', 'suspend_org', 'organization', orgId, orgId, null, { reason }, reason);
    return { success: true };
  }

  async unsuspendOrg(orgId: string, adminId: string, adminEmail: string) {
    await this.orgRepo.update(orgId, { isSuspended: false, suspendedAt: null, suspendedReason: null });
    await this.auditAction(adminId, adminEmail, 'super_admin', 'unsuspend_org', 'organization', orgId, orgId);
    return { success: true };
  }

  async listUsers(page = 1, limit = 20, search?: string, filter?: string) {
    const qb = this.userRepo.createQueryBuilder('u')
      .orderBy('u.createdAt', 'DESC')
      .skip((page - 1) * limit).take(limit);

    if (search) qb.where('u.email ILIKE :search OR u.name ILIKE :search', { search: `%${search}%` });
    if (filter === 'banned') qb.andWhere('u.isBanned = true');
    if (filter === 'admin') qb.andWhere('u.isPlatformAdmin = true');

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit };
  }

  async getUser(userId: string) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async banUser(userId: string, reason: string, adminId: string, adminEmail: string, ip?: string, ua?: string) {
    await this.userRepo.update(userId, { isBanned: true, bannedAt: new Date(), bannedReason: reason, bannedBy: adminId });
    await this.cacheManager.del(`user:${userId}:*`);
    await this.cacheManager.del(`session:${userId}:*`);
    await this.auditAction(adminId, adminEmail, 'super_admin', 'ban_user', 'user', userId, null, userId, { reason }, reason, ip, ua);
    return { success: true };
  }

  async unbanUser(userId: string, adminId: string, adminEmail: string, ip?: string, ua?: string) {
    await this.userRepo.update(userId, { isBanned: false, bannedAt: null, bannedReason: null });
    await this.auditAction(adminId, adminEmail, 'super_admin', 'unban_user', 'user', userId, null, userId, {}, 'unban', ip, ua);
    return { success: true };
  }

  async setPlatformAdmin(userId: string, adminRole: AdminRole, adminId: string, adminEmail: string) {
    await this.userRepo.update(userId, { isPlatformAdmin: true, adminRole });
    await this.auditAction(adminId, adminEmail, 'super_admin', 'set_platform_admin', 'user', userId, null, userId, { role: adminRole }, 'promotion');
    return { success: true };
  }

  async clearCache(pattern: string, orgId?: string) {
    if (orgId) {
      const keys = ['winscore', 'analytics', 'billing', 'projects'];
      for (const key of keys) {
        await this.cacheManager.del(`${key}:${orgId}`);
        await this.cacheManager.del(`${key}:org:${orgId}`);
      }
      this.logger.log(`Cache cleared for org: ${orgId}`);
    } else {
      this.logger.warn(`FULL CACHE FLUSH initiated by admin`);
      await this.cacheManager.reset();
    }
    return { success: true };
  }

  async manageCircuitBreaker(serviceName: string, action: 'open' | 'close' | 'reset', adminId: string) {
    if (action === 'reset' || action === 'close') {
      await this.circuitBreakerRepo.update({ serviceName }, { state: CircuitState.CLOSED, failureCount: 0 });
    } else if (action === 'open') {
      await this.circuitBreakerRepo.update({ serviceName }, { state: CircuitState.OPEN, lastFailureTime: new Date() });
    }
    return { success: true };
  }

  async getCircuitBreakers() {
    return this.circuitBreakerRepo.find();
  }

  async createAnnouncement(data: Partial<PlatformAnnouncement>, createdBy: string) {
    return this.announcementRepo.save({ ...data, createdBy });
  }

  async setFeatureFlagOverride(flag: string, targetType: string, targetId: string, enabled: boolean, setBy: string, config?: any) {
    await this.featureOverrideRepo.upsert({ flag, targetType: targetType as any, targetId, enabled, setBy, config }, ['flag', 'targetType', 'targetId']);
    return { success: true };
  }

  async getGDPRRequests() {
    return this.gdprRepo.find({ order: { createdAt: 'DESC' } });
  }

  async processGDPRRequest(requestId: string, adminId: string, status: GDPRRequestStatus, notes?: string) {
    await this.gdprRepo.update(requestId, { status, processedBy: adminId, completedAt: new Date(), processingNotes: { notes } });
    if (status === GDPRRequestStatus.COMPLETED) {
      const request = await this.gdprRepo.findOne({ where: { id: requestId } });
      if (request && request.requestType === 'erasure') {
        await this.executeGDPRErasure(requestId, adminId);
      }
    }
    return { success: true };
  }

  async executeGDPRErasure(requestId: string, adminId: string): Promise<void> {
    const request = await this.gdprRepo.findOne({ where: { id: requestId } });
    if (!request) throw new NotFoundException('GDPR request not found');
    const { userId, organizationId } = request;

    await this.gdprRepo.manager.transaction(async (em) => {
      await em.update(User, userId, {
        email: `deleted-${userId}@anonymized.invalid`,
        name: 'Deleted User',
        firstName: null,
        lastName: null,
        avatarUrl: null,
        metadata: null,
        totpSecret: null,
      });

      const docs = await em.query(`SELECT s3_key FROM documents WHERE organization_id = $1`, [organizationId]);
      for (const doc of docs) {
        if (doc.s3_key) {
          await this.s3Service.deleteFile(doc.s3_key).catch(() => {});
        }
      }

      await em.query(`UPDATE audit_logs SET user_id = NULL, ip_address = 'anonymized' WHERE user_id = $1`, [userId]);

      await em.update(GDPRRequest, requestId, {
        status: GDPRRequestStatus.COMPLETED,
        completedAt: new Date(),
        processedBy: adminId,
      });
    });
  }

  async getReferralStats() {
    const total = await this.referralRepo.count();
    const converted = await this.referralRepo.count({ where: { converted: true } });
    const totalCredits = await this.referralRepo.createQueryBuilder('r').select('SUM(r.creditEarned)', 'total').getRawOne();
    return { totalReferrals: total, converted, totalCreditsEarned: parseInt(totalCredits?.total || '0') };
  }

  async listDunningEvents(page = 1, limit = 20) {
    const [items, total] = await this.dunningRepo.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total, page, limit };
  }

  async enable2FAForAdmin(userId: string): Promise<{ secret: string; otpauth_url: string }> {
    const secret = speakeasy.generateSecret({
      name: `RFPilot Admin (${userId})`,
      issuer: this.configService.get('ADMIN_TOTP_ISSUER', 'RFPilot'),
    });
    await this.userRepo.update(userId, { totpSecret: encrypt(secret.base32) });
    return { secret: secret.base32, otpauth_url: secret.otpauth_url };
  }

  async verifyAdmin2FA(userId: string, token: string): Promise<boolean> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user?.totpSecret) throw new ForbiddenException('2FA not configured');
    const decryptedSecret = decrypt(user.totpSecret);
    return speakeasy.totp.verify({
      secret: decryptedSecret,
      encoding: 'base32',
      token,
      window: 1,
    });
  }
}
