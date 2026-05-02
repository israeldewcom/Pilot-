import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, Unique, PrimaryColumn } from 'typeorm';

export enum OrgRole { OWNER = 'owner', ADMIN = 'admin', EDITOR = 'editor', VIEWER = 'viewer' }
export enum ProjectStatus { DRAFT = 'draft', IN_PROGRESS = 'in_progress', REVIEW = 'review', COMPLETED = 'completed', WON = 'won', LOST = 'lost' }
export enum ExperimentStatus { DRAFT = 'draft', ACTIVE = 'active', PAUSED = 'paused', COMPLETED = 'completed' }
export enum SuccessMetric { WIN_RATE = 'win_rate', ACCEPTANCE_RATE = 'acceptance_rate', EDIT_DISTANCE = 'edit_distance', GENERATION_TIME = 'generation_time' }
export enum NotificationType { AI_DRAFT_COMPLETE = 'ai.draft.complete', COMPLIANCE_ALERT = 'compliance.alert', DEADLINE_APPROACHING = 'deadline.approaching', PAYMENT_PROCESSED = 'payment.processed', PAYMENT_FAILED = 'payment.failed', DOCUMENT_INDEXED = 'document.indexed', TEAM_INVITATION = 'team.invitation', EXPERIMENT_COMPLETED = 'experiment.completed', TRIAL_EXPIRING = 'trial.expiring', USAGE_LIMIT = 'usage.limit', SYSTEM_ANNOUNCEMENT = 'system.announcement', ADMIN_ALERT = 'admin.alert', SAM_OPPORTUNITY = 'sam.opportunity' }
export enum WebhookEvent { AI_GENERATION_COMPLETED = 'ai.generation.completed', DOCUMENT_PROCESSED = 'document.processed', DOCUMENT_INDEXED = 'document.indexed', COMPLIANCE_ALERT = 'compliance.alert', COMPLIANCE_SCAN_COMPLETED = 'compliance.scan.completed', PAYMENT_SUCCEEDED = 'payment.succeeded', PAYMENT_FAILED = 'payment.failed', SUBSCRIPTION_UPDATED = 'subscription.updated', PROJECT_CREATED = 'project.created', PROJECT_UPDATED = 'project.updated' }
export enum DeliveryStatus { PENDING = 'pending', SUCCESS = 'success', FAILED = 'failed', RETRYING = 'retrying' }
export enum DiscountType { PERCENTAGE = 'percentage', FIXED = 'fixed', TRIAL_EXTENSION = 'trial_extension' }
export enum CircuitState { CLOSED = 'closed', OPEN = 'open', HALF_OPEN = 'half_open' }
export enum AdminRole { SUPER_ADMIN = 'super_admin', SUPPORT_ADMIN = 'support_admin', BILLING_ADMIN = 'billing_admin', READ_ONLY_ADMIN = 'read_only_admin' }
export enum FeatureFlagTarget { GLOBAL = 'global', ORGANIZATION = 'organization', USER = 'user' }
export enum DunningStatus { ACTIVE = 'active', PAUSED = 'paused', RESOLVED = 'resolved', ESCALATED = 'escalated' }
export enum GDPRRequestType { ERASURE = 'erasure', EXPORT = 'export', RECTIFICATION = 'rectification' }
export enum GDPRRequestStatus { PENDING = 'pending', PROCESSING = 'processing', COMPLETED = 'completed', REJECTED = 'rejected' }

@Entity('organizations')
export class Organization {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ unique: true }) name: string;
  @Column({ unique: true, nullable: true }) slug: string;
  @Column({ nullable: true }) logoUrl: string;
  @Column({ default: 'free' }) plan: string;
  @Column({ nullable: true }) stripeCustomerId: string;
  @Column({ nullable: true }) stripeSubscriptionId: string;
  @Column({ default: 'trialing' }) subscriptionStatus: string;
  @Column({ type: 'timestamptz', nullable: true }) trialEndsAt: Date;
  @Column({ type: 'timestamptz', nullable: true }) subscriptionEndsAt: Date;
  @Column({ nullable: true }) billingEmail: string;
  @Column({ default: true }) isActive: boolean;
  @Column({ default: false }) isSuspended: boolean;
  @Column({ type: 'timestamptz', nullable: true }) suspendedAt: Date;
  @Column({ nullable: true }) suspendedReason: string;
  @Column({ nullable: true }) suspendedBy: string;
  @Column({ type: 'jsonb', nullable: true }) customLimits: Record<string, any>;
  @Column({ type: 'jsonb', nullable: true }) metadata: Record<string, any>;
  @Column({ default: 0 }) aiTokensUsed: number;
  @Column({ default: 5000000 }) aiTokensLimit: number;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ unique: true }) @Index() externalId: string;
  @Column({ unique: true }) @Index() email: string;
  @Column({ nullable: true }) name: string;
  @Column({ nullable: true }) firstName: string;
  @Column({ nullable: true }) lastName: string;
  @Column({ nullable: true }) avatarUrl: string;
  @Column({ default: 'en' }) locale: string;
  @Column({ default: true }) isActive: boolean;
  @Column({ default: false }) isPlatformAdmin: boolean;
  @Column({ type: 'enum', enum: AdminRole, nullable: true }) adminRole: AdminRole;
  @Column({ default: false }) isBanned: boolean;
  @Column({ type: 'timestamptz', nullable: true }) bannedAt: Date;
  @Column({ nullable: true }) bannedReason: string;
  @Column({ nullable: true }) bannedBy: string;
  @Column({ type: 'timestamptz', nullable: true }) lastLoginAt: Date;
  @Column({ type: 'jsonb', nullable: true }) metadata: Record<string, any>;
  @Column({ nullable: true }) referredBy: string;
  @Column({ nullable: true, unique: true }) referralCode: string;
  @Column({ default: 0 }) referralCredits: number;
  @Column({ nullable: true }) totpSecret: string;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}

@Entity('memberships')
@Unique(['userId', 'organizationId'])
export class Membership {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() @Index() userId: string;
  @Column() @Index() organizationId: string;
  @Column({ type: 'enum', enum: OrgRole, default: OrgRole.VIEWER }) role: OrgRole;
  @Column({ default: false }) isDefault: boolean;
  @Column({ type: 'timestamptz', nullable: true }) acceptedAt: Date;
  @CreateDateColumn() invitedAt: Date;
}

@Entity('projects')
export class Project {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() @Index() organizationId: string;
  @Column() name: string;
  @Column({ nullable: true }) client: string;
  @Column({ nullable: true }) slug: string;
  @Column({ type: 'timestamptz', nullable: true }) dueDate: Date;
  @Column('decimal', { precision: 15, scale: 2, nullable: true }) contractValue: number;
  @Column({ type: 'enum', enum: ['high', 'medium', 'low'], default: 'medium' }) priority: string;
  @Column({ type: 'enum', enum: ProjectStatus, default: ProjectStatus.DRAFT }) status: ProjectStatus;
  @Column('decimal', { precision: 5, scale: 2, nullable: true }) winProbability: number;
  @Column({ type: 'jsonb', nullable: true }) winScoreFactors: Record<string, any>;
  @Column() ownerId: string;
  @Column({ default: false }) archived: boolean;
  @Column({ type: 'timestamptz', nullable: true }) archivedAt: Date;
  @Column({ default: false }) deleted: boolean;
  @Column({ type: 'timestamptz', nullable: true }) deletedAt: Date;
  @Column({ type: 'text', nullable: true }) rfpText: string;
  @Column({ type: 'jsonb', nullable: true }) tags: string[];
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}

@Entity('project_outlines')
export class ProjectOutline {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() @Index() projectId: string;
  @Column() title: string;
  @Column({ nullable: true }) description: string;
  @Column({ default: 0 }) orderIndex: number;
  @Column({ type: 'text', nullable: true }) content: string;
  @Column({ type: 'text', nullable: true }) aiDraft: string;
  @Column({ default: 'empty' }) status: string;
  @Column({ nullable: true }) lastEditedBy: string;
  @Column({ type: 'jsonb', nullable: true }) metadata: Record<string, any>;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}

@Entity('outline_versions')
export class OutlineVersion {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() @Index() outlineId: string;
  @Column() @Index() projectId: string;
  @Column('text') content: string;
  @Column() version: number;
  @Column() savedBy: string;
  @Column({ nullable: true }) changeNote: string;
  @CreateDateColumn() createdAt: Date;
}

@Entity('project_memberships')
@Unique(['projectId', 'userId'])
export class ProjectMembership {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() @Index() projectId: string;
  @Column() @Index() userId: string;
  @Column({ default: 'viewer' }) role: string;
  @CreateDateColumn() joinedAt: Date;
}

@Entity('documents')
export class Document {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() @Index() projectId: string;
  @Column() @Index() organizationId: string;
  @Column() filename: string;
  @Column({ nullable: true }) originalName: string;
  @Column({ nullable: true }) mimeType: string;
  @Column({ nullable: true }) s3Key: string;
  @Column({ nullable: true }) s3Url: string;
  @Column({ default: 0 }) sizeBytes: number;
  @Column({ default: 'pending' }) status: string;
  @Column({ default: 0 }) chunkCount: number;
  @Column({ nullable: true }) uploadedBy: string;
  @Column({ type: 'text', nullable: true }) extractedText: string;
  @Column({ type: 'jsonb', nullable: true }) metadata: Record<string, any>;
  @Column({ nullable: true }) errorMessage: string;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}

@Entity('document_chunks')
export class DocumentChunk {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() @Index() documentId: string;
  @Column() @Index() projectId: string;
  @Column() @Index() chunkIndex: number;
  @Column('text') text: string;
  @Column({ type: 'vector', length: 1536, nullable: true }) embedding: string;
  @Column({ default: 0 }) tokenCount: number;
  @Column({ default: 'text-embedding-3-small' }) embeddingModel: string;
  @Column({ type: 'tsvector', nullable: true, select: false }) searchVector: string;
  @Column({ type: 'jsonb', nullable: true }) metadata: Record<string, any>;
  @CreateDateColumn() createdAt: Date;
}

@Entity('ai_generation_logs')
export class AiGenerationLog {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() @Index() organizationId: string;
  @Column() @Index() userId: string;
  @Column({ nullable: true }) projectId: string;
  @Column({ nullable: true }) sectionId: string;
  @Column() model: string;
  @Column({ default: 0 }) promptTokens: number;
  @Column({ default: 0 }) completionTokens: number;
  @Column({ default: 0 }) totalTokens: number;
  @Column('decimal', { precision: 10, scale: 6, default: 0 }) cost: number;
  @Column({ nullable: true }) action: string;
  @Column({ default: 'success' }) status: string;
  @Column({ nullable: true }) errorMessage: string;
  @Column({ type: 'jsonb', nullable: true }) metadata: Record<string, any>;
  @CreateDateColumn() @Index() createdAt: Date;
}

@Entity('compliance_requirements')
export class ComplianceRequirement {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() @Index() projectId: string;
  @Column('text') requirementText: string;
  @Column({ nullable: true }) category: string;
  @Column({ default: 'medium' }) severity: string;
  @Column({ default: 'needs_review' }) status: string;
  @Column({ nullable: true }) sectionRef: string;
  @Column({ type: 'text', nullable: true }) aiSuggestion: string;
  @Column({ type: 'text', nullable: true }) evidence: string;
  @Column({ nullable: true }) assignedTo: string;
  @Column({ nullable: true }) sourcePageNumber: number;
  @Column({ type: 'timestamptz', nullable: true }) lastCheckedAt: Date;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}

@Entity('compliance_checks')
export class ComplianceCheck {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() @Index() projectId: string;
  @Column() requirementId: string;
  @Column({ default: 'pending' }) result: string;
  @Column({ type: 'text', nullable: true }) details: string;
  @Column({ type: 'jsonb', nullable: true }) metadata: Record<string, any>;
  @CreateDateColumn() checkedAt: Date;
}

@Entity('competitors')
export class Competitor {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() @Index() organizationId: string;
  @Column() name: string;
  @Column({ nullable: true }) website: string;
  @Column({ nullable: true }) revenue: string;
  @Column({ nullable: true }) employees: string;
  @Column('text', { nullable: true }) strengths: string;
  @Column('text', { nullable: true }) weaknesses: string;
  @Column({ type: 'simple-array', nullable: true }) naicsCodes: string[];
  @Column({ type: 'jsonb', nullable: true }) metadata: Record<string, any>;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}

@Entity('competitor_analyses')
export class CompetitorAnalysis {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() @Index() competitorId: string;
  @Column() @Index() projectId: string;
  @Column('text') analysis: string;
  @Column('text', { nullable: true }) counterNarrative: string;
  @Column({ type: 'jsonb', nullable: true }) strengths: string[];
  @Column({ type: 'jsonb', nullable: true }) weaknesses: string[];
  @Column({ type: 'jsonb', nullable: true }) opportunities: string[];
  @Column({ type: 'jsonb', nullable: true }) threats: string[];
  @Column({ nullable: true }) generatedBy: string;
  @CreateDateColumn() createdAt: Date;
}

@Entity('experiments')
export class Experiment {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() @Index() organizationId: string;
  @Column() name: string;
  @Column({ nullable: true }) description: string;
  @Column() section: string;
  @Column('text') controlPrompt: string;
  @Column('text') variantPrompt: string;
  @Column({ default: 50 }) trafficSplit: number;
  @Column({ type: 'enum', enum: SuccessMetric, default: SuccessMetric.WIN_RATE }) successMetric: SuccessMetric;
  @Column({ type: 'enum', enum: ExperimentStatus, default: ExperimentStatus.DRAFT }) status: ExperimentStatus;
  @Column({ type: 'timestamptz', nullable: true }) startedAt: Date;
  @Column({ type: 'timestamptz', nullable: true }) endedAt: Date;
  @Column({ type: 'jsonb', nullable: true }) results: Record<string, any>;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}

@Entity('experiment_assignments')
@Unique(['experimentId', 'userId'])
export class ExperimentAssignment {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() @Index() experimentId: string;
  @Column() @Index() userId: string;
  @Column() variant: string;
  @Column({ type: 'jsonb', nullable: true }) outcome: Record<string, any>;
  @Column({ type: 'timestamptz', nullable: true }) convertedAt: Date;
  @CreateDateColumn() assignedAt: Date;
}

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() @Index() userId: string;
  @Column() @Index() organizationId: string;
  @Column({ type: 'enum', enum: NotificationType }) type: NotificationType;
  @Column() title: string;
  @Column('text', { nullable: true }) description: string;
  @Column({ type: 'jsonb', nullable: true }) metadata: Record<string, any>;
  @Column({ default: false }) isRead: boolean;
  @Column({ default: false }) isArchived: boolean;
  @Column({ nullable: true }) actionUrl: string;
  @Column({ nullable: true }) actionLabel: string;
  @CreateDateColumn() @Index() createdAt: Date;
}

@Entity('notification_preferences')
@Unique(['userId', 'type'])
export class NotificationPreference {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() @Index() userId: string;
  @Column() type: string;
  @Column({ default: true }) inApp: boolean;
  @Column({ default: false }) email: boolean;
  @Column({ default: false }) sms: boolean;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}

@Entity('webhooks')
export class Webhook {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() @Index() organizationId: string;
  @Column() name: string;
  @Column() url: string;
  @Column({ nullable: true }) secret: string;
  @Column({ type: 'enum', enum: WebhookEvent, array: true, default: [] }) events: WebhookEvent[];
  @Column({ default: true }) isActive: boolean;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}

@Entity('webhook_deliveries')
export class WebhookDelivery {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() @Index() webhookId: string;
  @Column() event: string;
  @Column({ type: 'jsonb' }) payload: Record<string, any>;
  @Column({ type: 'enum', enum: DeliveryStatus, default: DeliveryStatus.PENDING }) status: DeliveryStatus;
  @Column({ nullable: true }) responseCode: number;
  @Column({ type: 'text', nullable: true }) responseBody: string;
  @Column({ type: 'text', nullable: true }) errorMessage: string;
  @Column({ default: 0 }) attemptCount: number;
  @Column({ type: 'timestamptz', nullable: true }) nextRetryAt: Date;
  @Column({ type: 'timestamptz', nullable: true }) completedAt: Date;
  @CreateDateColumn() @Index() createdAt: Date;
}

@Entity('api_keys')
export class ApiKey {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() @Index() userId: string;
  @Column() @Index() organizationId: string;
  @Column() name: string;
  @Column({ unique: true }) @Index() keyHash: string;
  @Column({ nullable: true }) keyPrefix: string;
  @Column({ type: 'simple-array', default: 'read,write' }) scopes: string[];
  @Column({ default: true }) isActive: boolean;
  @Column({ type: 'timestamptz', nullable: true }) lastUsedAt: Date;
  @Column({ type: 'timestamptz', nullable: true }) expiresAt: Date;
  @CreateDateColumn() createdAt: Date;
}

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() @Index() organizationId: string;
  @Column({ nullable: true }) userId: string;
  @Column() action: string;
  @Column() resource: string;
  @Column({ nullable: true }) resourceId: string;
  @Column({ type: 'jsonb', nullable: true }) details: Record<string, any>;
  @Column({ nullable: true }) ipAddress: string;
  @Column({ nullable: true }) userAgent: string;
  @CreateDateColumn() @Index() createdAt: Date;
}

@Entity('billings')
export class Billing {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() @Index() organizationId: string;
  @Column() stripeInvoiceId: string;
  @Column() amount: number;
  @Column() currency: string;
  @Column() status: string;
  @Column({ nullable: true }) pdfUrl: string;
  @Column({ nullable: true }) period: string;
  @CreateDateColumn() createdAt: Date;
}

@Entity('promo_codes')
export class PromoCode {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ unique: true }) code: string;
  @Column({ type: 'enum', enum: DiscountType }) discountType: DiscountType;
  @Column('decimal', { precision: 5, scale: 2 }) discountValue: number;
  @Column({ default: 1000 }) maxRedemptions: number;
  @Column({ default: 0 }) currentRedemptions: number;
  @Column({ type: 'timestamptz', nullable: true }) expiresAt: Date;
  @Column({ default: true }) isActive: boolean;
  @Column({ type: 'simple-array', nullable: true }) applicablePlans: string[];
  @CreateDateColumn() createdAt: Date;
}

@Entity('promo_usages')
@Unique(['promoCodeId', 'organizationId'])
export class PromoUsage {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() @Index() promoCodeId: string;
  @Column() @Index() organizationId: string;
  @CreateDateColumn() appliedAt: Date;
}

@Entity('circuit_breaker_states')
export class CircuitBreakerState {
  @PrimaryColumn() serviceName: string;
  @Column({ type: 'enum', enum: CircuitState, default: CircuitState.CLOSED }) state: CircuitState;
  @Column({ default: 0 }) failureCount: number;
  @Column({ type: 'timestamptz', nullable: true }) lastFailureTime: Date;
  @Column({ type: 'timestamptz', nullable: true }) lastSuccessTime: Date;
  @Column({ type: 'timestamptz', nullable: true }) lastAttemptAt: Date;
  @Column({ type: 'jsonb', nullable: true }) metadata: Record<string, any>;
  @UpdateDateColumn() updatedAt: Date;
}

@Entity('company_profiles')
export class CompanyProfile {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() @Index() organizationId: string;
  @Column() companyName: string;
  @Column({ nullable: true }) cageCode: string;
  @Column({ nullable: true }) dunsUei: string;
  @Column({ nullable: true }) naicsCode: string;
  @Column({ nullable: true }) smallBusinessStatus: string;
  @Column('text', { nullable: true }) differentiators: string;
  @Column('text', { nullable: true }) pastPerformance: string;
  @Column({ nullable: true }) website: string;
  @Column({ nullable: true }) address: string;
  @Column({ nullable: true }) phone: string;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}

@Entity('team_activity_logs')
export class TeamActivityLog {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() @Index() organizationId: string;
  @Column() @Index() userId: string;
  @Column() action: string;
  @Column({ nullable: true }) targetUserId: string;
  @Column({ type: 'jsonb', nullable: true }) details: Record<string, any>;
  @CreateDateColumn() createdAt: Date;
}

@Entity('admin_audit_logs')
export class AdminAuditLog {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() @Index() adminId: string;
  @Column() adminEmail: string;
  @Column() adminRole: string;
  @Column({ nullable: true }) @Index() organizationId: string;
  @Column({ nullable: true }) targetUserId: string;
  @Column() action: string;
  @Column() resource: string;
  @Column({ nullable: true }) resourceId: string;
  @Column({ type: 'jsonb', nullable: true }) details: Record<string, any>;
  @Column() reason: string;
  @Column({ nullable: true }) ipAddress: string;
  @Column({ nullable: true }) userAgent: string;
  @CreateDateColumn() @Index() createdAt: Date;
}

@Entity('platform_announcements')
export class PlatformAnnouncement {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() title: string;
  @Column('text') description: string;
  @Column({ default: 'info' }) type: string;
  @Column({ default: 'in_app' }) deliveryMethod: string;
  @Column({ type: 'simple-array', nullable: true }) targetOrgs: string[];
  @Column({ type: 'simple-array', nullable: true }) targetPlans: string[];
  @Column({ nullable: true }) actionUrl: string;
  @Column({ nullable: true }) actionLabel: string;
  @Column({ default: true }) isActive: boolean;
  @Column({ default: false }) isDismissible: boolean;
  @Column({ type: 'timestamptz', nullable: true }) expiresAt: Date;
  @Column() createdBy: string;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}

@Entity('feature_flag_overrides')
@Unique(['flag', 'targetType', 'targetId'])
export class FeatureFlagOverride {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() flag: string;
  @Column({ type: 'enum', enum: FeatureFlagTarget, default: FeatureFlagTarget.ORGANIZATION }) targetType: FeatureFlagTarget;
  @Column() targetId: string;
  @Column({ default: true }) enabled: boolean;
  @Column({ nullable: true }) setBy: string;
  @Column({ type: 'jsonb', nullable: true }) config: Record<string, any>;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}

@Entity('dunning_events')
export class DunningEvent {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() @Index() organizationId: string;
  @Column() stripeInvoiceId: string;
  @Column() attemptNumber: number;
  @Column({ type: 'enum', enum: DunningStatus, default: DunningStatus.ACTIVE }) status: DunningStatus;
  @Column({ type: 'timestamptz' }) scheduledAt: Date;
  @Column({ type: 'timestamptz', nullable: true }) sentAt: Date;
  @Column({ nullable: true }) emailSentTo: string;
  @Column({ type: 'timestamptz', nullable: true }) resolvedAt: Date;
  @CreateDateColumn() createdAt: Date;
}

@Entity('gdpr_requests')
export class GDPRRequest {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() @Index() userId: string;
  @Column() organizationId: string;
  @Column({ type: 'enum', enum: GDPRRequestType }) requestType: GDPRRequestType;
  @Column({ type: 'enum', enum: GDPRRequestStatus, default: GDPRRequestStatus.PENDING }) status: GDPRRequestStatus;
  @Column({ type: 'timestamptz' }) requestedAt: Date;
  @Column({ type: 'timestamptz', nullable: true }) completedAt: Date;
  @Column({ nullable: true }) processedBy: string;
  @Column({ type: 'jsonb', nullable: true }) processingNotes: Record<string, any>;
  @Column({ type: 'jsonb', nullable: true }) exportedData: Record<string, any>;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}

@Entity('referral_tracking')
export class ReferralTracking {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() @Index() referrerId: string;
  @Column() @Index() referredId: string;
  @Column() referralCode: string;
  @Column({ default: false }) converted: boolean;
  @Column({ type: 'timestamptz', nullable: true }) convertedAt: Date;
  @Column({ default: 0 }) creditEarned: number;
  @Column({ default: false }) creditApplied: boolean;
  @CreateDateColumn() createdAt: Date;
}

@Entity('api_usage_logs')
export class ApiUsageLog {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() @Index() organizationId: string;
  @Column() endpoint: string;
  @Column() method: string;
  @Column({ default: 1 }) count: number;
  @Column({ type: 'timestamptz' }) @Index() date: Date;
  @CreateDateColumn() createdAt: Date;
}

@Entity('user_sessions')
export class UserSession {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() @Index() userId: string;
  @Column() token: string;
  @Column({ type: 'timestamptz' }) expiresAt: Date;
  @Column({ nullable: true }) ipAddress: string;
  @Column({ nullable: true }) userAgent: string;
  @Column({ default: true }) isActive: boolean;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}

@Entity('system_health_checks')
export class SystemHealthCheck {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() serviceName: string;
  @Column() status: string;
  @Column({ nullable: true }) responseTime: number;
  @Column({ type: 'jsonb', nullable: true }) details: Record<string, any>;
  @CreateDateColumn() createdAt: Date;
}

@Entity('sam_opportunities')
export class SamOpportunity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() noticeId: string;
  @Column() title: string;
  @Column('text', { nullable: true }) description: string;
  @Column({ nullable: true }) agency: string;
  @Column({ nullable: true }) naicsCode: string;
  @Column({ type: 'timestamptz', nullable: true }) postedDate: Date;
  @Column({ type: 'timestamptz', nullable: true }) responseDeadline: Date;
  @Column({ nullable: true }) setAside: string;
  @Column({ nullable: true }) url: string;
  @Column({ default: false }) imported: boolean;
  @Column({ nullable: true }) importedProjectId: string;
  @Column({ nullable: true }) importedByOrgId: string;
  @CreateDateColumn() createdAt: Date;
}
