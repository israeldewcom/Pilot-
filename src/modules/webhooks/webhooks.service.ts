import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { createHmac } from 'crypto';
import { Webhook, WebhookEvent } from '../../entities/entities';
import { WebhookDelivery, DeliveryStatus } from '../../entities/entities';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    @InjectRepository(Webhook) private webhookRepo: Repository<Webhook>,
    @InjectRepository(WebhookDelivery) private deliveryRepo: Repository<WebhookDelivery>,
    @InjectQueue('webhook-delivery') private deliveryQueue: Queue,
  ) {}

  async create(data: { name: string; url: string; events: WebhookEvent[]; secret?: string }, organizationId: string): Promise<Webhook> {
    const secret = data.secret || uuidv4().replace(/-/g, '');
    const webhook = await this.webhookRepo.save(this.webhookRepo.create({ ...data, secret, organizationId }));
    return webhook;
  }

  async findAll(organizationId: string): Promise<Webhook[]> {
    return this.webhookRepo.find({ where: { organizationId }, order: { createdAt: 'DESC' } });
  }

  async update(id: string, organizationId: string, data: Partial<Webhook>): Promise<Webhook> {
    const webhook = await this.webhookRepo.findOne({ where: { id, organizationId } });
    if (!webhook) throw new NotFoundException('Webhook not found');
    await this.webhookRepo.update(id, data);
    return this.webhookRepo.findOne({ where: { id } });
  }

  async delete(id: string, organizationId: string): Promise<void> {
    await this.webhookRepo.delete({ id, organizationId });
  }

  async dispatchEvent(event: string, payload: Record<string, any>, organizationId: string): Promise<void> {
    const webhooks = await this.webhookRepo.find({
      where: { organizationId, isActive: true },
    });

    const relevantWebhooks = webhooks.filter((w) => w.events.includes(event as WebhookEvent));

    for (const webhook of relevantWebhooks) {
      const delivery = await this.deliveryRepo.save(
        this.deliveryRepo.create({ webhookId: webhook.id, event, payload, status: DeliveryStatus.PENDING })
      );

      await this.deliveryQueue.add('deliver', {
        deliveryId: delivery.id,
        webhookId: webhook.id,
        url: webhook.url,
        secret: webhook.secret,
        event,
        payload,
      }, { attempts: 3, backoff: { type: 'exponential', delay: 30000 } });
    }
  }

  async testWebhook(id: string, organizationId: string): Promise<{ success: boolean; statusCode: number; responseTime: number }> {
    const webhook = await this.webhookRepo.findOne({ where: { id, organizationId } });
    if (!webhook) throw new NotFoundException('Webhook not found');

    const testPayload = { event: 'test', timestamp: new Date().toISOString(), data: { message: 'RFPilot webhook test' } };
    const signature = this.generateSignature(testPayload, webhook.secret);
    const start = Date.now();

    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-RFPilot-Signature': signature,
          'X-RFPilot-Event': 'test',
        },
        body: JSON.stringify(testPayload),
        signal: AbortSignal.timeout(10000),
      });

      return { success: response.ok, statusCode: response.status, responseTime: Date.now() - start };
    } catch (err) {
      return { success: false, statusCode: 0, responseTime: Date.now() - start };
    }
  }

  async getDeliveries(webhookId: string, organizationId: string, limit = 50) {
    const webhook = await this.webhookRepo.findOne({ where: { id: webhookId, organizationId } });
    if (!webhook) throw new NotFoundException('Webhook not found');
    return this.deliveryRepo.find({
      where: { webhookId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  generateSignature(payload: any, secret: string): string {
    return createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');
  }
}
