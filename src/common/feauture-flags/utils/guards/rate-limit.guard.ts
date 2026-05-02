import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';

@Injectable()
export class OrgRateLimitGuard implements CanActivate {
  constructor(
    private readonly configService: ConfigService,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const orgId = request.user?.organizationId;
    if (!orgId) return true;

    const path = request.route.path;
    const plan = request.user?.plan || 'free';
    const limits = { free: 50, starter: 200, pro: 500, enterprise: 2000 };
    const limit = limits[plan] || 50;

    const key = `ratelimit:org:${orgId}:${path}`;
    const currentCount = await this.redis.incr(key);
    if (currentCount === 1) {
      await this.redis.expire(key, 60);
    }

    if (currentCount > limit) {
      throw new HttpException('Org rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }
}
