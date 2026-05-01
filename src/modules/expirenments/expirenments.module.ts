import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Experiment, ExperimentAssignment } from '../../entities/entities';
import { ExperimentsService } from './experiments.service';

@Module({
  imports: [TypeOrmModule.forFeature([Experiment, ExperimentAssignment])],
  providers: [ExperimentsService],
  exports: [ExperimentsService],
})
export class ExperimentsModule {}
