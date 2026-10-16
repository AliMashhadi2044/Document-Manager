import { Module } from '@nestjs/common';

import { AuditService } from '../../common/audit/audit.service';
import { LookupController } from './lookup.controller';
import { LookupService } from './lookup.service';
import { ChaptersController } from './chapters.controller';
import { ReferenceController } from './reference.controller';
import { BuyersController } from './buyers.controller';
import { SchoolsController } from './schools.controller';
import { VehiclesController } from './vehicles.controller';

@Module({
  controllers: [
    LookupController,
    ChaptersController,
    ReferenceController,
    BuyersController,
    SchoolsController,
    VehiclesController,
  ],
  providers: [LookupService, AuditService],
  exports: [LookupService],
})
export class BaseDataModule {}
