import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WebhookDelivery, DeliveryStatus } from '../../entities/entities';
import { Webhook } from '../../entities/entities';
import { WebhooksService } from '../../modules/webhooks/webhooks.service';

@Processor('webhook-delivery', { concurrency: 10 })
export class WebhookDeliveryProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhookDeliveryProcessor.name);

  constructor(
    @InjectRepository(WebhookDelivery) private deliveryRepo: Repository<WebhookDelivery>,
    @InjectRepository(Webhook) private webhookRepo: Repository<Webhook>,
    private webhooksService: WebhooksService,
  ) {
    super();
  }

  async process(job: Job<{
    deliveryId: string;
    webhookId: string;
    url: string;
    secret: string;
    event: string;
    payload: Record<string, any>;
  }>) {
    const { deliveryId, url, secret, event, payload } = job.data;

    await this.deliveryRepo.update(deliveryId, { status: DeliveryStatus.RETRYING, attemptCount: job.attemptsMade + 1 });

    const fullPayload = {
      id: deliveryId,
      event,
      timestamp: new Date().toISOString(),
      data: payload,
    };

    const signature = this.webhooksService.generateSignature(fullPayload, secret);
    const start = Date.now();

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-RFPilot-Signature': `sha256=${signature}`,
          'X-RFPilot-Event': event,
          'X-RFPilot-Delivery': deliveryId,
          'User-Agent': 'RFPilot-Webhook/2.0',
        },
        body: JSON.stringify(fullPayload),
        signal: AbortSignal.timeout(30000),
      });

      const responseBody = await response.text().catch(() => '');
      const success = response.ok;

      await this.deliveryRepo.update(deliveryId, {
        status: success ? DeliveryStatus.SUCCESS : DeliveryStatus.FAILED,
        responseCode: response.status,
        responseBody: responseBody.substring(0, 1000),
        completedAt: new Date(),
      });

      if (!success) {
        throw new Error(`Webhook endpoint returned ${response.status}`);
      }
    } catch (err) {
      await this.deliveryRepo.update(deliveryId, {
        status: DeliveryStatus.FAILED,
        errorMessage: err.message,
        nextRetryAt: new Date(Date.now() + Math.pow(2, job.attemptsMade) * 30000),
      });
      throw err;
    }
  }
}
