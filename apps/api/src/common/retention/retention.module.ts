import { Module } from '@nestjs/common';

import { RetentionService } from './retention.service';

/** نگهداشت داده — بدون کنترلر: هیچ مسیری ندارد و فقط با زمان کار می‌کند. */
@Module({
  providers: [RetentionService],
})
export class RetentionModule {}
