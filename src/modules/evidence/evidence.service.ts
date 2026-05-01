import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DocumentChunk } from '../../entities/entities';
import { reciprocalRankFusion } from '../../common/utils/utils';
import { CacheService } from '../../common/cache/cache.service';
import { FeatureFlagsService } from '../../common/feature-flags/feature-flags.service';

export interface ChunkResult {
  id: string; documentId: string; text: string; score: number;
  similarity?: number; document?: { id: string; filename: string }; metadata?: any;
}

@Injectable()
export class EvidenceService {
  private readonly logger = new Logger(EvidenceService.name);

  constructor(
    @InjectRepository(DocumentChunk) private chunkRepo: Repository<DocumentChunk>,
    private cacheService: CacheService,
    private featureFlags: FeatureFlagsService,
  ) {}

  async hybridSearch(queryEmbedding: number[], projectId: string, rawQuery: string, topK = 8): Promise<ChunkResult[]> {
    const cacheKey = this.cacheService.generateKey('search', projectId, rawQuery.substring(0, 50), String(topK));
    
    if (this.featureFlags.isEnabled('caching')) {
      const cached = await this.cacheService.get<ChunkResult[]>(cacheKey);
      if (cached) return cached;
    }

    const embeddingStr = `[${queryEmbedding.join(',')}]`;
    let denseResults: any[] = [];
    let sparseResults: any[] = [];

    try {
      denseResults = await this.chunkRepo.query(
        `SELECT dc.id, dc.document_id AS "documentId", dc.text,
          1 - (dc.embedding <=> $1::vector) AS similarity, dc.metadata,
          d.filename, d.original_name AS "originalName"
         FROM document_chunks dc
         JOIN documents d ON dc.document_id = d.id
         WHERE dc.project_id = $2 AND dc.embedding IS NOT NULL
         ORDER BY dc.embedding <=> $1::vector LIMIT $3`,
        [embeddingStr, projectId, topK * 2],
      );
    } catch (e) {
      this.logger.warn(`Dense search failed: ${e.message}`);
    }

    try {
      const safeQuery = rawQuery.replace(/[^\w\s]/g, ' ').trim();
      if (safeQuery) {
        sparseResults = await this.chunkRepo.query(
          `SELECT dc.id, dc.document_id AS "documentId", dc.text,
            ts_rank(dc.search_vector, plainto_tsquery('english', $1)) AS similarity, dc.metadata,
            d.filename, d.original_name AS "originalName"
           FROM document_chunks dc
           JOIN documents d ON dc.document_id = d.id
           WHERE dc.project_id = $2 AND dc.search_vector @@ plainto_tsquery('english', $1)
           ORDER BY similarity DESC LIMIT $3`,
          [safeQuery, projectId, topK * 2],
        );
      }
    } catch (e) {
      this.logger.warn(`Sparse search failed: ${e.message}`);
    }

    const merged = reciprocalRankFusion(denseResults, sparseResults, topK);
    const result = merged.map((item) => ({
      id: item.id,
      documentId: item.documentId,
      text: item.text,
      score: item.score,
      similarity: item.similarity || item.score,
      document: { id: item.documentId, filename: item.filename || item.originalName },
      metadata: item.metadata,
    }));

    if (this.featureFlags.isEnabled('caching')) {
      await this.cacheService.set(cacheKey, result, 300);
    }

    return result;
  }

  async globalSearch(queryEmbedding: number[], organizationId: string, rawQuery: string, topK = 20): Promise<ChunkResult[]> {
    const embeddingStr = `[${queryEmbedding.join(',')}]`;
    const results = await this.chunkRepo.query(
      `SELECT dc.id, dc.document_id AS "documentId", dc.text,
        1 - (dc.embedding <=> $1::vector) AS similarity, dc.metadata, d.filename
       FROM document_chunks dc
       JOIN documents d ON dc.document_id = d.id
       JOIN projects p ON dc.project_id = p.id
       WHERE p.organization_id = $2 AND dc.embedding IS NOT NULL
       ORDER BY dc.embedding <=> $1::vector LIMIT $3`,
      [embeddingStr, organizationId, topK],
    );
    return results.map((r: any) => ({ id: r.id, documentId: r.documentId, text: r.text, score: r.similarity, similarity: r.similarity, document: { id: r.documentId, filename: r.filename }, metadata: r.metadata }));
  }
}
