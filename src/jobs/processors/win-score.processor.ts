import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { WinScoreService } from '../../modules/win-score/win-score.service';

@Processor('win-score-recalc', { concurrency: 5 })
export class WinScoreProcessor extends WorkerHost {
  private readonly logger = new Logger(WinScoreProcessor.name);

  constructor(private winScoreService: WinScoreService) {
    super();
  }

  async process(job: Job<{ projectId: string; organizationId: string }>) {
    const { projectId, organizationId } = job.data;
    this.logger.log(`Recalculating win score for project: ${projectId}`);
    const result = await this.winScoreService.calculateScore(projectId, organizationId);
    this.logger.log(`Win score for ${projectId}: ${result.score}`);
    return result;
  }
}
