import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Document } from '../../entities/entities';
import { DocumentChunk } from '../../entities/entities';
import { S3Service } from '../tools/tools';
import { PostHogService } from '../analytics/posthog.service';

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    @InjectRepository(Document) private documentRepo: Repository<Document>,
    @InjectRepository(DocumentChunk) private chunkRepo: Repository<DocumentChunk>,
    @InjectQueue('document-indexing') private indexingQueue: Queue,
    private s3Service: S3Service,
    private eventEmitter: EventEmitter2,
    private posthog: PostHogService,
  ) {}

  async uploadDocument(
    file: Express.Multer.File,
    projectId: string,
    organizationId: string,
    userId: string,
  ): Promise<Document> {
    const { key, url, sizeBytes } = await this.s3Service.uploadFile(
      file.buffer,
      file.originalname,
      file.mimetype,
      organizationId,
    );

    const document = await this.documentRepo.save({
      projectId,
      organizationId,
      filename: file.originalname,
      originalName: file.originalname,
      mimeType: file.mimetype,
      s3Key: key,
      s3Url: url,
      sizeBytes,
      uploadedBy: userId,
      status: 'pending',
    });

    await this.indexingQueue.add('index-document', {
      documentId: document.id,
      projectId,
      organizationId,
      s3Key: key,
      mimeType: file.mimetype,
      filename: file.originalname,
    }, { priority: 2 });

    this.posthog.track(userId, 'document.uploaded', {
      mimeType: file.mimetype,
      sizeBytes,
      projectId,
    });

    this.logger.log(`Document uploaded and queued: ${document.id}`);
    return document;
  }

  async getPresignedUpload(
    filename: string,
    contentType: string,
    projectId: string,
    organizationId: string,
    userId: string,
  ) {
    const { uploadUrl, key } = await this.s3Service.getPresignedUploadUrl(filename, contentType, organizationId);

    const document = await this.documentRepo.save({
      projectId, organizationId,
      filename, originalName: filename, mimeType: contentType,
      s3Key: key, uploadedBy: userId, status: 'pending',
    });

    return { uploadUrl, documentId: document.id, key };
  }

  async processAfterUpload(documentId: string, organizationId: string): Promise<void> {
    const doc = await this.documentRepo.findOne({ where: { id: documentId, organizationId } });
    if (!doc) throw new NotFoundException('Document not found');

    await this.indexingQueue.add('index-document', {
      documentId,
      projectId: doc.projectId,
      organizationId,
      s3Key: doc.s3Key,
      mimeType: doc.mimeType,
      filename: doc.filename,
    }, { priority: 2 });
  }

  async findAll(projectId: string, organizationId: string): Promise<Document[]> {
    return this.documentRepo.find({
      where: { projectId, organizationId },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string, organizationId: string): Promise<Document> {
    const doc = await this.documentRepo.findOne({ where: { id, organizationId } });
    if (!doc) throw new NotFoundException('Document not found');
    return doc;
  }

  async getDownloadUrl(id: string, organizationId: string): Promise<{ url: string }> {
    const doc = await this.findOne(id, organizationId);
    const url = await this.s3Service.getPresignedDownloadUrl(doc.s3Key);
    return { url };
  }

  async delete(id: string, organizationId: string): Promise<void> {
    const doc = await this.findOne(id, organizationId);
    await this.chunkRepo.delete({ documentId: id });
    if (doc.s3Key) {
      await this.s3Service.deleteFile(doc.s3Key).catch((e) => this.logger.warn(`S3 delete failed: ${e.message}`));
    }
    await this.documentRepo.delete(id);
  }

  async getIndexingStatus(documentId: string, organizationId: string) {
    const doc = await this.findOne(documentId, organizationId);
    const chunkCount = await this.chunkRepo.count({ where: { documentId } });
    return { status: doc.status, chunkCount, errorMessage: doc.errorMessage };
  }

  async updateStatus(documentId: string, status: string, metadata?: Partial<Document>): Promise<void> {
    await this.documentRepo.update(documentId, { status, ...metadata });
  }
}
