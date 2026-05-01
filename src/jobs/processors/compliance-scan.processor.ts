import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ComplianceRequirement } from '../../entities/entities';
import { ProjectOutline } from '../../entities/entities';
import { Project } from '../../entities/entities';
import { Notification, NotificationType } from '../../entities/entities';
import { AiService } from '../../modules/ai/ai.service';
import { EvidenceService } from '../../modules/evidence/evidence.service';

@Processor('compliance-scanner', { concurrency: 2 })
export class ComplianceScanProcessor extends WorkerHost {
  private readonly logger = new Logger(ComplianceScanProcessor.name);

  constructor(
    @InjectRepository(ComplianceRequirement) private reqRepo: Repository<ComplianceRequirement>,
    @InjectRepository(ProjectOutline) private outlineRepo: Repository<ProjectOutline>,
    @InjectRepository(Project) private projectRepo: Repository<Project>,
    @InjectRepository(Notification) private notifRepo: Repository<Notification>,
    private aiService: AiService,
    private evidenceService: EvidenceService,
  ) {
    super();
  }

  async process(job: Job<{ projectId: string; organizationId: string }>) {
    const { projectId, organizationId } = job.data;
    this.logger.log(`Starting compliance scan for project: ${projectId}`);
    await job.updateProgress(5);

    const [requirements, outlines, project] = await Promise.all([
      this.reqRepo.find({ where: { projectId } }),
      this.outlineRepo.find({ where: { projectId } }),
      this.projectRepo.findOne({ where: { id: projectId } }),
    ]);

    if (!requirements.length) {
      if (project?.rfpText) {
        await this.autoExtractRequirements(projectId, project.rfpText);
        return;
      }
      this.logger.warn(`No requirements found for project ${projectId}`);
      return;
    }

    const proposalContent = outlines.map((o) => `${o.title}:\n${o.content || o.aiDraft || ''}`).join('\n\n');
    await job.updateProgress(20);

    const batchSize = 5;
    let processed = 0;
    const criticalMissing: string[] = [];

    for (let i = 0; i < requirements.length; i += batchSize) {
      const batch = requirements.slice(i, i + batchSize);

      await Promise.all(batch.map(async (req) => {
        const isAddressed = await this.checkRequirementAddressed(req.requirementText, proposalContent);
        const newStatus = isAddressed ? 'met' : 'missing';

        await this.reqRepo.update(req.id, {
          status: newStatus,
          lastCheckedAt: new Date(),
        });

        if (!isAddressed && req.severity === 'critical') {
          criticalMissing.push(req.requirementText.substring(0, 100));
        }
      }));

      processed += batch.length;
      await job.updateProgress(20 + Math.round((processed / requirements.length) * 75));
    }

    await job.updateProgress(100);

    if (criticalMissing.length > 0 && project?.ownerId) {
      await this.notifRepo.save({
        userId: project.ownerId,
        organizationId,
        type: NotificationType.COMPLIANCE_ALERT,
        title: `${criticalMissing.length} Critical Compliance Gaps Found`,
        description: `Compliance scan complete. Address critical requirements immediately.`,
        actionUrl: `/projects/${projectId}/compliance`,
        actionLabel: 'View Compliance',
        metadata: { criticalCount: criticalMissing.length },
      });
    }

    this.logger.log(`Compliance scan complete for ${projectId}: ${criticalMissing.length} critical gaps`);
  }

  private async checkRequirementAddressed(requirement: string, proposalContent: string): Promise<boolean> {
    if (!proposalContent.trim()) return false;
    const reqKeywords = requirement.toLowerCase().split(' ').filter((w) => w.length > 4);
    const contentLower = proposalContent.toLowerCase();
    const keywordMatches = reqKeywords.filter((kw) => contentLower.includes(kw)).length;
    if (keywordMatches / reqKeywords.length > 0.6) return true;
    try {
      const { reply } = await this.aiService.coPilotChat(
        'system', [{ role: 'user', content: `Does the proposal content adequately address the following requirement?\nRequirement: ${requirement}\nProposal excerpt: ${proposalContent.substring(0, 3000)}\nAnswer with only YES or NO.` }], '', 'system', 'free',
      );
      return reply.trim().toUpperCase().startsWith('YES');
    } catch {
      return keywordMatches > 0;
    }
  }

  private async autoExtractRequirements(projectId: string, rfpText: string): Promise<void> {
    try {
      const { reply } = await this.aiService.coPilotChat(
        projectId, [{ role: 'user', content: `Extract compliance requirements from this RFP. Return JSON array:\n[{ "requirementText": "...", "category": "FAR|CMMC|FedRAMP|Custom", "severity": "critical|high|medium|low", "sectionRef": "..." }]\nRFP: ${rfpText.substring(0, 6000)}\nReturn ONLY valid JSON array.` }], '', 'system', 'free',
      );
      const requirements = JSON.parse(reply.replace(/```json|```/g, '').trim());
      await this.reqRepo.save(requirements.map((r: any) => this.reqRepo.create({ ...r, projectId })));
    } catch (e) {
      this.logger.error(`Auto-extract requirements failed: ${e.message}`);
    }
  }
}
