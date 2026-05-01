import {
  Controller, Post, Get, Param, Body, Query, Res, UseGuards,
  HttpCode, HttpStatus, Header, Sse, MessageEvent,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { AiService } from './ai.service';
import { AuthGuard, RolesGuard, OrgRateLimitGuard } from '../../common/guards/guards';
import { Roles, CurrentUser, RequestUser } from '../../common/decorators/decorators';
import { MetricsService } from '../../monitoring/metrics.service';

@ApiTags('AI Generation')
@Controller('api/ai')
@UseGuards(AuthGuard, RolesGuard, OrgRateLimitGuard)
@ApiBearerAuth()
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly metricsService?: MetricsService,
  ) {}

  @Post('projects/:projectId/sections/:sectionId/generate')
  @Roles('editor', 'admin', 'owner')
  @ApiOperation({ summary: 'Generate AI draft with SSE streaming' })
  async generateStream(
    @Param('projectId') projectId: string,
    @Param('sectionId') sectionId: string,
    @Body() body: { promptHint?: string; model?: string },
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    let aborted = false;
    (res as any).req?.on('close', () => { aborted = true; });

    const startTime = Date.now();
    const stream = await this.aiService.generateStream(
      projectId, sectionId,
      body.promptHint || '',
      user.id, user.organizationId,
    );

    stream.subscribe({
      next: (event) => {
        if (!aborted) {
          res.write(`data: ${event.data}\n\n`);
        }
      },
      error: (err) => {
        const duration = (Date.now() - startTime) / 1000;
        if (this.metricsService) {
          this.metricsService.recordAiGeneration(body.model || 'gpt-4o', 'generate', duration);
        }
        res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
        res.end();
      },
      complete: () => {
        const duration = (Date.now() - startTime) / 1000;
        if (this.metricsService) {
          this.metricsService.recordAiGeneration(body.model || 'gpt-4o', 'generate', duration);
        }
        if (!aborted) res.end();
      },
    });
  }

  @Sse('projects/:projectId/sections/:sectionId/generate-sse')
  @Roles('editor', 'admin', 'owner')
  @ApiOperation({ summary: 'Generate AI draft via SSE (Observable)' })
  generateSse(
    @Param('projectId') projectId: string,
    @Param('sectionId') sectionId: string,
    @Query('hint') hint: string,
    @CurrentUser() user: RequestUser,
  ): Observable<MessageEvent> {
    return new Observable((observer) => {
      this.aiService.generateStream(projectId, sectionId, hint || '', user.id, user.organizationId)
        .then((stream) => {
          stream.subscribe({
            next: (event) => observer.next({ data: event.data } as MessageEvent),
            error: (err) => observer.error(err),
            complete: () => observer.complete(),
          });
        });
    });
  }

  @Post('sections/:sectionId/refine')
  @Roles('editor', 'admin', 'owner')
  @ApiOperation({ summary: 'Refine existing section content' })
  refineSection(
    @Param('sectionId') sectionId: string,
    @Body() body: { currentContent: string; instruction: string; model?: string },
    @CurrentUser() user: RequestUser,
  ) {
    return this.aiService.refineSection(sectionId, body.currentContent, body.instruction, user.id, user.organizationId);
  }

  @Post('projects/:projectId/co-pilot')
  @Roles('editor', 'admin', 'owner')
  @ApiOperation({ summary: 'AI Co-Pilot chat interaction' })
  coPilot(
    @Param('projectId') projectId: string,
    @Body() body: { messages: any[]; sectionContext?: string },
    @CurrentUser() user: RequestUser,
  ) {
    return this.aiService.coPilotChat(projectId, body.messages, body.sectionContext || '', user.id, user.organizationId);
  }

  @Post('compliance/:requirementId/auto-fix')
  @Roles('editor', 'admin', 'owner')
  @ApiOperation({ summary: 'AI auto-fix a compliance gap' })
  autoFixGap(
    @Param('requirementId') requirementId: string,
    @Body() body: { sectionContext: string; requirementText?: string },
    @CurrentUser() user: RequestUser,
  ) {
    return this.aiService.autoFixComplianceGap(requirementId, body.requirementText || '', body.sectionContext, user.id);
  }

  @Post('estimate-cost')
  @ApiOperation({ summary: 'Estimate AI token cost' })
  estimateCost(@Body() body: { model: string; promptTokens: number; completionTokens: number }) {
    return this.aiService.getTokenCostEstimate(body.model, body.promptTokens, body.completionTokens);
  }

  @Get('usage')
  @ApiOperation({ summary: 'Get AI usage stats for org' })
  getUsage(@CurrentUser() user: RequestUser, @Query('days') days: number = 30) {
    return this.aiService.getUsageStats(user.organizationId, days);
  }
}
