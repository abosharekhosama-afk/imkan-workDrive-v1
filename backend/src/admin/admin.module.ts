import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { EnterpriseController } from './enterprise.controller';
import { EnterpriseService } from './enterprise.service';

@Module({
  controllers: [AdminController, EnterpriseController],
  providers: [AdminService, EnterpriseService],
})
export class AdminModule {}
