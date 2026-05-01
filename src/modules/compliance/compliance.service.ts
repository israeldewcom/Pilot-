import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ComplianceRequirement } from '../../entities/entities';
import { ComplianceCheck } from '../../entities/entities';
import { Project } from '../../entities/entities';
import { AiService } from '../ai/ai.service';
import { EvidenceService } from '../evidence/evidence.service';
import { PostHogService } from '../analytics/posthog.service';

@Injectable()
export class ComplianceService {
  private readonly logger = new Logger(ComplianceService.name);

  constructor(
    @InjectRepository(ComplianceRequirement) private reqRepo: Repository<ComplianceRequirement>,
    @InjectRepository(ComplianceCheck) private checkRepo: Repository<ComplianceCheck>,
    @InjectRepository(Project) private projectRepo: Repository<Project>,
    @InjectQueue('compliance-scanner') private complianceQueue: Queue,
    @InjectQueue('ai-auto-fix') private autoFixQueue: Queue,
    private aiService: AiService,
    private evidenceService: EvidenceService,
    private posthog: PostHogService,
  ) {}

  async triggerScan(projectId: string, organizationId: string) {
    const project = await this.projectRepo.findOne({ where: { id: projectId } });
    if (!project) throw new Error('Project not found');
    const job = await this.complianceQueue.add('scan-project', { projectId, organizationId }, { priority: 3 });
    return { jobId: job.id, message: 'Compliance scan queued' };
  }

  async extractRequirementsFromRfp(projectId: string, rfpText: string, userId: string) {
    const prompt = `Extract all compliance requirements from this RFP text. Return a JSON array of objects with:
{ requirementText, category (FAR|CMMC|FedRAMP|Custom), severity (critical|high|medium|low), sectionRef }

RFP Text:
${rfpText.substring(0, 6000)}

Return ONLY valid JSON array, no other text.`;

    const response = await this.aiService.coPilotChat(
      projectId,
      [{ role: 'user', content: prompt }],
      '',
      userId,
      'free', // use default org for feature
    );

    try {
      const jsonStr = response.reply.replace(/```json|```/g, '').trim();
      const requirements = JSON.parse(jsonStr);
      const saved = await this.reqRepo.save(
        requirements.map((r: any) => this.reqRepo.create({ ...r, projectId }))
      );
      return { extracted: saved.length, requirements: saved };
    } catch {
      return { extracted: 0, requirements: [], error: 'Could not parse AI response' };
    }
  }

  async getComplianceSummary(projectId: string) {
    const requirements = await this.reqRepo.find({ where: { projectId } });
    const met = requirements.filter((r) => r.status === 'met').length;
    const missing = requirements.filter((r) => r.status === 'missing').length;
    const needsReview = requirements.filter((r) => r.status === 'needs_review').length;
    const critical = requirements.filter((r) => r.severity === 'critical' && r.status !== 'met').length;
    const total = requirements.length;
    const score = total > 0 ? Math.round((met / total) * 100) : 0;
    return { total, met, missing, needsReview, critical, score, requirements };
  }

  async autoFixGap(requirementId: string, projectId: string, userId: string) {
    const req = await this.reqRepo.findOne({ where: { id: requirementId } });
    if (!req) throw new Error('Requirement not found');
    const job = await this.autoFixQueue.add('fix-gap', { requirementId, projectId, userId, requirementText: req.requirementText }, { priority: 2 });
    return { jobId: job.id };
  }

  async autoFixAll(projectId: string, userId: string) {
    const requirements = await this.reqRepo.find({ where: { projectId, status: 'missing' } });
    const jobIds = await Promise.all(
      requirements.map((req) =>
        this.autoFixQueue.add('fix-gap', { requirementId: req.id, projectId, userId, requirementText: req.requirementText })
          .then((j) => j.id)
      )
    );
    return { jobIds, count: jobIds.length };
  }

  async updateRequirementStatus(requirementId: string, status: string, evidence?: string) {
    await this.reqRepo.update(requirementId, { status, evidence, lastCheckedAt: new Date() });
    return this.reqRepo.findOne({ where: { id: requirementId } });
  }
}
