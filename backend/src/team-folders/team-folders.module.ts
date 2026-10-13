import { Module } from '@nestjs/common';
import { TeamFoldersController } from './team-folders.controller';
import { TeamFoldersService } from './team-folders.service';

@Module({
  controllers: [TeamFoldersController],
  providers: [TeamFoldersService],
  exports: [TeamFoldersService],
})
export class TeamFoldersModule {}
