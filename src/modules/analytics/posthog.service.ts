import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PostHog } from 'posthog-node';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PostHogService implements OnModuleDestroy {
  private client: PostHog | null = null;

  constructor(private config: ConfigService) {
    const key = config.get('POSTHOG_API_KEY');
    if (key) {
      this.client = new PostHog(key, {
        host: config.get('POSTHOG_HOST', 'https://app.posthog.com'),
      });
    }
  }

  track(userId: string, event: string, props?: Record<string, any>) {
    if (!this.client) return;
    this.client.capture({ distinctId: userId, event, properties: props });
  }

  async onModuleDestroy() {
    await this.client?.shutdown();
  }
}
