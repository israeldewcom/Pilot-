import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Project, AiGenerationLog, ComplianceRequirement, Document } from '../../entities/entities';
import { AnalyticsService } from './analytics.service';
import { PostHogService } from './posthog.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Project, AiGenerationLog, ComplianceRequirement, Document])],
  providers: [AnalyticsService, PostHogService],
  exports: [AnalyticsService, PostHogService],
})
export class AnalyticsModule {}
