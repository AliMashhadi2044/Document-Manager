import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../../common/auth/auth.decorators';
import { PrismaService } from '../../common/prisma/prisma.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'زنده بودن سرویس' })
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Public()
  @Get('ready')
  @ApiOperation({ summary: 'آمادگی سرویس و اتصال به پایگاه داده' })
  async ready(): Promise<{ status: 'ok' | 'degraded'; database: boolean }> {
    const database = await this.prisma.isHealthy();
    return { status: database ? 'ok' : 'degraded', database };
  }
}
