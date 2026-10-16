import { Global, Module } from '@nestjs/common';

import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

/**
 * اعلان‌ها Global هستند چون چند ماژول (سند، بایگانی، بازخورد) تولیدکننده‌اند و
 * تکرار provider در هر کدام، یعنی چند نمونه از یک سرویس بی‌حالت.
 */
@Global()
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
