import {
  Injectable, CanActivate, ExecutionContext, UnauthorizedException, Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import * as jwksClient from 'jwks-rsa';
import * as jwt from 'jsonwebtoken';
import { IS_PUBLIC_KEY } from '../decorators/decorators';

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);
  private jwksClient: jwksClient.JwksClient;

  constructor(
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
  ) {
    this.jwksClient = jwksClient.default({
      jwksUri: this.configService.get('CLERK_JWKS_URL'),
      cache: true,
      cacheMaxAge: 3600000,
      rateLimit: true,
    });
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing authorization token');
    }

    const token = authHeader.split(' ')[1];

    try {
      const decoded = await this.verifyToken(token);
      request.user = {
        id: decoded.sub,
        externalId: decoded.sub,
        organizationId: decoded.org_id || decoded['org_id'],
        email: decoded.email || decoded['email_addresses']?.[0]?.email_address,
        role: decoded.org_role || 'member',
      };
      request.tenant = { id: request.user.organizationId };
      return true;
    } catch (err) {
      this.logger.warn(`Auth failed: ${err.message}`);
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  private verifyToken(token: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const getKey = (header: jwt.JwtHeader, callback: jwt.SigningKeyCallback) => {
        this.jwksClient.getSigningKey(header.kid, (err, key) => {
          if (err) return callback(err);
          callback(null, key.getPublicKey());
        });
      };

      jwt.verify(
        token,
        getKey,
        {
          algorithms: ['RS256'],
          issuer: this.configService.get('CLERK_ISSUER'),
        },
        (err, decoded) => {
          if (err) reject(err);
          else resolve(decoded);
        },
      );
    });
  }
}
