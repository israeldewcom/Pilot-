import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification, NotificationType } from '../../entities/entities';
import { NotificationPreference } from '../../entities/entities';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification) private notifRepo: Repository<Notification>,
    @InjectRepository(NotificationPreference) private prefRepo: Repository<NotificationPreference>,
  ) {}

  async createNotification(data: {
    userId: string;
    organizationId: string;
    type: NotificationType;
    title: string;
    description?: string;
    metadata?: Record<string, any>;
    actionUrl?: string;
    actionLabel?: string;
  }): Promise<Notification> {
    const notif = await this.notifRepo.save(this.notifRepo.create(data));
    this.logger.log(`Notification created: ${notif.type} for user ${notif.userId}`);
    return notif;
  }

  async createSystemNotification(
    organizationId: string,
    type: NotificationType,
    title: string,
    description: string,
  ): Promise<void> {
    const members = await this.notifRepo.manager.query(
      `SELECT user_id FROM memberships WHERE organization_id = $1`,
      [organizationId],
    );

    await Promise.all(
      members.map((m: any) =>
        this.notifRepo.save(this.notifRepo.create({
          userId: m.user_id,
          organizationId,
          type,
          title,
          description,
        }))
      )
    );
  }

  async findAll(userId: string, organizationId: string, page = 1, limit = 20) {
    const [items, total] = await this.notifRepo.findAndCount({
      where: { userId, organizationId, isArchived: false },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    const unread = await this.notifRepo.count({ where: { userId, organizationId, isRead: false, isArchived: false } });
    return { items, total, unread, page, limit };
  }

  async markRead(id: string, userId: string): Promise<void> {
    await this.notifRepo.update({ id, userId }, { isRead: true });
  }

  async markAllRead(userId: string, organizationId: string): Promise<void> {
    await this.notifRepo.update({ userId, organizationId, isRead: false }, { isRead: true });
  }

  async archive(id: string, userId: string): Promise<void> {
    await this.notifRepo.update({ id, userId }, { isArchived: true });
  }

  async getPreferences(userId: string): Promise<NotificationPreference[]> {
    const all = await this.prefRepo.find({ where: { userId } });
    const types = Object.values(NotificationType);
    return types.map((type) => {
      const existing = all.find((p) => p.type === type);
      return existing || { userId, type, inApp: true, email: false, sms: false } as any;
    });
  }

  async updatePreferences(userId: string, prefs: Array<{ type: string; inApp: boolean; email: boolean }>): Promise<void> {
    await Promise.all(
      prefs.map((p) =>
        this.prefRepo.upsert(
          { userId, type: p.type, inApp: p.inApp, email: p.email },
          ['userId', 'type'],
        )
      )
    );
  }
}
