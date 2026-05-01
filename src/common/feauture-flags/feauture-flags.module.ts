import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FeatureFlagOverride } from '../../entities/entities';
import { FeatureFlagsService } from './feature-flags.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([FeatureFlagOverride])],
  providers: [FeatureFlagsService],
  exports: [FeatureFlagsService],
})
export class FeatureFlagsModule {}
