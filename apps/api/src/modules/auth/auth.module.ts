import { Module } from '@nestjs/common';

import { AuditService } from '../../common/audit/audit.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, SessionService, AuditService],
  exports: [AuthService, SessionService],
})
export class AuthModule {}
