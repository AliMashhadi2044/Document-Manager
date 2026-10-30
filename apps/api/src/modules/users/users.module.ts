import { Module } from '@nestjs/common';

import { AuditService } from '../../common/audit/audit.service';
import { AuthModule } from '../auth/auth.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

/**
 * مدیریت کاربران.
 *
 * `AuthModule` برای `SessionService` لازم است: غیرفعال کردن کاربر و بازنشانی
 * رمزش باید نشست‌های بازش را **ببندد**، نه اینکه منتظر انقضایشان بماند.
 */
@Module({
  imports: [AuthModule],
  controllers: [UsersController],
  providers: [UsersService, AuditService],
})
export class UsersModule {}
