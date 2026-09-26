import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { EnterpriseController } from './enterprise.controller';
import { EnterpriseService } from './enterprise.service';
import { DlpModule } from '../dlp/dlp.module';
import { GroupsModule } from '../groups/groups.module';

@Module({
  imports: [DlpModule, GroupsModule],
  controllers: [AdminController, EnterpriseController],
  providers: [AdminService, EnterpriseService],
})
export class AdminModule {}
