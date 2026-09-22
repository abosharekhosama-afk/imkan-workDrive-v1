import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { EnterpriseController } from './enterprise.controller';
import { EnterpriseService } from './enterprise.service';
import { DlpModule } from '../dlp/dlp.module';

@Module({
  imports: [DlpModule],
  controllers: [AdminController, EnterpriseController],
  providers: [AdminService, EnterpriseService],
})
export class AdminModule {}
