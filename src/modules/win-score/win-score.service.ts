import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Project } from '../../entities/entities';
import { ComplianceRequirement } from '../../entities/entities';
import { ProjectOutline } from '../../entities/entities';
import { Document } from '../../entities/entities';
import { CacheService } from '../../common/cache/cache.service';
import { FeatureFlagsService } from '../../common/feature-flags/feature-flags.service';

export interface WinScoreFactors {
  technicalScore: number;
  complianceScore: number;
  pastPerformanceScore: number;
  teamScore: number;
  pricingScore: number;
  deadlineScore: number;
  documentScore: number;
}

@Injectable()
export class WinScoreService {
  private readonly logger = new Logger(WinScoreService.name);

  constructor(
    @InjectRepository(Project) private projectRepo: Repository<Project>,
    @InjectRepository(ComplianceRequirement) private reqRepo: Repository<ComplianceRequirement>,
    @InjectRepository(ProjectOutline) private outlineRepo: Repository<ProjectOutline>,
    @InjectRepository(Document) private documentRepo: Repository<Document>,
    @InjectQueue('win-score-recalc') private winScoreQueue: Queue,
    private cacheService: CacheService,
    private featureFlags: FeatureFlagsService,
  ) {}

  async calculateScore(projectId: string, organizationId: string): Promise<{
    score: number; factors: WinScoreFactors; breakdown: Record<string, any>;
  }> {
    const cacheKey = this.cacheService.generateKey('winscore', projectId);
    
    if (this.featureFlags.isEnabled('caching')) {
      const cached = await this.cacheService.get<any>(cacheKey);
      if (cached) return cached;
    }

    const [project, requirements, outlines, documents] = await Promise.all([
      this.projectRepo.findOne({ where: { id: projectId, organizationId } }),
      this.reqRepo.find({ where: { projectId } }),
      this.outlineRepo.find({ where: { projectId } }),
      this.documentRepo.find({ where: { projectId } }),
    ]);

    if (!project) throw new Error('Project not found');

    const completedSections = outlines.filter((o) => o.content && o.content.length > 100).length;
    const technicalScore = outlines.length > 0 ? Math.round((completedSections / outlines.length) * 100) : 0;

    const metRequirements = requirements.filter((r) => r.status === 'met').length;
    const complianceScore = requirements.length > 0 ? Math.round((metRequirements / requirements.length) * 100) : 50;

    const pastPerfDocs = documents.filter((d) => d.filename?.toLowerCase().includes('performance') || d.filename?.toLowerCase().includes('contract'));
    const pastPerformanceScore = Math.min(100, pastPerfDocs.length * 20 + (documents.length > 0 ? 20 : 0));

    const teamScore = project.winScoreFactors?.teamScore || 60;

    const pricingScore = project.contractValue ? 70 : 50;

    let deadlineScore = 75;
    if (project.dueDate) {
      const daysLeft = Math.ceil((new Date(project.dueDate).getTime() - Date.now()) / 86400000);
      if (daysLeft < 7) deadlineScore = 20;
      else if (daysLeft < 14) deadlineScore = 45;
      else if (daysLeft < 30) deadlineScore = 65;
      else deadlineScore = 90;
    }

    const indexedDocs = documents.filter((d) => d.status === 'indexed').length;
    const documentScore = Math.min(100, indexedDocs * 15 + (indexedDocs > 0 ? 25 : 0));

    const factors: WinScoreFactors = {
      technicalScore, complianceScore, pastPerformanceScore,
      teamScore, pricingScore, deadlineScore, documentScore,
    };

    const weights = {
      technicalScore: 0.25,
      complianceScore: 0.25,
      pastPerformanceScore: 0.15,
      teamScore: 0.15,
      pricingScore: 0.10,
      deadlineScore: 0.05,
      documentScore: 0.05,
    };

    const score = Math.round(
      Object.entries(factors).reduce((sum, [key, val]) => sum + val * (weights[key as keyof typeof weights] || 0), 0)
    );

    await this.projectRepo.update(projectId, { winProbability: score, winScoreFactors: factors as any });

    const result = {
      score,
      factors,
      breakdown: {
        technicalScore: { score: technicalScore, weight: 0.25, contribution: Math.round(technicalScore * 0.25) },
        complianceScore: { score: complianceScore, weight: 0.25, contribution: Math.round(complianceScore * 0.25) },
        pastPerformanceScore: { score: pastPerformanceScore, weight: 0.15, contribution: Math.round(pastPerformanceScore * 0.15) },
        teamScore: { score: teamScore, weight: 0.15, contribution: Math.round(teamScore * 0.15) },
        pricingScore: { score: pricingScore, weight: 0.10, contribution: Math.round(pricingScore * 0.10) },
        deadlineScore: { score: deadlineScore, weight: 0.05, contribution: Math.round(deadlineScore * 0.05) },
        documentScore: { score: documentScore, weight: 0.05, contribution: Math.round(documentScore * 0.05) },
        recommendation: this.getRecommendation(score, factors),
      },
    };

    if (this.featureFlags.isEnabled('caching')) {
      await this.cacheService.set(cacheKey, result, 600);
    }

    return result;
  }

  async triggerRecalculation(projectId: string, organizationId: string) {
    const job = await this.winScoreQueue.add('recalc', { projectId, organizationId }, { delay: 2000 });
    return { jobId: job.id };
  }

  private getRecommendation(score: number, factors: WinScoreFactors): string {
    const weakest = Object.entries(factors).sort((a, b) => a[1] - b[1])[0];
    const map: Record<string, string> = {
      complianceScore: 'Run compliance scanner and resolve missing requirements',
      technicalScore: 'Complete all outline sections with detailed technical content',
      pastPerformanceScore: 'Upload past performance references and contract documents',
      documentScore: 'Add more supporting documents to the evidence library',
      teamScore: 'Add team bios and capability statements',
      pricingScore: 'Include detailed price/cost volume section',
      deadlineScore: 'Prioritize completion — deadline is approaching',
    };
    return score < 50
      ? `Critical: ${map[weakest[0]] || 'Improve overall proposal quality'}`
      : score < 75
      ? `Good progress: Focus on ${map[weakest[0]] || 'completing remaining sections'}`
      : 'Strong proposal: Review and finalize all sections';
  }
}
