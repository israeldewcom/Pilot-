import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1700000000001 implements MigrationInterface {
  name = 'InitialSchema1700000000001';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pg_trgm"`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "vector"`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS organizations (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR NOT NULL,
        slug VARCHAR UNIQUE,
        logo_url VARCHAR,
        plan VARCHAR NOT NULL DEFAULT 'free',
        stripe_customer_id VARCHAR,
        stripe_subscription_id VARCHAR,
        subscription_status VARCHAR NOT NULL DEFAULT 'trialing',
        trial_ends_at TIMESTAMPTZ,
        subscription_ends_at TIMESTAMPTZ,
        billing_email VARCHAR,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        is_suspended BOOLEAN NOT NULL DEFAULT FALSE,
        suspended_at TIMESTAMPTZ,
        suspended_reason VARCHAR,
        suspended_by VARCHAR,
        custom_limits JSONB,
        metadata JSONB,
        ai_tokens_used INTEGER NOT NULL DEFAULT 0,
        ai_tokens_limit INTEGER NOT NULL DEFAULT 5000000,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        external_id VARCHAR UNIQUE NOT NULL,
        email VARCHAR UNIQUE NOT NULL,
        name VARCHAR,
        first_name VARCHAR,
        last_name VARCHAR,
        avatar_url VARCHAR,
        locale VARCHAR NOT NULL DEFAULT 'en',
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        is_platform_admin BOOLEAN NOT NULL DEFAULT FALSE,
        admin_role VARCHAR,
        is_banned BOOLEAN NOT NULL DEFAULT FALSE,
        banned_at TIMESTAMPTZ,
        banned_reason VARCHAR,
        banned_by VARCHAR,
        last_login_at TIMESTAMPTZ,
        metadata JSONB,
        referred_by VARCHAR,
        referral_code VARCHAR UNIQUE,
        referral_credits INTEGER NOT NULL DEFAULT 0,
        totp_secret VARCHAR,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_users_external_id ON users(external_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS memberships (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL,
        organization_id UUID NOT NULL,
        role VARCHAR NOT NULL DEFAULT 'viewer',
        is_default BOOLEAN NOT NULL DEFAULT FALSE,
        accepted_at TIMESTAMPTZ,
        invited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(user_id, organization_id)
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_memberships_user_id ON memberships(user_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_memberships_org_id ON memberships(organization_id)`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        organization_id UUID NOT NULL,
        name VARCHAR NOT NULL,
        client VARCHAR,
        slug VARCHAR,
        due_date TIMESTAMPTZ,
        contract_value DECIMAL(15,2),
        priority VARCHAR NOT NULL DEFAULT 'medium',
        status VARCHAR NOT NULL DEFAULT 'draft',
        win_probability DECIMAL(5,2),
        win_score_factors JSONB,
        owner_id UUID NOT NULL,
        archived BOOLEAN NOT NULL DEFAULT FALSE,
        archived_at TIMESTAMPTZ,
        deleted BOOLEAN NOT NULL DEFAULT FALSE,
        deleted_at TIMESTAMPTZ,
        rfp_text TEXT,
        tags JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_projects_org_id ON projects(organization_id)`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS project_outlines (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        project_id UUID NOT NULL,
        title VARCHAR NOT NULL,
        description VARCHAR,
        order_index INTEGER NOT NULL DEFAULT 0,
        content TEXT,
        ai_draft TEXT,
        status VARCHAR NOT NULL DEFAULT 'empty',
        last_edited_by UUID,
        metadata JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_outlines_project_id ON project_outlines(project_id)`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS outline_versions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        outline_id UUID NOT NULL,
        project_id UUID NOT NULL,
        content TEXT NOT NULL,
        version INTEGER NOT NULL,
        saved_by UUID NOT NULL,
        change_note VARCHAR,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_outline_versions_outline ON outline_versions(outline_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_outline_versions_project ON outline_versions(project_id)`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS documents (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        project_id UUID NOT NULL,
        organization_id UUID NOT NULL,
        filename VARCHAR NOT NULL,
        original_name VARCHAR,
        mime_type VARCHAR,
        s3_key VARCHAR,
        s3_url VARCHAR,
        size_bytes INTEGER NOT NULL DEFAULT 0,
        status VARCHAR NOT NULL DEFAULT 'pending',
        chunk_count INTEGER NOT NULL DEFAULT 0,
        uploaded_by UUID,
        extracted_text TEXT,
        metadata JSONB,
        error_message VARCHAR,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_documents_project_id ON documents(project_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_documents_org_id ON documents(organization_id)`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS document_chunks (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        document_id UUID NOT NULL,
        project_id UUID NOT NULL,
        chunk_index INTEGER NOT NULL,
        text TEXT NOT NULL,
        embedding VECTOR(1536),
        token_count INTEGER NOT NULL DEFAULT 0,
        embedding_model VARCHAR NOT NULL DEFAULT 'text-embedding-3-small',
        search_vector TSVECTOR,
        metadata JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON document_chunks(document_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_chunks_project_id ON document_chunks(project_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_chunks_search_vector ON document_chunks USING GIN(search_vector)`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ai_generation_logs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        organization_id UUID NOT NULL,
        user_id UUID NOT NULL,
        project_id UUID,
        section_id UUID,
        model VARCHAR NOT NULL,
        prompt_tokens INTEGER NOT NULL DEFAULT 0,
        completion_tokens INTEGER NOT NULL DEFAULT 0,
        total_tokens INTEGER NOT NULL DEFAULT 0,
        cost DECIMAL(10,6) NOT NULL DEFAULT 0,
        action VARCHAR,
        status VARCHAR NOT NULL DEFAULT 'success',
        error_message VARCHAR,
        metadata JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_ai_logs_org_id ON ai_generation_logs(organization_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_ai_logs_created_at ON ai_generation_logs(created_at)`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS compliance_requirements (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        project_id UUID NOT NULL,
        requirement_text TEXT NOT NULL,
        category VARCHAR,
        severity VARCHAR NOT NULL DEFAULT 'medium',
        status VARCHAR NOT NULL DEFAULT 'needs_review',
        section_ref VARCHAR,
        ai_suggestion TEXT,
        evidence TEXT,
        assigned_to VARCHAR,
        source_page_number INTEGER,
        last_checked_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_compliance_project_id ON compliance_requirements(project_id)`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS compliance_checks (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        project_id UUID NOT NULL,
        requirement_id UUID NOT NULL,
        result VARCHAR NOT NULL DEFAULT 'pending',
        details TEXT,
        metadata JSONB,
        checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS competitors (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        organization_id UUID NOT NULL,
        name VARCHAR NOT NULL,
        website VARCHAR,
        revenue VARCHAR,
        employees VARCHAR,
        strengths TEXT,
        weaknesses TEXT,
        naics_codes TEXT[],
        metadata JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_competitors_org_id ON competitors(organization_id)`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS competitor_analyses (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        competitor_id UUID NOT NULL,
        project_id UUID NOT NULL,
        analysis TEXT NOT NULL,
        counter_narrative TEXT,
        strengths JSONB,
        weaknesses JSONB,
        opportunities JSONB,
        threats JSONB,
        generated_by UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS experiments (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        organization_id UUID NOT NULL,
        name VARCHAR NOT NULL,
        description VARCHAR,
        section VARCHAR NOT NULL,
        control_prompt TEXT NOT NULL,
        variant_prompt TEXT NOT NULL,
        traffic_split INTEGER NOT NULL DEFAULT 50,
        success_metric VARCHAR NOT NULL DEFAULT 'win_rate',
        status VARCHAR NOT NULL DEFAULT 'draft',
        started_at TIMESTAMPTZ,
        ended_at TIMESTAMPTZ,
        results JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS experiment_assignments (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        experiment_id UUID NOT NULL,
        user_id UUID NOT NULL,
        variant VARCHAR NOT NULL,
        outcome JSONB,
        converted_at TIMESTAMPTZ,
        assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(experiment_id, user_id)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL,
        organization_id UUID NOT NULL,
        type VARCHAR NOT NULL,
        title VARCHAR NOT NULL,
        description TEXT,
        metadata JSONB,
        is_read BOOLEAN NOT NULL DEFAULT FALSE,
        is_archived BOOLEAN NOT NULL DEFAULT FALSE,
        action_url VARCHAR,
        action_label VARCHAR,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at)`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS notification_preferences (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL,
        type VARCHAR NOT NULL,
        in_app BOOLEAN NOT NULL DEFAULT TRUE,
        email BOOLEAN NOT NULL DEFAULT FALSE,
        sms BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(user_id, type)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS webhooks (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        organization_id UUID NOT NULL,
        name VARCHAR NOT NULL,
        url VARCHAR NOT NULL,
        secret VARCHAR,
        events TEXT[] NOT NULL DEFAULT '{}',
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS webhook_deliveries (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        webhook_id UUID NOT NULL,
        event VARCHAR NOT NULL,
        payload JSONB NOT NULL,
        status VARCHAR NOT NULL DEFAULT 'pending',
        response_code INTEGER,
        response_body TEXT,
        error_message TEXT,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        next_retry_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_deliveries_webhook_id ON webhook_deliveries(webhook_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_deliveries_created_at ON webhook_deliveries(created_at)`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL,
        organization_id UUID NOT NULL,
        name VARCHAR NOT NULL,
        key_hash VARCHAR UNIQUE NOT NULL,
        key_prefix VARCHAR,
        scopes TEXT NOT NULL DEFAULT 'read,write',
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        last_used_at TIMESTAMPTZ,
        expires_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash)`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        organization_id UUID NOT NULL,
        user_id UUID,
        action VARCHAR NOT NULL,
        resource VARCHAR NOT NULL,
        resource_id UUID,
        details JSONB,
        ip_address VARCHAR,
        user_agent VARCHAR,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_audit_org_id ON audit_logs(organization_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_logs(created_at)`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS billings (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        organization_id UUID NOT NULL,
        stripe_invoice_id VARCHAR NOT NULL,
        amount INTEGER NOT NULL,
        currency VARCHAR NOT NULL,
        status VARCHAR NOT NULL,
        pdf_url VARCHAR,
        period VARCHAR,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS promo_codes (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        code VARCHAR UNIQUE NOT NULL,
        discount_type VARCHAR NOT NULL,
        discount_value DECIMAL(5,2) NOT NULL,
        max_redemptions INTEGER NOT NULL DEFAULT 1000,
        current_redemptions INTEGER NOT NULL DEFAULT 0,
        expires_at TIMESTAMPTZ,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        applicable_plans TEXT[],
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS promo_usages (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        promo_code_id UUID NOT NULL,
        organization_id UUID NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(promo_code_id, organization_id)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS circuit_breaker_states (
        service_name VARCHAR PRIMARY KEY,
        state VARCHAR NOT NULL DEFAULT 'closed',
        failure_count INTEGER NOT NULL DEFAULT 0,
        last_failure_time TIMESTAMPTZ,
        last_success_time TIMESTAMPTZ,
        last_attempt_at TIMESTAMPTZ,
        metadata JSONB,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS company_profiles (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        organization_id UUID NOT NULL,
        company_name VARCHAR NOT NULL,
        cage_code VARCHAR,
        duns_uei VARCHAR,
        naics_code VARCHAR,
        small_business_status VARCHAR,
        differentiators TEXT,
        past_performance TEXT,
        website VARCHAR,
        address VARCHAR,
        phone VARCHAR,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS team_activity_logs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        organization_id UUID NOT NULL,
        user_id UUID NOT NULL,
        action VARCHAR NOT NULL,
        target_user_id UUID,
        details JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_team_activity_org_id ON team_activity_logs(organization_id)`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS admin_audit_logs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        admin_id UUID NOT NULL,
        admin_email VARCHAR NOT NULL,
        admin_role VARCHAR NOT NULL,
        organization_id UUID,
        target_user_id UUID,
        action VARCHAR NOT NULL,
        resource VARCHAR NOT NULL,
        resource_id UUID,
        details JSONB,
        reason VARCHAR NOT NULL,
        ip_address VARCHAR,
        user_agent VARCHAR,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_admin_audit_admin_id ON admin_audit_logs(admin_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_admin_audit_org_id ON admin_audit_logs(organization_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_admin_audit_created_at ON admin_audit_logs(created_at)`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS platform_announcements (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        title VARCHAR NOT NULL,
        description TEXT NOT NULL,
        type VARCHAR NOT NULL DEFAULT 'info',
        delivery_method VARCHAR NOT NULL DEFAULT 'in_app',
        target_orgs TEXT[],
        target_plans TEXT[],
        action_url VARCHAR,
        action_label VARCHAR,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        is_dismissible BOOLEAN NOT NULL DEFAULT FALSE,
        expires_at TIMESTAMPTZ,
        created_by VARCHAR NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS feature_flag_overrides (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        flag VARCHAR NOT NULL,
        target_type VARCHAR NOT NULL DEFAULT 'organization',
        target_id VARCHAR NOT NULL,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        set_by VARCHAR,
        config JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(flag, target_type, target_id)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS dunning_events (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        organization_id UUID NOT NULL,
        stripe_invoice_id VARCHAR NOT NULL,
        attempt_number INTEGER NOT NULL,
        status VARCHAR NOT NULL DEFAULT 'active',
        scheduled_at TIMESTAMPTZ NOT NULL,
        sent_at TIMESTAMPTZ,
        email_sent_to VARCHAR,
        resolved_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_dunning_org_id ON dunning_events(organization_id)`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS gdpr_requests (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL,
        organization_id UUID NOT NULL,
        request_type VARCHAR NOT NULL,
        status VARCHAR NOT NULL DEFAULT 'pending',
        requested_at TIMESTAMPTZ NOT NULL,
        completed_at TIMESTAMPTZ,
        processed_by VARCHAR,
        processing_notes JSONB,
        exported_data JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_gdpr_user_id ON gdpr_requests(user_id)`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS referral_tracking (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        referrer_id UUID NOT NULL,
        referred_id UUID NOT NULL,
        referral_code VARCHAR NOT NULL,
        converted BOOLEAN NOT NULL DEFAULT FALSE,
        converted_at TIMESTAMPTZ,
        credit_earned INTEGER NOT NULL DEFAULT 0,
        credit_applied BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_referral_referrer ON referral_tracking(referrer_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_referral_referred ON referral_tracking(referred_id)`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS api_usage_logs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        organization_id UUID NOT NULL,
        endpoint VARCHAR NOT NULL,
        method VARCHAR NOT NULL,
        count INTEGER NOT NULL DEFAULT 1,
        date TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_api_usage_org_date ON api_usage_logs(organization_id, date)`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL,
        token VARCHAR NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        ip_address VARCHAR,
        user_agent VARCHAR,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id)`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS system_health_checks (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        service_name VARCHAR NOT NULL,
        status VARCHAR NOT NULL,
        response_time INTEGER,
        details JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sam_opportunities (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        notice_id VARCHAR NOT NULL,
        title VARCHAR NOT NULL,
        description TEXT,
        agency VARCHAR,
        naics_code VARCHAR,
        posted_date TIMESTAMPTZ,
        response_deadline TIMESTAMPTZ,
        set_aside VARCHAR,
        url VARCHAR,
        imported BOOLEAN NOT NULL DEFAULT FALSE,
        imported_project_id UUID,
        imported_by_org_id UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const allTables = [
      'sam_opportunities', 'system_health_checks', 'user_sessions', 'api_usage_logs',
      'referral_tracking', 'gdpr_requests', 'dunning_events', 'feature_flag_overrides',
      'platform_announcements', 'admin_audit_logs',
      'team_activity_logs', 'company_profiles', 'circuit_breaker_states',
      'promo_usages', 'promo_codes', 'billings', 'audit_logs', 'api_keys',
      'webhook_deliveries', 'webhooks', 'notification_preferences', 'notifications',
      'experiment_assignments', 'experiments', 'competitor_analyses', 'competitors',
      'compliance_checks', 'compliance_requirements', 'ai_generation_logs',
      'document_chunks', 'documents', 'outline_versions', 'project_outlines', 'projects',
      'memberships', 'users', 'organizations',
    ];
    for (const table of allTables) {
      await queryRunner.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
    }
  }
}
