import { Injectable, Logger, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

  async get<T>(key: string): Promise<T | undefined> {
    try {
      return await this.cacheManager.get<T>(key);
    } catch (e) {
      this.logger.warn(`Cache get error for key ${key}: ${e.message}`);
      return undefined;
    }
  }

  async set(key: string, value: any, ttl = 300): Promise<void> {
    try {
      await this.cacheManager.set(key, value, ttl);
    } catch (e) {
      this.logger.warn(`Cache set error for key ${key}: ${e.message}`);
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.cacheManager.del(key);
    } catch (e) {
      this.logger.warn(`Cache del error for key ${key}: ${e.message}`);
    }
  }

  generateKey(...parts: string[]): string {
    return parts.join(':');
  }
}
