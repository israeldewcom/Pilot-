import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Observable, Subject } from 'rxjs';
import OpenAI from 'openai';

import { ProjectOutline } from '../../entities/entities';
import { Project } from '../../entities/entities';
import { AiGenerationLog } from '../../entities/entities';
import { CircuitBreakerState, CircuitState } from '../../entities/entities';
import { Organization } from '../../entities/entities';
import { EvidenceService } from '../evidence/evidence.service';
import { AiRouterService } from './ai-router.service';
import { PostHogService } from '../analytics/posthog.service';
import { calculateCost, AI_MODEL_PRICING, AiTask } from '../../common/constants/ai-models';
import { TokenCounter } from '../../common/utils/utils';
import { Retryable } from '../../common/decorators/retry.decorator';
import { CacheService } from '../../common/cache/cache.service';
import { FeatureFlagsService } from '../../common/feature-flags/feature-flags.service';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private openai: OpenAI;

  constructor(
    private configService: ConfigService,
    @InjectRepository(ProjectOutline) private outlineRepo: Repository<ProjectOutline>,
    @InjectRepository(Project) private projectRepo: Repository<Project>,
    @InjectRepository(AiGenerationLog) private logRepo: Repository<AiGenerationLog>,
    @InjectRepository(CircuitBreakerState) private circuitRepo: Repository<CircuitBreakerState>,
    @InjectRepository(Organization) private orgRepo: Repository<Organization>,
    private evidenceService: EvidenceService,
    private tokenCounter: TokenCounter,
    private cacheService: CacheService,
    private featureFlags: FeatureFlagsService,
    private aiRouter: AiRouterService,
    private posthog: PostHogService,
  ) {
    this.openai = new OpenAI({ apiKey: this.configService.get('OPENAI_API_KEY') });
  }

  @Retryable({ maxAttempts: 3, delay: 2000, backoff: 'exponential' })
  async generateStream(
    projectId: string,
    sectionId: string,
    promptHint: string,
    userId: string,
    organizationId: string,
    task: AiTask = AiTask.FIRST_DRAFT,
  ): Promise<Observable<{ data: string }>> {
    await this.checkCircuitBreaker('openai');

    const [section, project, org] = await Promise.all([
      this.outlineRepo.findOne({ where: { id: sectionId, projectId } }),
      this.projectRepo.findOne({ where: { id: projectId, organizationId } }),
      this.orgRepo.findOne({ where: { id: organizationId } }),
    ]);
    if (!section || !project) throw new NotFoundException('Section or project not found');
    
    // Enforce token limits
    if (org && org.aiTokensUsed >= org.aiTokensLimit) {
      throw new ForbiddenException('AI token limit reached. Upgrade your plan to continue generating.');
    }

    const model = this.aiRouter.resolveModel(task, org?.plan || 'free');
    const evidenceContext = await this.buildEvidenceContext(projectId, section.title, promptHint);

    const systemPrompt = this.buildSystemPrompt(project, section, evidenceContext);
    const userPrompt = promptHint || `Write a comprehensive ${section.title} section for this RFP response. Be specific, compelling, and address all evaluation criteria.`;

    const subject = new Subject<{ data: string }>();
    let totalContent = '';
    let promptTokens = 0;
    let completionTokens = 0;
    const startTime = Date.now();

    (async () => {
      try {
        const stream = await this.openai.chat.completions.create({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          stream: true,
          max_tokens: 4096,
          temperature: 0.7,
        });

        for await (const chunk of stream) {
          const text = chunk.choices[0]?.delta?.content || '';
          if (text) {
            totalContent += text;
            subject.next({ data: JSON.stringify({ type: 'chunk', content: text }) });
          }

          if (chunk.usage) {
            promptTokens = chunk.usage.prompt_tokens;
            completionTokens = chunk.usage.completion_tokens;
          }
        }

        await this.outlineRepo.update(sectionId, {
          aiDraft: totalContent,
          status: 'draft',
          lastEditedBy: userId,
        });

        if (!promptTokens) {
          promptTokens = this.tokenCounter.count(systemPrompt + userPrompt);
          completionTokens = this.tokenCounter.count(totalContent);
        }

        const cost = calculateCost(model, promptTokens, completionTokens);
        const totalTokens = promptTokens + completionTokens;

        await this.logRepo.save({
          organizationId, userId, projectId, sectionId: sectionId,
          model, promptTokens, completionTokens,
          totalTokens, cost, action: 'generate',
        });
        
        // Track AI usage for billing
        await this.orgRepo.increment({ id: organizationId }, 'aiTokensUsed', totalTokens);

        await this.recordCircuitSuccess('openai');

        const duration = (Date.now() - startTime) / 1000;
        
        // Track in PostHog
        this.posthog.track(userId, 'ai.draft.generated', {
          model,
          tokens: totalTokens,
          cost: cost.toFixed(4),
          plan: org?.plan || 'free',
          projectId,
        });

        subject.next({
          data: JSON.stringify({
            type: 'done',
            content: totalContent,
            tokensUsed: totalTokens,
            cost: cost.toFixed(4),
            duration,
          }),
        });
        subject.complete();
      } catch (err) {
        await this.recordCircuitFailure('openai');
        this.logger.error(`Stream generation failed: ${err.message}`);
        subject.next({ data: JSON.stringify({ type: 'error', message: err.message }) });
        subject.complete();
      }
    })();

    return subject.asObservable();
  }

  @Retryable({ maxAttempts: 2, delay: 1000 })
  async refineSection(
    sectionId: string,
    currentContent: string,
    instruction: string,
    userId: string,
    organizationId: string,
    task: AiTask = AiTask.FINAL_PROPOSAL_SECTION,
  ): Promise<{ content: string; tokensUsed: number; cost: string }> {
    await this.checkCircuitBreaker('openai');

    const org = await this.orgRepo.findOne({ where: { id: organizationId } });
    if (org && org.aiTokensUsed >= org.aiTokensLimit) {
      throw new ForbiddenException('AI token limit reached. Upgrade your plan to continue.');
    }
    
    const model = this.aiRouter.resolveModel(task, org?.plan || 'free');

    const messages = [
      {
        role: 'system' as const,
        content: `You are an expert RFP writer. You will refine and improve existing proposal content based on the given instruction. 
Maintain the professional tone and structure. Only return the refined content, no meta-commentary.`,
      },
      {
        role: 'user' as const,
        content: `Current content:\n\n${currentContent}\n\nInstruction: ${instruction}\n\nProvide the refined version:`,
      },
    ];

    const startTime = Date.now();
    const response = await this.openai.chat.completions.create({
      model,
      messages,
      max_tokens: 4096,
      temperature: 0.5,
    });

    const content = response.choices[0].message.content;
    const promptTokens = response.usage?.prompt_tokens || 0;
    const completionTokens = response.usage?.completion_tokens || 0;
    const cost = calculateCost(model, promptTokens, completionTokens);
    const totalTokens = promptTokens + completionTokens;

    await this.outlineRepo.update(sectionId, { content, lastEditedBy: userId });
    await this.orgRepo.increment({ id: organizationId }, 'aiTokensUsed', totalTokens);
    await this.recordCircuitSuccess('openai');

    this.posthog.track(userId, 'ai.draft.refined', {
      model,
      tokens: totalTokens,
      cost: cost.toFixed(4),
      plan: org?.plan || 'free',
    });

    return { content, tokensUsed: totalTokens, cost: cost.toFixed(4) };
  }

  async coPilotChat(
    projectId: string,
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    sectionContext: string,
    userId: string,
    organizationId: string,
  ): Promise<{ reply: string; tokensUsed: number }> {
    await this.checkCircuitBreaker('openai');

    const project = await this.projectRepo.findOne({ where: { id: projectId } });
    const org = await this.orgRepo.findOne({ where: { id: organizationId } });
    if (org && org.aiTokensUsed >= org.aiTokensLimit) {
      throw new ForbiddenException('AI token limit reached. Upgrade your plan to continue.');
    }
    
    const model = this.aiRouter.resolveModel(AiTask.CHAT_COPILOT, org?.plan || 'free');

    const systemPrompt = `You are RFPilot AI Co-Pilot, an expert proposal writing assistant specializing in government contracting.
Project: ${project?.name || 'Unknown'}
Client: ${project?.client || 'Unknown'}
Current Section Context: ${sectionContext || 'Not specified'}

Help the proposal team write winning responses. Provide specific, actionable suggestions.`;

    const response = await this.openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
      max_tokens: 2048,
      temperature: 0.7,
    });

    const totalTokens = response.usage?.total_tokens || 0;
    await this.orgRepo.increment({ id: organizationId }, 'aiTokensUsed', totalTokens);
    await this.recordCircuitSuccess('openai');

    return {
      reply: response.choices[0].message.content,
      tokensUsed: totalTokens,
    };
  }

  async autoFixComplianceGap(
    requirementId: string,
    requirementText: string,
    sectionContext: string,
    userId: string,
    model = 'gpt-4o-mini',
  ): Promise<{ content: string; tokensUsed: number }> {
    const prompt = `You are a compliance expert for government RFP responses.

Compliance Requirement: ${requirementText}

Existing Section Content:
${sectionContext || 'No content yet'}

Write a concise addition to the proposal that directly addresses and satisfies this compliance requirement. 
Be specific and use compliant language. Return only the text addition, no meta-commentary.`;

    const response = await this.openai.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1024,
      temperature: 0.3,
    });

    return {
      content: response.choices[0].message.content,
      tokensUsed: response.usage?.total_tokens || 0,
    };
  }

  @Retryable({ maxAttempts: 5, delay: 1000, backoff: 'exponential' })
  async generateEmbedding(text: string): Promise<number[]> {
    await this.checkCircuitBreaker('openai');
    try {
      const response = await this.openai.embeddings.create({
        model: this.configService.get('OPENAI_EMBEDDING_MODEL', 'text-embedding-3-small'),
        input: text.substring(0, 8000),
      });
      await this.recordCircuitSuccess('openai');
      return response.data[0].embedding;
    } catch (err) {
      await this.recordCircuitFailure('openai');
      throw err;
    }
  }

  getTokenCostEstimate(model: string, promptTokens: number, completionTokens: number) {
    const pricing = AI_MODEL_PRICING[model as keyof typeof AI_MODEL_PRICING];
    if (!pricing) throw new Error(`Unknown model: ${model}`);
    const cost = calculateCost(model, promptTokens, completionTokens);
    return { cost, promptRate: pricing.promptCostPer1K, completionRate: pricing.completionCostPer1K };
  }

  async getUsageStats(organizationId: string, days = 30) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const logs = await this.logRepo.createQueryBuilder('l')
      .select('l.model', 'model')
      .addSelect('SUM(l.totalTokens)', 'totalTokens')
      .addSelect('SUM(l.cost)', 'totalCost')
      .addSelect('COUNT(*)', 'count')
      .where('l.organizationId = :organizationId', { organizationId })
      .andWhere('l.createdAt > :since', { since })
      .groupBy('l.model')
      .getRawMany();

    const totalTokens = logs.reduce((s, l) => s + parseInt(l.totalTokens || '0'), 0);
    const totalCost = logs.reduce((s, l) => s + parseFloat(l.totalCost || '0'), 0);

    return { logs, totalTokens, totalCost, periodDays: days };
  }

  private async buildEvidenceContext(projectId: string, sectionTitle: string, hint: string): Promise<string> {
    try {
      const query = `${sectionTitle} ${hint}`.trim();
      const embedding = await this.generateEmbedding(query);
      const results = await this.evidenceService.hybridSearch(embedding, projectId, query, 5);
      return results.map((r) => `[${r.document?.filename || 'doc'}]: ${r.text}`).join('\n\n');
    } catch {
      return '';
    }
  }

  private buildSystemPrompt(project: any, section: any, evidenceContext: string): string {
    return `You are an expert government proposal writer with 20+ years of experience winning federal contracts.

Project: ${project.name}
Client/Agency: ${project.client || 'Federal Agency'}
Contract Value: ${project.contractValue ? `$${Number(project.contractValue).toLocaleString()}` : 'TBD'}
Section: ${section.title}

${evidenceContext ? `Relevant Evidence from Document Library:\n${evidenceContext}\n\n` : ''}

Instructions:
- Write in a professional, authoritative tone appropriate for federal procurement
- Address evaluation criteria directly and specifically
- Use active voice and concrete, measurable claims
- Reference past performance and capabilities where relevant
- Structure with clear headings and logical flow
- Emphasize technical capability, value proposition, and risk mitigation
- Always cite evidence sources when making claims`;
  }

  private async checkCircuitBreaker(serviceName: string): Promise<void> {
    const breaker = await this.circuitRepo.findOne({ where: { serviceName } });
    if (!breaker || breaker.state === CircuitState.CLOSED) return;

    if (breaker.state === CircuitState.OPEN) {
      const timeout = this.configService.get('CIRCUIT_BREAKER_TIMEOUT', 30000);
      const elapsed = Date.now() - (breaker.lastFailureTime?.getTime() || 0);
      if (elapsed > timeout) {
        await this.circuitRepo.update({ serviceName }, { state: CircuitState.HALF_OPEN, lastAttemptAt: new Date() });
        return;
      }
      throw new Error(`Circuit breaker OPEN for ${serviceName}. Retry in ${Math.ceil((timeout - elapsed) / 1000)}s`);
    }
  }

  private async recordCircuitSuccess(serviceName: string): Promise<void> {
    await this.circuitRepo.upsert({
      serviceName,
      state: CircuitState.CLOSED,
      failureCount: 0,
      lastSuccessTime: new Date(),
      lastAttemptAt: new Date(),
    }, ['serviceName']);
  }

  private async recordCircuitFailure(serviceName: string): Promise<void> {
    const threshold = this.configService.get('CIRCUIT_BREAKER_THRESHOLD', 5);
    const breaker = await this.circuitRepo.findOne({ where: { serviceName } });
    const newCount = (breaker?.failureCount || 0) + 1;
    const newState = newCount >= threshold ? CircuitState.OPEN : CircuitState.CLOSED;

    await this.circuitRepo.upsert({
      serviceName,
      state: newState,
      failureCount: newCount,
      lastFailureTime: new Date(),
      lastAttemptAt: new Date(),
    }, ['serviceName']);
  }
}
