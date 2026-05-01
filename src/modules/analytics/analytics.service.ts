import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Project, ProjectStatus } from '../../entities/entities';
import { AiGenerationLog } from '../../entities/entities';
import { ComplianceRequirement } from '../../entities/entities';
import { Document } from '../../entities/entities';
import { startOfMonth, endOfMonth } from '../../common/utils/utils';
import { CacheService } from '../../common/cache/cache.service';
import { FeatureFlagsService } from '../../common/feature-flags/feature-flags.service';

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(Project) private projectRepo: Repository<Project>,
    @InjectRepository(AiGenerationLog) private logRepo: Repository<AiGenerationLog>,
    @InjectRepository(ComplianceRequirement) private reqRepo: Repository<ComplianceRequirement>,
    @InjectRepository(Document) private documentRepo: Repository<Document>,
    private cacheService: CacheService,
    private featureFlags: FeatureFlagsService,
  ) {}

  async getDashboardAnalytics(organizationId: string, days = 90) {
    const cacheKey = this.cacheService.generateKey('dashboard', organizationId, String(days));
    
    if (this.featureFlags.isEnabled('caching')) {
      const cached = await this.cacheService.get<any>(cacheKey);
      if (cached) return cached;
    }

    const since = new Date(Date.now() - days * 86400000);

    const [projects, aiUsage, complianceStats, documents, winRateByMonth] = await Promise.all([
      this.getProjectStats(organizationId, since),
      this.getAiUsageStats(organizationId, since),
      this.getComplianceStats(organizationId),
      this.getDocumentStats(organizationId),
      this.getWinRateByMonth(organizationId),
    ]);

    const result = { projects, aiUsage, complianceStats, documents, winRateByMonth };

    if (this.featureFlags.isEnabled('caching')) {
      await this.cacheService.set(cacheKey, result, 900);
    }

    return result;
  }

  private async getProjectStats(organizationId: string, since: Date) {
    const [total, active, won, lost, draft, review] = await Promise.all([
      this.projectRepo.count({ where: { organizationId, deleted: false } }),
      this.projectRepo.count({ where: { organizationId, status: ProjectStatus.IN_PROGRESS, deleted: false } }),
      this.projectRepo.count({ where: { organizationId, status: ProjectStatus.WON, deleted: false } }),
      this.projectRepo.count({ where: { organizationId, status: ProjectStatus.LOST, deleted: false } }),
      this.projectRepo.count({ where: { organizationId, status: ProjectStatus.DRAFT, deleted: false } }),
      this.projectRepo.count({ where: { organizationId, status: ProjectStatus.REVIEW, deleted: false } }),
    ]);

    const winRate = (won + lost) > 0 ? Math.round((won / (won + lost)) * 100) : 0;

    const pipelineValue = await this.projectRepo.createQueryBuilder('p')
      .select('SUM(p.contractValue)', 'total')
      .where('p.organizationId = :organizationId', { organizationId })
      .andWhere('p.deleted = false')
      .getRawOne();

    const avgWinProbability = await this.projectRepo.createQueryBuilder('p')
      .select('AVG(p.winProbability)', 'avg')
      .where('p.organizationId = :organizationId', { organizationId })
      .andWhere('p.deleted = false')
      .andWhere('p.winProbability IS NOT NULL')
      .getRawOne();

    return {
      total, active, won, lost, draft, review, winRate,
      pipelineValue: parseFloat(pipelineValue?.total || '0'),
      avgWinProbability: Math.round(parseFloat(avgWinProbability?.avg || '0')),
    };
  }

  private async getAiUsageStats(organizationId: string, since: Date) {
    const byDay = await this.logRepo.createQueryBuilder('l')
      .select("DATE_TRUNC('day', l.createdAt)", 'day')
      .addSelect('SUM(l.totalTokens)', 'tokens')
      .addSelect('SUM(l.cost)', 'cost')
      .addSelect('COUNT(*)', 'requests')
      .where('l.organizationId = :organizationId', { organizationId })
      .andWhere('l.createdAt > :since', { since })
      .groupBy("DATE_TRUNC('day', l.createdAt)")
      .orderBy("DATE_TRUNC('day', l.createdAt)", 'ASC')
      .getRawMany();

    const totals = await this.logRepo.createQueryBuilder('l')
      .select('SUM(l.totalTokens)', 'totalTokens')
      .addSelect('SUM(l.cost)', 'totalCost')
      .addSelect('COUNT(*)', 'totalRequests')
      .where('l.organizationId = :organizationId', { organizationId })
      .andWhere('l.createdAt > :since', { since })
      .getRawOne();

    return {
      byDay: byDay.map((d) => ({
        date: d.day,
        tokens: parseInt(d.tokens || '0'),
        cost: parseFloat(d.cost || '0'),
        requests: parseInt(d.requests || '0'),
      })),
      totalTokens: parseInt(totals?.totalTokens || '0'),
      totalCost: parseFloat(totals?.totalCost || '0'),
      totalRequests: parseInt(totals?.totalRequests || '0'),
    };
  }

  private async getComplianceStats(organizationId: string) {
    const stats = await this.reqRepo.createQueryBuilder('r')
      .innerJoin('projects', 'p', 'p.id = r.projectId AND p.organizationId = :organizationId', { organizationId })
      .select('r.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('r.status')
      .getRawMany();

    return stats.reduce((acc, s) => {
      acc[s.status] = parseInt(s.count);
      return acc;
    }, { met: 0, missing: 0, needs_review: 0 });
  }

  private async getDocumentStats(organizationId: string) {
    const stats = await this.documentRepo.createQueryBuilder('d')
      .select('d.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .addSelect('SUM(d.sizeBytes)', 'totalSize')
      .where('d.organizationId = :organizationId', { organizationId })
      .groupBy('d.status')
      .getRawMany();

    return {
      byStatus: stats,
      total: stats.reduce((s, r) => s + parseInt(r.count), 0),
      totalSizeGB: stats.reduce((s, r) => s + parseFloat(r.totalSize || '0'), 0) / 1073741824,
    };
  }

  private async getWinRateByMonth(organizationId: string) {
    const results = await this.projectRepo.createQueryBuilder('p')
      .select("DATE_TRUNC('month', p.updatedAt)", 'month')
      .addSelect("SUM(CASE WHEN p.status = 'won' THEN 1 ELSE 0 END)", 'won')
      .addSelect("SUM(CASE WHEN p.status = 'lost' THEN 1 ELSE 0 END)", 'lost')
      .where('p.organizationId = :organizationId', { organizationId })
      .andWhere('p.status IN (:...statuses)', { statuses: [ProjectStatus.WON, ProjectStatus.LOST] })
      .groupBy("DATE_TRUNC('month', p.updatedAt)")
      .orderBy("DATE_TRUNC('month', p.updatedAt)", 'ASC')
      .limit(12)
      .getRawMany();

    return results.map((r) => {
      const won = parseInt(r.won || '0');
      const lost = parseInt(r.lost || '0');
      return {
        month: r.month,
        won, lost,
        winRate: (won + lost) > 0 ? Math.round((won / (won + lost)) * 100) : 0,
      };
    });
  }

  async getUsageMetrics(organizationId: string) {
    const since = startOfMonth();
    const [tokensUsed, storageResult, teamMembers] = await Promise.all([
      this.logRepo.createQueryBuilder('l')
        .select('SUM(l.totalTokens)', 'total')
        .where('l.organizationId = :organizationId', { organizationId })
        .andWhere('l.createdAt > :since', { since })
        .getRawOne(),
      this.documentRepo.createQueryBuilder('d')
        .select('SUM(d.sizeBytes)', 'total')
        .where('d.organizationId = :organizationId', { organizationId })
        .getRawOne(),
      this.projectRepo.manager.query(
        `SELECT COUNT(*) FROM memberships WHERE organization_id = $1`, [organizationId]
      ),
    ]);

    return {
      tokensUsed: parseInt(tokensUsed?.total || '0'),
      tokensLimit: 5000000,
      storageUsedGB: parseFloat(((parseFloat(storageResult?.total || '0')) / 1073741824).toFixed(2)),
      storageLimitGB: 100,
      teamMembers: parseInt(teamMembers[0]?.count || '1'),
      teamMembersLimit: 10,
    };
  }
}
