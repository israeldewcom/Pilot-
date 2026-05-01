import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Experiment, ExperimentStatus } from '../../entities/entities';
import { ExperimentAssignment } from '../../entities/entities';
import { deterministicBucket, isStatisticallySignificant } from '../../common/utils/utils';

@Injectable()
export class ExperimentsService {
  private readonly logger = new Logger(ExperimentsService.name);

  constructor(
    @InjectRepository(Experiment) private experimentRepo: Repository<Experiment>,
    @InjectRepository(ExperimentAssignment) private assignmentRepo: Repository<ExperimentAssignment>,
  ) {}

  async create(data: Partial<Experiment>, organizationId: string): Promise<Experiment> {
    return this.experimentRepo.save(this.experimentRepo.create({ ...data, organizationId }));
  }

  async findAll(organizationId: string): Promise<Experiment[]> {
    return this.experimentRepo.find({ where: { organizationId }, order: { createdAt: 'DESC' } });
  }

  async activate(id: string, organizationId: string): Promise<Experiment> {
    await this.experimentRepo.update({ id, organizationId }, { status: ExperimentStatus.ACTIVE, startedAt: new Date() });
    return this.experimentRepo.findOne({ where: { id } });
  }

  async pause(id: string, organizationId: string): Promise<Experiment> {
    await this.experimentRepo.update({ id, organizationId }, { status: ExperimentStatus.PAUSED });
    return this.experimentRepo.findOne({ where: { id } });
  }

  async conclude(id: string, organizationId: string): Promise<Experiment> {
    await this.experimentRepo.update({ id, organizationId }, {
      status: ExperimentStatus.COMPLETED,
      endedAt: new Date(),
    });
    return this.analyzeResults(id, organizationId);
  }

  async getAssignment(experimentId: string, userId: string, organizationId: string): Promise<{ variant: string; prompt: string }> {
    const experiment = await this.experimentRepo.findOne({ where: { id: experimentId, organizationId } });
    if (!experiment || experiment.status !== ExperimentStatus.ACTIVE) {
      return { variant: 'control', prompt: experiment?.controlPrompt || '' };
    }

    let assignment = await this.assignmentRepo.findOne({ where: { experimentId, userId } });

    if (!assignment) {
      const bucket = deterministicBucket(userId, experimentId);
      const variant = bucket < experiment.trafficSplit ? 'variant' : 'control';
      assignment = await this.assignmentRepo.save(
        this.assignmentRepo.create({ experimentId, userId, variant })
      );
    }

    const prompt = assignment.variant === 'variant' ? experiment.variantPrompt : experiment.controlPrompt;
    return { variant: assignment.variant, prompt };
  }

  async recordOutcome(experimentId: string, userId: string, outcome: Record<string, any>): Promise<void> {
    await this.assignmentRepo.update(
      { experimentId, userId },
      { outcome, convertedAt: new Date() },
    );
  }

  private async analyzeResults(id: string, organizationId: string): Promise<Experiment> {
    const assignments = await this.assignmentRepo.find({ where: { experimentId: id } });
    const controlGroup = assignments.filter((a) => a.variant === 'control');
    const variantGroup = assignments.filter((a) => a.variant === 'variant');

    const controlConversions = controlGroup.filter((a) => a.convertedAt).length;
    const variantConversions = variantGroup.filter((a) => a.convertedAt).length;

    const controlRate = controlGroup.length > 0 ? controlConversions / controlGroup.length : 0;
    const variantRate = variantGroup.length > 0 ? variantConversions / variantGroup.length : 0;
    const improvement = controlRate > 0 ? ((variantRate - controlRate) / controlRate) * 100 : 0;

    const significant = isStatisticallySignificant(
      controlConversions, controlGroup.length,
      variantConversions, variantGroup.length,
    );

    const results = {
      control: { participants: controlGroup.length, conversions: controlConversions, rate: controlRate },
      variant: { participants: variantGroup.length, conversions: variantConversions, rate: variantRate },
      improvement: Math.round(improvement * 10) / 10,
      winner: variantRate > controlRate ? 'variant' : 'control',
      statisticallySignificant: significant,
      confidence: significant ? '95% confidence reached' : 'More data needed',
      analyzed: new Date().toISOString(),
    };

    await this.experimentRepo.update(id, results);
    return this.experimentRepo.findOne({ where: { id } });
  }
}
