import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Document } from '../../entities/entities';
import { DocumentChunk } from '../../entities/entities';
import { Notification, NotificationType } from '../../entities/entities';
import { S3Service } from '../../modules/tools/tools';
import { TextExtractionService } from '../../modules/tools/tools';
import { AiService } from '../../modules/ai/ai.service';
import { TokenCounter } from '../../common/utils/utils';
import { MetricsService } from '../../monitoring/metrics.service';

@Processor('document-indexing', { concurrency: 3 })
export class DocumentIndexingProcessor extends WorkerHost {
  private readonly logger = new Logger(DocumentIndexingProcessor.name);

  constructor(
    @InjectRepository(Document) private documentRepo: Repository<Document>,
    @InjectRepository(DocumentChunk) private chunkRepo: Repository<DocumentChunk>,
    @InjectRepository(Notification) private notifRepo: Repository<Notification>,
    private s3Service: S3Service,
    private textExtractionService: TextExtractionService,
    private aiService: AiService,
    private tokenCounter: TokenCounter,
    private dataSource: DataSource,
    private eventEmitter: EventEmitter2,
    private metricsService: MetricsService,
  ) {
    super();
  }

  async process(job: Job<{
    documentId: string;
    projectId: string;
    organizationId: string;
    s3Key: string;
    mimeType: string;
    filename: string;
  }>) {
    const { documentId, projectId, organizationId, s3Key, mimeType, filename } = job.data;
    this.logger.log(`Processing document: ${documentId} (${filename})`);

    const startTime = Date.now();
    await this.documentRepo.update(documentId, { status: 'processing' });
    await job.updateProgress(10);

    try {
      const buffer = await this.s3Service.getFileBuffer(s3Key);
      await job.updateProgress(25);

      const rawText = await this.textExtractionService.extractText(buffer, mimeType, filename);
      if (!rawText || rawText.length < 10) {
        throw new Error('No extractable text found in document');
      }
      await job.updateProgress(45);

      const chunks = this.textExtractionService.chunkText(rawText, 512, 64);
      this.logger.log(`Document ${documentId}: ${chunks.length} chunks created`);
      await job.updateProgress(55);

      const chunkEntities: Partial<DocumentChunk>[] = [];
      const batchSize = 20;

      for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize);
        const embeddings = await Promise.all(
          batch.map((text) => this.aiService.generateEmbedding(text).catch(() => null)),
        );

        for (let j = 0; j < batch.length; j++) {
          chunkEntities.push({
            documentId,
            projectId,
            chunkIndex: i + j,
            text: batch[j],
            tokenCount: this.tokenCounter.count(batch[j]),
            embedding: embeddings[j] ? `[${embeddings[j].join(',')}]` : null,
            embeddingModel: 'text-embedding-3-small',
          });
        }

        const progress = 55 + Math.round(((i + batchSize) / chunks.length) * 35);
        await job.updateProgress(Math.min(progress, 90));
      }

      await this.chunkRepo.delete({ documentId });
      await this.dataSource.transaction(async (manager) => {
        for (const chunk of chunkEntities) {
          await manager.query(
            `INSERT INTO document_chunks
              (id, document_id, project_id, chunk_index, text, embedding, token_count, embedding_model, search_vector, created_at)
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5::vector, $6, $7,
               to_tsvector('english', $4), NOW())`,
            [
              chunk.documentId, chunk.projectId, chunk.chunkIndex,
              chunk.text, chunk.embedding || null,
              chunk.tokenCount, chunk.embeddingModel,
            ],
          );
        }
      });

      await this.documentRepo.update(documentId, {
        status: 'indexed',
        chunkCount: chunkEntities.length,
        extractedText: rawText.substring(0, 50000),
        sizeBytes: buffer.length,
      });

      await job.updateProgress(100);

      const doc = await this.documentRepo.findOne({ where: { id: documentId } });
      if (doc?.uploadedBy) {
        await this.notifRepo.save({
          userId: doc.uploadedBy,
          organizationId,
          type: NotificationType.DOCUMENT_INDEXED,
          title: 'Document Indexed',
          description: `"${filename}" has been processed and is now searchable.`,
          actionUrl: `/projects/${projectId}/documents`,
          actionLabel: 'View Documents',
        });
      }

      this.eventEmitter.emit('document.indexed', { documentId, projectId, organizationId, chunkCount: chunkEntities.length });
      
      const duration = (Date.now() - startTime) / 1000;
      if (this.metricsService) {
        this.metricsService.recordDocumentIndexing(duration);
      }
      
      this.logger.log(`Document ${documentId} indexed: ${chunkEntities.length} chunks in ${duration}s`);

    } catch (err) {
      this.logger.error(`Document indexing failed for ${documentId}: ${err.message}`);
      await this.documentRepo.update(documentId, { status: 'failed', errorMessage: err.message });
      throw err;
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    this.logger.error(`Job ${job.id} failed after ${job.attemptsMade} attempts: ${err.message}`);
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.log(`Job ${job.id} completed in ${job.processedOn - job.timestamp}ms`);
  }
}
