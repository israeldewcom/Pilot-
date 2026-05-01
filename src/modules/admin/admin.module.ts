import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Organization, User, Project, AiGenerationLog, PromoCode,
  AdminAuditLog, PlatformAnnouncement, FeatureFlagOverride,
  DunningEvent, GDPRRequest, ReferralTracking, CircuitBreakerState
} from '../../entities/entities';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { AdminGuard } from './admin.guard';
import { CacheModule } from '@nestjs/cache-manager';
import { ToolsModule } from '../tools/tools.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Organization, User, Project, AiGenerationLog, PromoCode,
      AdminAuditLog, PlatformAnnouncement, FeatureFlagOverride,
      DunningEvent, GDPRRequest, ReferralTracking, CircuitBreakerState
    ]),
    CacheModule.register(),
    ToolsModule,
  ],
  providers: [AdminService, AdminGuard],
  controllers: [AdminController],
  exports: [AdminService, AdminGuard],
})
export class AdminModule {}
