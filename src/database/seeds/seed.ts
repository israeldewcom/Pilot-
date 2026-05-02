import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { config } from 'dotenv';
config();

const dataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USERNAME || 'rfpilot',
  password: process.env.DB_PASSWORD || 'rfpilot_dev_password',
  database: process.env.DB_DATABASE || 'rfpilot',
  entities: [__dirname + '/../../entities/**/*.entity{.ts,.js}'],
  synchronize: false,
});

async function seed() {
  await dataSource.initialize();
  const qr = dataSource.createQueryRunner();

  console.log('🌱 Seeding development data...');

  await qr.query(`
    INSERT INTO promo_codes (code, discount_type, discount_value, max_redemptions, expires_at)
    VALUES
      ('LAUNCH50', 'percentage', 50, 100, NOW() + INTERVAL '30 days'),
      ('GOVCON100', 'fixed', 100, 50, NOW() + INTERVAL '60 days'),
      ('FREETRIAL', 'trial_extension', 30, 1000, NOW() + INTERVAL '90 days')
    ON CONFLICT (code) DO NOTHING
  `);

  await qr.query(`
    INSERT INTO circuit_breaker_states (service_name, state, failure_count)
    VALUES ('openai', 'closed', 0), ('stripe', 'closed', 0), ('s3', 'closed', 0)
    ON CONFLICT (service_name) DO NOTHING
  `);

  await qr.query(`
    INSERT INTO platform_announcements (title, description, type, delivery_method, is_active, created_by)
    VALUES 
      ('Welcome to RFPilot v2.2', 'Multi-LLM routing and SAM.gov integration are now live!', 'info', 'in_app', true, 'system'),
      ('Upcoming Webinar', 'Join us for a deep dive into Win Score Optimization', 'info', 'email', true, 'system')
    ON CONFLICT (title) DO NOTHING
  `);

  console.log('✅ Seed complete');
  await dataSource.destroy();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
