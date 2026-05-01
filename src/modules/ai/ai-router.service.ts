import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { selectOptimalModel, AiTask } from '../../common/constants/ai-models';

@Injectable()
export class AiRouterService {
  private openai: OpenAI;
  private anthropic: Anthropic | null = null;

  constructor(private configService: ConfigService) {
    this.openai = new OpenAI({ apiKey: this.configService.get('OPENAI_API_KEY') });
    const anthropicKey = this.configService.get('ANTHROPIC_API_KEY');
    if (anthropicKey) {
      this.anthropic = new Anthropic({ apiKey: anthropicKey });
    }
  }

  getClientForModel(model: string): OpenAI | Anthropic {
    if (model.startsWith('claude')) {
      if (!this.anthropic) throw new Error('Anthropic API key not configured');
      return this.anthropic;
    }
    return this.openai;
  }

  async chatCompletion(model: string, messages: any[], options: any = {}) {
    const client = this.getClientForModel(model);
    if (model.startsWith('claude')) {
      const systemMsg = messages.find(m => m.role === 'system')?.content || '';
      const userMsgs = messages.filter(m => m.role !== 'system').map(m => ({
        role: m.role === 'user' ? 'user' as const : 'assistant' as const,
        content: m.content,
      }));
      const response = await (client as Anthropic).messages.create({
        model,
        system: systemMsg,
        messages: userMsgs,
        max_tokens: options.maxTokens || 4096,
        temperature: options.temperature || 0.7,
      });
      return {
        choices: [{ message: { content: (response.content[0] as any).text } }],
        usage: {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
        },
      };
    }
    return (client as OpenAI).chat.completions.create({
      model,
      messages,
      ...options,
    });
  }

  resolveModel(task: AiTask, orgPlan: string): string {
    return selectOptimalModel(task, orgPlan);
  }
}
