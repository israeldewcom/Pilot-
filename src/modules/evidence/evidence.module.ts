import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentChunk } from '../../entities/entities';
import { EvidenceService } from './evidence.service';

@Module({
  imports: [TypeOrmModule.forFeature([DocumentChunk])],
  providers: [EvidenceService],
  exports: [EvidenceService],
})
export class EvidenceModule {}
