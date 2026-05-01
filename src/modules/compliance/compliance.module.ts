import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ComplianceRequirement, ComplianceCheck, Project } from '../../entities/entities';
import { ComplianceService } from './compliance.service';
import { ComplianceController } from './compliance.controller';
import { AiModule } from '../ai/ai.module';
import { EvidenceModule } from '../evidence/evidence.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ComplianceRequirement, ComplianceCheck, Project]),
    BullModule.registerQueue({ name: 'compliance-scanner' }, { name: 'ai-auto-fix' }),
    AiModule,
    EvidenceModule,
  ],
  providers: [ComplianceService],
  controllers: [ComplianceController],
  exports: [ComplianceService],
})
export class ComplianceModule {}
