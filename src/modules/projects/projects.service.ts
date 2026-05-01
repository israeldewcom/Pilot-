import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindManyOptions } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Project, ProjectStatus } from '../../entities/entities';
import { ProjectOutline } from '../../entities/entities';
import { AuditLog } from '../../entities/entities';
import { Organization } from '../../entities/entities';
import { PostHogService } from '../analytics/posthog.service';
import { buildPaginationMeta, generateSlug } from '../../common/utils/utils';

export interface CreateProjectDto {
  name: string;
  client?: string;
  dueDate?: string;
  contractValue?: number;
  priority?: 'high' | 'medium' | 'low';
  rfpText?: string;
  tags?: string[];
}

export interface UpdateProjectDto {
  name?: string;
  client?: string;
  dueDate?: string;
  contractValue?: number;
  priority?: string;
  status?: ProjectStatus;
  rfpText?: string;
  tags?: string[];
}

export interface ProjectQueryDto {
  page?: number;
  limit?: number;
  status?: string;
  priority?: string;
  search?: string;
  sortBy?: string;
  sortDir?: 'ASC' | 'DESC';
  archived?: boolean;
}

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(
    @InjectRepository(Project) private projectRepo: Repository<Project>,
    @InjectRepository(ProjectOutline) private outlineRepo: Repository<ProjectOutline>,
    @InjectRepository(AuditLog) private auditRepo: Repository<AuditLog>,
    @InjectRepository(Organization) private orgRepo: Repository<Organization>,
    private eventEmitter: EventEmitter2,
    private posthog: PostHogService,
  ) {}

  async findAll(organizationId: string, query: ProjectQueryDto) {
    const { page = 1, limit = 20, status, priority, search, sortBy = 'createdAt', sortDir = 'DESC', archived = false } = query;

    const qb = this.projectRepo.createQueryBuilder('p')
      .where('p.organizationId = :organizationId', { organizationId })
      .andWhere('p.deleted = false')
      .andWhere('p.archived = :archived', { archived });

    if (status) qb.andWhere('p.status = :status', { status });
    if (priority) qb.andWhere('p.priority = :priority', { priority });
    if (search) {
      qb.andWhere('(p.name ILIKE :search OR p.client ILIKE :search)', { search: `%${search}%` });
    }

    const validSortFields = ['createdAt', 'updatedAt', 'dueDate', 'contractValue', 'winProbability', 'name'];
    const safeSortBy = validSortFields.includes(sortBy) ? `p.${sortBy}` : 'p.createdAt';
    qb.orderBy(safeSortBy, sortDir).skip((page - 1) * limit).take(limit);

    const [items, total] = await qb.getManyAndCount();
    return { items, meta: buildPaginationMeta(total, page, limit) };
  }

  async findOne(id: string, organizationId: string): Promise<Project> {
    const project = await this.projectRepo.findOne({ where: { id, organizationId, deleted: false } });
    if (!project) throw new NotFoundException(`Project ${id} not found`);
    return project;
  }

  async create(dto: CreateProjectDto, organizationId: string, userId: string): Promise<Project> {
    const slug = generateSlug(dto.name) + '-' + Date.now().toString(36);

    const project = this.projectRepo.create({
      ...dto,
      organizationId,
      ownerId: userId,
      slug,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      status: ProjectStatus.DRAFT,
    });

    const saved = await this.projectRepo.save(project);

    const defaultSections = [
      { title: 'Executive Summary', orderIndex: 0 },
      { title: 'Technical Approach', orderIndex: 1 },
      { title: 'Management Plan', orderIndex: 2 },
      { title: 'Past Performance', orderIndex: 3 },
      { title: 'Price / Cost Volume', orderIndex: 4 },
    ];

    await this.outlineRepo.save(
      defaultSections.map((s) => this.outlineRepo.create({ ...s, projectId: saved.id })),
    );

    await this.auditRepo.save({
      organizationId, userId, action: 'project.create',
      resource: 'project', resourceId: saved.id,
      details: { name: dto.name },
    });

    const org = await this.orgRepo.findOne({ where: { id: organizationId } });
    this.posthog.track(userId, 'project.created', {
      plan: org?.plan || 'free',
      projectCount: await this.projectRepo.count({ where: { organizationId, deleted: false } }),
    });

    this.eventEmitter.emit('project.created', { projectId: saved.id, organizationId, userId });
    this.logger.log(`Project created: ${saved.id} by ${userId}`);
    return saved;
  }

  async update(id: string, dto: UpdateProjectDto, organizationId: string, userId: string): Promise<Project> {
    const project = await this.findOne(id, organizationId);
    const updates: Partial<Project> = { ...dto } as any;
    if (dto.dueDate) updates.dueDate = new Date(dto.dueDate);

    await this.projectRepo.update(id, updates);
    this.eventEmitter.emit('project.updated', { projectId: id, organizationId, userId, changes: dto });
    return this.findOne(id, organizationId);
  }

  async archive(id: string, organizationId: string, userId: string): Promise<void> {
    await this.findOne(id, organizationId);
    await this.projectRepo.update(id, { archived: true, archivedAt: new Date() });
    await this.auditRepo.save({
      organizationId, userId, action: 'project.archive',
      resource: 'project', resourceId: id,
    });
  }

  async restore(id: string, organizationId: string, userId: string): Promise<void> {
    await this.projectRepo.update(id, { archived: false, archivedAt: null });
  }

  async softDelete(id: string, organizationId: string, userId: string): Promise<void> {
    await this.findOne(id, organizationId);
    await this.projectRepo.update(id, { deleted: true, deletedAt: new Date() });
    await this.auditRepo.save({
      organizationId, userId, action: 'project.delete',
      resource: 'project', resourceId: id,
    });
  }

  async getOutlines(projectId: string, organizationId: string): Promise<ProjectOutline[]> {
    await this.findOne(projectId, organizationId);
    return this.outlineRepo.find({
      where: { projectId },
      order: { orderIndex: 'ASC' },
    });
  }

  async updateOutline(
    projectId: string,
    sectionId: string,
    content: string,
    userId: string,
    organizationId: string,
  ): Promise<ProjectOutline> {
    await this.findOne(projectId, organizationId);
    const section = await this.outlineRepo.findOne({ where: { id: sectionId, projectId } });
    if (!section) throw new NotFoundException('Section not found');
    await this.outlineRepo.update(sectionId, { content, lastEditedBy: userId, status: 'draft' });
    return this.outlineRepo.findOne({ where: { id: sectionId } });
  }

  async getDashboardStats(organizationId: string) {
    const [total, active, won, lost, totalValue] = await Promise.all([
      this.projectRepo.count({ where: { organizationId, deleted: false } }),
      this.projectRepo.count({ where: { organizationId, status: ProjectStatus.IN_PROGRESS, deleted: false } }),
      this.projectRepo.count({ where: { organizationId, status: ProjectStatus.WON, deleted: false } }),
      this.projectRepo.count({ where: { organizationId, status: ProjectStatus.LOST, deleted: false } }),
      this.projectRepo.createQueryBuilder('p')
        .select('SUM(p.contractValue)', 'total')
        .where('p.organizationId = :organizationId', { organizationId })
        .andWhere('p.deleted = false')
        .getRawOne(),
    ]);

    const winRate = (won + lost) > 0 ? Math.round((won / (won + lost)) * 100) : 0;

    return {
      totalProjects: total,
      activeProjects: active,
      wonProjects: won,
      lostProjects: lost,
      winRate,
      pipelineValue: parseFloat(totalValue?.total || '0'),
    };
  }
}
