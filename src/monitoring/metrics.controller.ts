import { Injectable } from '@nestjs/common';
import * as promClient from 'prom-client';

@Injectable()
export class MetricsService {
  private register: promClient.Registry;
  private httpRequestDuration: promClient.Histogram;
  private aiGenerationDuration: promClient.Histogram;
  private documentIndexingDuration: promClient.Histogram;

  constructor() {
    this.register = new promClient.Registry();
    promClient.collectDefaultMetrics({ register: this.register });

    this.httpRequestDuration = new promClient.Histogram({
      name: 'http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status'],
      buckets: [0.05, 0.1, 0.5, 1, 2, 5],
    });
    this.register.registerMetric(this.httpRequestDuration);

    this.aiGenerationDuration = new promClient.Histogram({
      name: 'ai_generation_duration_seconds',
      help: 'AI generation request duration',
      labelNames: ['model', 'action'],
      buckets: [0.5, 1, 2, 5, 10, 20, 30],
    });
    this.register.registerMetric(this.aiGenerationDuration);

    this.documentIndexingDuration = new promClient.Histogram({
      name: 'document_indexing_duration_seconds',
      help: 'Document indexing job duration',
      buckets: [1, 5, 10, 30, 60, 120],
    });
    this.register.registerMetric(this.documentIndexingDuration);
  }

  recordHttp(method: string, route: string, status: number, duration: number) {
    this.httpRequestDuration.observe({ method, route, status }, duration);
  }

  recordAiGeneration(model: string, action: string, duration: number) {
    this.aiGenerationDuration.observe({ model, action }, duration);
  }

  recordDocumentIndexing(duration: number) {
    this.documentIndexingDuration.observe(duration);
  }

  async getMetrics(): Promise<string> {
    return this.register.metrics();
  }
}
