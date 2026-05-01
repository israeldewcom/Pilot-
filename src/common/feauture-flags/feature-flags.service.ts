import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FeatureFlagOverride } from '../../entities/entities';

@Injectable()
export class FeatureFlagsService {
  private defaultFlags: Set<string>;
  constructor(
    private configService: ConfigService,
    @InjectRepository(FeatureFlagOverride) private overrideRepo: Repository<FeatureFlagOverride>,
  ) {
    this.defaultFlags = new Set(
      (this.configService.get<string>('FEATURE_FLAGS', '') || '')
        .split(',')
        .map(f => f.trim())
        .filter(Boolean)
    );
  }

  async isEnabled(flag: string, orgId?: string, userId?: string): Promise<boolean> {
    if (orgId) {
      const override = await this.overrideRepo.findOne({ where: { flag, targetType: 'organization', targetId: orgId } });
      if (override) return override.enabled;
    }
    if (userId) {
      const override = await this.overrideRepo.findOne({ where: { flag, targetType: 'user', targetId: userId } });
      if (override) return override.enabled;
    }
    return this.defaultFlags.has(flag);
  }
}
