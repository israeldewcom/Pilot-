import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SamOpportunity } from '../../entities/entities';
import { SamGovService } from './sam-gov.service';

@Module({
  imports: [TypeOrmModule.forFeature([SamOpportunity])],
  providers: [SamGovService],
  exports: [SamGovService],
})
export class SamGovModule {}
