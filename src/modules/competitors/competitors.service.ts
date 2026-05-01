import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Competitor, CompetitorAnalysis } from '../../entities/entities';
import { AiService } from '../ai/ai.service';

@Injectable()
export class CompetitorsService {
  constructor(
    @InjectRepository(Competitor) private competitorRepo: Repository<Competitor>,
    @InjectRepository(CompetitorAnalysis) private analysisRepo: Repository<CompetitorAnalysis>,
  ) {}

  async findAll(organizationId: string): Promise<Competitor[]> {
    return this.competitorRepo.find({ where: { organizationId }, order: { createdAt: 'DESC' } });
  }

  async create(data: Partial<Competitor>, organizationId: string): Promise<Competitor> {
    return this.competitorRepo.save(this.competitorRepo.create({ ...data, organizationId }));
  }

  async update(id: string, organizationId: string, data: Partial<Competitor>): Promise<Competitor> {
    await this.competitorRepo.update({ id, organizationId }, data);
    return this.competitorRepo.findOne({ where: { id } });
  }

  async delete(id: string, organizationId: string): Promise<void> {
    await this.competitorRepo.delete({ id, organizationId });
  }

  async generateAnalysis(
    competitorId: string,
    projectId: string,
    rfpContext: string,
    aiService: AiService,
    userId: string,
  ): Promise<CompetitorAnalysis> {
    const competitor = await this.competitorRepo.findOne({ where: { id: competitorId } });
    if (!competitor) throw new NotFoundException('Competitor not found');

    const prompt = `Analyze this competitor in the context of a government RFP bid.

Competitor: ${competitor.name}
Website: ${competitor.website || 'Unknown'}
Strengths: ${competitor.strengths || 'Unknown'}
Weaknesses: ${competitor.weaknesses || 'Unknown'}

RFP Context: ${rfpContext || 'General government contracting'}

Provide:
1. Competitive analysis
2. Strengths to counter
3. Weaknesses to exploit
4. Opportunities for our proposal
5. Threats they pose
6. A counter-strategy narrative`;

    const { reply } = await aiService.coPilotChat(
      projectId,
      [{ role: 'user', content: prompt }],
      '',
      userId,
      'free',
    );

    const analysis = await this.analysisRepo.save(this.analysisRepo.create({
      competitorId,
      projectId,
      analysis: reply,
      generatedBy: userId,
    }));

    return analysis;
  }

  async getAnalyses(projectId: string): Promise<CompetitorAnalysis[]> {
    return this.analysisRepo.find({ where: { projectId }, order: { createdAt: 'DESC' } });
  }
}
