import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectOutline, Project, AiGenerationLog, CircuitBreakerState, Organization } from '../../entities/entities';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { AiRouterService } from './ai-router.service';
import { EvidenceModule } from '../evidence/evidence.module';
import { TokenCounter } from '../../common/utils/utils';

@Module({
  imports: [
    TypeOrmModule.forFeature([ProjectOutline, Project, AiGenerationLog, CircuitBreakerState, Organization]),
    EvidenceModule,
  ],
  providers: [AiService, AiRouterService, TokenCounter],
  controllers: [AiController],
  exports: [AiService, AiRouterService],
})
export class AiModule {}
