import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OutlineVersion, ProjectOutline } from '../../entities/entities';

@Injectable()
export class VersioningService {
  constructor(
    @InjectRepository(OutlineVersion) private versionRepo: Repository<OutlineVersion>,
  ) {}

  async saveVersion(outlineId: string, content: string, userId: string, projectId: string, changeNote?: string) {
    const latest = await this.versionRepo.findOne({
      where: { outlineId },
      order: { version: 'DESC' },
    });
    const version = (latest?.version || 0) + 1;
    return this.versionRepo.save({
      outlineId,
      projectId,
      content,
      version,
      savedBy: userId,
      changeNote,
    });
  }

  async getHistory(outlineId: string) {
    return this.versionRepo.find({
      where: { outlineId },
      order: { createdAt: 'DESC' },
      select: ['id', 'version', 'savedBy', 'createdAt', 'changeNote'],
    });
  }

  async getVersion(versionId: string) {
    return this.versionRepo.findOne({ where: { id: versionId } });
  }
}
