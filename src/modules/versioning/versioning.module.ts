import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OutlineVersion } from '../../entities/entities';
import { VersioningService } from './versioning.service';

@Module({
  imports: [TypeOrmModule.forFeature([OutlineVersion])],
  providers: [VersioningService],
  exports: [VersioningService],
})
export class VersioningModule {}
