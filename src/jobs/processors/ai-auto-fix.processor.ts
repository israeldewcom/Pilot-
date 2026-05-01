import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ComplianceRequirement } from '../../entities/entities';
import { ProjectOutline } from '../../entities/entities';
import { AiService } from '../../modules/ai/ai.service';

@Processor('ai-auto-fix', { concurrency: 2 })
export class AiAutoFixProcessor extends WorkerHost {
  private readonly logger = new Logger(AiAutoFixProcessor.name);

  constructor(
    @InjectRepository(ComplianceRequirement) private reqRepo: Repository<ComplianceRequirement>,
    @InjectRepository(ProjectOutline) private outlineRepo: Repository<ProjectOutline>,
    private aiService: AiService,
  ) {
    super();
  }

  async process(job: Job<{
    requirementId: string;
    projectId: string;
    userId: string;
    requirementText: string;
  }>) {
    const { requirementId, projectId, userId, requirementText } = job.data;
    this.logger.log(`Auto-fixing compliance gap: ${requirementId}`);

    const outlines = await this.outlineRepo.find({ where: { projectId }, order: { orderIndex: 'ASC' } });
    const mostRelevantSection = this.findMostRelevantSection(requirementText, outlines);
    const sectionContext = mostRelevantSection?.content || mostRelevantSection?.aiDraft || '';

    const { content } = await this.aiService.autoFixComplianceGap(
      requirementId, requirementText, sectionContext, userId,
    );

    if (mostRelevantSection) {
      const updatedContent = sectionContext
        ? `${sectionContext}\n\n**Compliance Addition:**\n${content}`
        : content;
      await this.outlineRepo.update(mostRelevantSection.id, {
        content: updatedContent,
        lastEditedBy: userId,
        status: 'draft',
      });
    }

    await this.reqRepo.update(requirementId, {
      status: 'met',
      aiSuggestion: content,
      lastCheckedAt: new Date(),
    });

    this.logger.log(`Auto-fix complete for requirement ${requirementId}`);
  }

  private findMostRelevantSection(requirement: string, outlines: ProjectOutline[]): ProjectOutline | null {
    if (!outlines.length) return null;
    const reqLower = requirement.toLowerCase();
    const keywords: Record<string, ProjectOutline | undefined> = {
      'technical': outlines.find((o) => o.title.toLowerCase().includes('technical')),
      'management': outlines.find((o) => o.title.toLowerCase().includes('management')),
      'performance': outlines.find((o) => o.title.toLowerCase().includes('performance')),
      'price': outlines.find((o) => o.title.toLowerCase().includes('price') || o.title.toLowerCase().includes('cost')),
    };
    for (const [kw, section] of Object.entries(keywords)) {
      if (reqLower.includes(kw) && section) return section;
    }
    return outlines[0];
  }
}
