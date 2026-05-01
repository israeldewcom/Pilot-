import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ComplianceRequirement, Project } from '../../entities/entities';
import { ComplianceExportService } from './compliance-export.service';

@Module({
  imports: [TypeOrmModule.forFeature([ComplianceRequirement, Project])],
  providers: [ComplianceExportService],
  exports: [ComplianceExportService],
})
export class ComplianceExportModule {}
