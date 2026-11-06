import { Module } from '@nestjs/common';

import { AuditService } from '../../common/audit/audit.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionPolicyService } from './session-policy.service';
import { SessionService } from './session.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, SessionService, SessionPolicyService, AuditService],
  exports: [AuthService, SessionService, SessionPolicyService],
})
export class AuthModule {}
