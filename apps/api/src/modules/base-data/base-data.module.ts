import { Module } from '@nestjs/common';

import { AuditService } from '../../common/audit/audit.service';
import { LookupController } from './lookup.controller';
import { LookupService } from './lookup.service';
import { ChaptersController } from './chapters.controller';
import { ReferenceController } from './reference.controller';
import { BuyersController } from './buyers.controller';
import { SchoolsController } from './schools.controller';
import { VehiclesController } from './vehicles.controller';
import { OrganizationController } from './organization.controller';
import { FilesModule } from '../files/files.module';

@Module({
  // نشان سازمان در همان فضای ذخیره‌سازی پیوست‌ها می‌ماند؛ سرویسش از ماژول فایل می‌آید.
  imports: [FilesModule],
  controllers: [
    LookupController,
    ChaptersController,
    ReferenceController,
    BuyersController,
    SchoolsController,
    VehiclesController,
    OrganizationController,
  ],
  providers: [LookupService, AuditService],
  exports: [LookupService],
})
export class BaseDataModule {}
