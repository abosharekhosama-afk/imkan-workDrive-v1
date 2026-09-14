import { Module } from '@nestjs/common';
import { RecentController } from './recent.controller';
import { RecentService } from './recent.service';

@Module({ controllers: [RecentController], providers: [RecentService], exports: [RecentService] })
export class RecentModule {}
