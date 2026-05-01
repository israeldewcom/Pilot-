import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { Project, ComplianceRequirement, ProjectOutline, Document } from '../../entities/entities';
import { WinScoreService } from './win-score.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Project, ComplianceRequirement, ProjectOutline, Document]),
    BullModule.registerQueue({ name: 'win-score-recalc' }),
  ],
  providers: [WinScoreService],
  exports: [WinScoreService],
})
export class WinScoreModule {}
