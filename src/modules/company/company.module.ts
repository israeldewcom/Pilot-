import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompanyProfile } from '../../entities/entities';
import { CompanyService } from './company.service';

@Module({
  imports: [TypeOrmModule.forFeature([CompanyProfile])],
  providers: [CompanyService],
  exports: [CompanyService],
})
export class CompanyModule {}
