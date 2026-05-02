import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';

export const getReadOnlyConfig = (configService: ConfigService): TypeOrmModuleOptions => ({
  name: 'readonly',
  type: 'postgres',
  host: configService.get('DB_READ_HOST') || configService.get('DB_HOST'),
  port: configService.get<number>('DB_READ_PORT') || configService.get<number>('DB_PORT', 5432),
  username: configService.get('DB_READ_USERNAME') || configService.get('DB_USERNAME'),
  password: configService.get('DB_READ_PASSWORD') || configService.get('DB_PASSWORD'),
  database: configService.get('DB_READ_DATABASE') || configService.get('DB_DATABASE'),
  ssl: configService.get('DB_SSL') === 'true' ? { rejectUnauthorized: false } : false,
  entities: [path.join(__dirname, '..', 'entities', '**', '*.entity.{ts,js}')],
  synchronize: false,
  logging: false,
  extra: {
    max: configService.get<number>('DB_POOL_MAX', 10),
    min: 0,
  },
});
