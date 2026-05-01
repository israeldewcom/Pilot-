import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { RedisModule } from '@nestjs-modules/ioredis';
import { APP_GUARD, APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';

import { envValidationSchema } from './config/env.validation';
import { getReadOnlyConfig } from './config/database-read.config';

import {
  Organization, User, Membership, Project, ProjectOutline, OutlineVersion,
  ProjectMembership, Document, DocumentChunk, AiGenerationLog,
  ComplianceRequirement, ComplianceCheck, Competitor, CompetitorAnalysis,
  Experiment, ExperimentAssignment, Notification, NotificationPreference,
  Webhook, WebhookDelivery, ApiKey, AuditLog, Billing, PromoCode, PromoUsage,
  CircuitBreakerState, CompanyProfile, TeamActivityLog, AdminAuditLog,
  PlatformAnnouncement, FeatureFlagOverride, DunningEvent, GDPRRequest,
  ReferralTracking, ApiUsageLog, UserSession, SystemHealthCheck, SamOpportunity,
} from './entities/entities';

import { HttpExceptionFilter } from './common/filters/filters';
import { LoggingInterceptor, TransformInterceptor } from './common/filters/filters';
import { AuthGuard } from './common/guards/guards';
import { RolesGuard } from './common/guards/guards';
import { RequestIdMiddleware } from './common/filters/filters';

import { ProjectsModule } from './modules/projects/projects.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { AiModule } from './modules/ai/ai.module';
import { EvidenceModule } from './modules/evidence/evidence.module';
import { ComplianceModule } from './modules/compliance/compliance.module';
import { ComplianceExportModule } from './modules/compliance/compliance-export.module';
import { BillingModule } from './modules/billing/billing.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { ExperimentsModule } from './modules/experiments/experiments.module';
import { ToolsModule } from './modules/tools/tools.module';
import { EmailModule } from './modules/email/email.module';
import { CompetitorsModule } from './modules/competitors/competitors.module';
import { CompanyModule } from './modules/company/company.module';
import { AdminModule } from './modules/admin/admin.module';
import { HealthModule } from './modules/health/health.module';
import { WinScoreModule } from './modules/win-score/win-score.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { SamGovModule } from './modules/sam-gov/sam-gov.module';
import { VersioningModule } from './modules/versioning/versioning.module';

import { AppCacheModule } from './common/cache/cache.module';
import { MetricsModule } from './monitoring/metrics.module';
import { FeatureFlagsModule } from './common/feature-flags/feature-flags.module';

import { CronModule } from './jobs/cron/cron.module';
import { JobsModule } from './jobs/jobs.module';

const ALL_ENTITIES = [
  Organization, User, Membership, Project, ProjectOutline, OutlineVersion,
  ProjectMembership, Document, DocumentChunk, AiGenerationLog,
  ComplianceRequirement, ComplianceCheck, Competitor, CompetitorAnalysis,
  Experiment, ExperimentAssignment, Notification, NotificationPreference,
  Webhook, WebhookDelivery, ApiKey, AuditLog, Billing, PromoCode, PromoUsage,
  CircuitBreakerState, CompanyProfile, TeamActivityLog, AdminAuditLog,
  PlatformAnnouncement, FeatureFlagOverride, DunningEvent, GDPRRequest,
  ReferralTracking, ApiUsageLog, UserSession, SystemHealthCheck, SamOpportunity,
];

const ALL_QUEUES = [
  { name: 'document-indexing' },
  { name: 'compliance-scanner' },
  { name: 'ai-auto-fix' },
  { name: 'win-score-recalc' },
  { name: 'webhook-delivery' },
];

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
      validationOptions: { allowUnknown: false, abortEarly: false },
    }),

    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('DB_HOST'),
        port: configService.get<number>('DB_PORT', 5432),
        username: configService.get('DB_USERNAME'),
        password: configService.get('DB_PASSWORD'),
        database: configService.get('DB_DATABASE'),
        ssl: configService.get('DB_SSL') === 'true' ? { rejectUnauthorized: false } : false,
        entities: ALL_ENTITIES,
        migrations: [__dirname + '/database/migrations/**/*{.ts,.js}'],
        migrationsRun: configService.get('NODE_ENV') === 'production',
        synchronize: false,
        logging: configService.get('NODE_ENV') === 'development' ? ['error', 'warn'] : ['error'],
        extra: {
          max: configService.get<number>('DB_POOL_MAX', 10),
          min: configService.get<number>('DB_POOL_MIN', 2),
          idleTimeoutMillis: 30000,
        },
      }),
      inject: [ConfigService],
    }),

    TypeOrmModule.forRootAsync({
      name: 'readonly',
      imports: [ConfigModule],
      useFactory: getReadOnlyConfig,
      inject: [ConfigService],
    }),

    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get('REDIS_HOST', 'localhost'),
          port: configService.get<number>('REDIS_PORT', 6379),
          password: configService.get('REDIS_PASSWORD') || undefined,
          db: configService.get<number>('REDIS_DB', 0),
          maxRetriesPerRequest: null,
          enableReadyCheck: false,
        },
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: { age: 7 * 24 * 3600, count: 1000 },
          removeOnFail: { age: 30 * 24 * 3600 },
        },
      }),
      inject: [ConfigService],
    }),

    BullModule.registerQueue(...ALL_QUEUES),

    RedisModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        config: {
          host: config.get('REDIS_HOST', 'localhost'),
          port: config.get('REDIS_PORT', 6379),
          password: config.get('REDIS_PASSWORD') || undefined,
        },
      }),
      inject: [ConfigService],
    }),

    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot({ wildcard: true, delimiter: '.', maxListeners: 20 }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => [
        {
          ttl: configService.get<number>('RATE_LIMIT_TTL', 60) * 1000,
          limit: configService.get<number>('RATE_LIMIT_MAX', 100),
        },
      ],
      inject: [ConfigService],
    }),

    AppCacheModule,
    MetricsModule,
    FeatureFlagsModule,

    ToolsModule,
    EmailModule,
    ProjectsModule,
    DocumentsModule,
    AiModule,
    EvidenceModule,
    ComplianceModule,
    ComplianceExportModule,
    BillingModule,
    NotificationsModule,
    WebhooksModule,
    ExperimentsModule,
    CompetitorsModule,
    CompanyModule,
    AdminModule,
    HealthModule,
    WinScoreModule,
    AnalyticsModule,
    SamGovModule,
    VersioningModule,

    CronModule,
    JobsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
