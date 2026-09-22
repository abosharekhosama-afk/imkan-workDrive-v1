import { Module } from '@nestjs/common'; import { CollaborationController } from './collaboration.controller'; import { CollaborationService } from './collaboration.service'; import { PrismaModule } from '../prisma/prisma.module';
@Module({imports:[PrismaModule],controllers:[CollaborationController],providers:[CollaborationService]}) export class CollaborationModule {}
