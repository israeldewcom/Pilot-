import { createHash, randomBytes } from 'crypto';

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export function generateApiKey(prefix: string = 'rfp_live_'): { key: string; hash: string; prefix: string } {
  const raw = randomBytes(32).toString('hex');
  const key = `${prefix}${raw}`;
  const hash = hashApiKey(key);
  const keyPrefix = key.substring(0, prefix.length + 8);
  return { key, hash, prefix: keyPrefix };
}

export function deterministicBucket(userId: string, experimentId: string): number {
  const hash = createHash('sha256').update(`${userId}:${experimentId}`).digest('hex');
  return parseInt(hash.substring(0, 8), 16) % 100;
}

export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 60);
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export function buildPaginationMeta(total: number, page: number, limit: number): PaginationMeta {
  const totalPages = Math.ceil(total / limit);
  return {
    total,
    page,
    limit,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
}

export function startOfMonth(date: Date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function endOfMonth(date: Date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

export function daysUntil(date: Date): number {
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function reciprocalRankFusion(
  denseResults: any[],
  sparseResults: any[],
  topK: number,
  k: number = 60,
): any[] {
  const scoreMap = new Map<string, { item: any; score: number }>();
  const addResults = (results: any[], weight: number = 1) => {
    results.forEach((item, idx) => {
      const id = item.id;
      const rrfScore = weight / (k + idx + 1);
      if (scoreMap.has(id)) {
        scoreMap.get(id)!.score += rrfScore;
      } else {
        scoreMap.set(id, { item, score: rrfScore });
      }
    });
  };
  addResults(denseResults, 1.0);
  addResults(sparseResults, 0.8);
  return Array.from(scoreMap.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(({ item, score }) => ({ ...item, score }));
}

export function isStatisticallySignificant(
  controlConversions: number,
  controlTotal: number,
  variantConversions: number,
  variantTotal: number,
): boolean {
  if (controlTotal < 100 || variantTotal < 100) return false;
  const p1 = controlConversions / controlTotal;
  const p2 = variantConversions / variantTotal;
  const pooled = (controlConversions + variantConversions) / (controlTotal + variantTotal);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / controlTotal + 1 / variantTotal));
  const z = Math.abs((p2 - p1) / se);
  return z > 1.96;
}

import { Injectable } from '@nestjs/common';

@Injectable()
export class TokenCounter {
  count(text: string): number {
    if (!text) return 0;
    const words = text.split(/\s+/).length;
    const chars = text.length;
    return Math.ceil((words * 1.3 + chars * 0.25) / 2);
  }

  countMessages(messages: Array<{ role: string; content: string }>): number {
    let total = 3;
    for (const msg of messages) {
      total += 4;
      total += this.count(msg.role);
      total += this.count(msg.content);
    }
    return total;
  }
}
