import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Public } from '../../common/decorators/decorators';
import * as os from 'os';

@ApiTags('Health')
@Controller('api/health')
export class HealthController {
  constructor(@InjectDataSource() private dataSource: DataSource) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Health check — public' })
  async check() {
    const result: Record<string, any> = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '2.2.0',
      uptime: Math.round(process.uptime()),
      environment: process.env.NODE_ENV || 'development',
    };

    try {
      await this.dataSource.query('SELECT 1');
      result.database = 'ok';
    } catch {
      result.database = 'error';
      result.status = 'degraded';
    }

    try {
      await this.dataSource.query(`SELECT extname FROM pg_extension WHERE extname = 'vector'`);
      result.pgvector = 'ok';
    } catch {
      result.pgvector = 'missing';
      result.status = 'degraded';
    }

    const mem = process.memoryUsage();
    result.memory = {
      heapUsedMB: Math.round(mem.heapUsed / 1048576),
      heapTotalMB: Math.round(mem.heapTotal / 1048576),
      rssMB: Math.round(mem.rss / 1048576),
    };

    result.system = {
      cpus: os.cpus().length,
      loadAvg: os.loadavg(),
      freeMemMB: Math.round(os.freemem() / 1048576),
      totalMemMB: Math.round(os.totalmem() / 1048576),
    };

    return result;
  }

  @Public()
  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe' })
  async ready() {
    try {
      await this.dataSource.query('SELECT 1');
      return { ready: true };
    } catch {
      return { ready: false };
    }
  }
}
