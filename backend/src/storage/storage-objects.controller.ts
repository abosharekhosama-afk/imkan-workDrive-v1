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
import { stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { Public } from '../auth/public.decorator';
import { LocalDiskStorageAdapter } from './local-disk.storage';
import { contentDisposition } from '../common/content-disposition';

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

/** Parses a single `bytes=start-end` Range header into an inclusive window. */
function parseRangeHeader(
  range: string | undefined,
  size: number,
): { start: number; end: number } | null {
  if (!range || !size) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!match) return null;
  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) return null;
  let start: number;
  let end: number;
  if (!rawStart) {
    // Suffix form: bytes=-N → last N bytes.
    start = Math.max(size - Number(rawEnd), 0);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd ? Math.min(Number(rawEnd), size - 1) : size - 1;
  }
  if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) {
    return null;
  }
  return { start, end };
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

  /**
   * Signed object delivery with preview-grade response headers:
   * Content-Type from the stored object, RFC 6266 Content-Disposition from the
   * token, Accept-Ranges and full HTTP Range/206 support so media
   * previews can seek without downloading the whole file.
   */
  @Public()
  @Get('objects')
  async getObject(
    @Query('token') token: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    if (!token) {
      throw new UnauthorizedException('Invalid storage token');
    }
    const object = await this.localDisk.getObjectFromToken(token);
    const path = this.localDisk.resolvePathForToken(token);
    const fileStat = await stat(path);
    const size = fileStat.size;

    response.setHeader(
      'Content-Type',
      object.contentType || 'application/octet-stream',
    );
    response.setHeader(
      'Content-Disposition',
      contentDisposition(object.disposition, object.fileName ?? 'download'),
    );
    response.setHeader('Accept-Ranges', 'bytes');
    response.setHeader('Cache-Control', 'private, max-age=3600');

    const range = parseRangeHeader(request.headers.range, size);
    if (range) {
      response.status(206);
      response.setHeader(
        'Content-Range',
        `bytes ${range.start}-${range.end}/${size}`,
      );
      response.setHeader(
        'Content-Length',
        String(range.end - range.start + 1),
      );
      createReadStream(path, { start: range.start, end: range.end }).pipe(
        response,
      );
      return;
    }

    response.setHeader('Content-Length', String(size));
    response.status(200).send(object.bytes);
  }
}
