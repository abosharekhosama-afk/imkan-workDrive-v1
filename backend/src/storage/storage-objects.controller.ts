import {
  Controller,
  Get,
  HttpCode,
  Put,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../auth/public.decorator';
import { LocalDiskStorageAdapter } from './local-disk.storage';

async function readRequestBody(request: Request): Promise<Buffer> {
  if (Buffer.isBuffer(request.body)) {
    return request.body;
  }
  if (typeof request.body === 'string') {
    return Buffer.from(request.body);
  }
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

@Controller('storage')
export class StorageObjectsController {
  constructor(private readonly localDisk: LocalDiskStorageAdapter) {}

  @Public()
  @Put('objects')
  @HttpCode(204)
  async putObject(
    @Query('token') token: string | undefined,
    @Req() request: Request,
  ) {
    if (!token) {
      throw new UnauthorizedException('Invalid storage token');
    }
    await this.localDisk.putObjectFromToken(
      token,
      await readRequestBody(request),
    );
  }

  @Public()
  @Get('objects')
  async getObject(
    @Query('token') token: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    if (!token) {
      throw new UnauthorizedException('Invalid storage token');
    }
    const object = await this.localDisk.getObjectFromToken(token);
    response.setHeader('Content-Type', object.contentType);
    response.status(200).send(object.bytes);
  }
}
