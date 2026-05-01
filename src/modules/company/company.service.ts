import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CompanyProfile } from '../../entities/entities';

@Injectable()
export class CompanyService {
  constructor(@InjectRepository(CompanyProfile) private profileRepo: Repository<CompanyProfile>) {}

  async getProfile(organizationId: string): Promise<CompanyProfile | null> {
    return this.profileRepo.findOne({ where: { organizationId } });
  }

  async upsertProfile(data: Partial<CompanyProfile>, organizationId: string): Promise<CompanyProfile> {
    const existing = await this.profileRepo.findOne({ where: { organizationId } });
    if (existing) {
      await this.profileRepo.update(existing.id, data);
      return this.profileRepo.findOne({ where: { id: existing.id } });
    }
    return this.profileRepo.save(this.profileRepo.create({ ...data, organizationId }));
  }
}
