import { Module, forwardRef } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { OfficeController } from './office.controller';
import { OfficeService } from './office.service';
import { OfficeCollaborationService } from './office-collaboration.service';
import { OfficeConversionService } from './office-conversion.service';

@Module({
  imports: [forwardRef(() => FilesModule), PermissionsModule],
  controllers: [OfficeController],
  providers: [OfficeService, OfficeConversionService, OfficeCollaborationService],
  exports: [OfficeService],
})
export class OfficeModule {}
