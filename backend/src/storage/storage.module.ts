import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client } from '@aws-sdk/client-s3';
import { LocalDiskStorageAdapter } from './local-disk.storage';
import {
  S3CompatibleStorageAdapter,
  defaultS3Presigner,
} from './s3-compatible.storage';
import { StorageObjectsController } from './storage-objects.controller';
import { S3_CLIENT, S3_PRESIGNER, STORAGE_SERVICE } from './storage.types';

export function resolveStorageDriver(config: ConfigService): 'local' | 's3' {
  const raw = (config.get<string>('STORAGE_DRIVER') ?? 'local')
    .trim()
    .toLowerCase();
  return raw === 's3' ? 's3' : 'local';
}

@Module({
  controllers: [StorageObjectsController],
  providers: [
    LocalDiskStorageAdapter,
    {
      provide: S3_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        if (resolveStorageDriver(config) !== 's3') {
          return new S3Client({ region: 'us-east-1' });
        }
        const endpoint = config.get<string>('S3_ENDPOINT');
        const accessKeyId = config.get<string>('S3_ACCESS_KEY');
        const secretAccessKey = config.get<string>('S3_SECRET_KEY');
        return new S3Client({
          region: config.get<string>('S3_REGION') ?? 'us-east-1',
          ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
          ...(accessKeyId && secretAccessKey
            ? { credentials: { accessKeyId, secretAccessKey } }
            : {}),
        });
      },
    },
    {
      provide: S3_PRESIGNER,
      useValue: defaultS3Presigner,
    },
    S3CompatibleStorageAdapter,
    {
      provide: STORAGE_SERVICE,
      inject: [
        ConfigService,
        LocalDiskStorageAdapter,
        S3CompatibleStorageAdapter,
      ],
      useFactory: (
        config: ConfigService,
        localDisk: LocalDiskStorageAdapter,
        s3: S3CompatibleStorageAdapter,
      ) => (resolveStorageDriver(config) === 's3' ? s3 : localDisk),
    },
  ],
  exports: [STORAGE_SERVICE],
})
export class StorageModule {}
