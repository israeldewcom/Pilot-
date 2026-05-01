import { Module } from '@nestjs/common';
import { DocumentIndexingProcessor } from './processors/document-indexing.processor';
import { ComplianceScanProcessor } from './processors/compliance-scan.processor';
import { AiAutoFixProcessor } from './processors/ai-auto-fix.processor';
import { WinScoreProcessor } from './processors/win-score.processor';
import { WebhookDeliveryProcessor } from './processors/webhook-delivery.processor';

@Module({
  providers: [
    DocumentIndexingProcessor,
    ComplianceScanProcessor,
    AiAutoFixProcessor,
    WinScoreProcessor,
    WebhookDeliveryProcessor,
  ],
})
export class JobsModule {}
