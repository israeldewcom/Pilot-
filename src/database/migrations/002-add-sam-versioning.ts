import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSamVersioning1700000000002 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE organizations ADD COLUMN IF NOT EXISTS ai_tokens_used INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE organizations ADD COLUMN IF NOT EXISTS ai_tokens_limit INTEGER NOT NULL DEFAULT 5000000;
    `);

    await queryRunner.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret VARCHAR;
    `);

    await queryRunner.query(`
      ALTER TABLE compliance_requirements ADD COLUMN IF NOT EXISTS assigned_to VARCHAR;
      ALTER TABLE compliance_requirements ADD COLUMN IF NOT EXISTS source_page_number INTEGER;
    `);

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
    await queryRunner.query(`DROP TABLE IF EXISTS sam_opportunities CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS outline_versions CASCADE`);
  }
}
