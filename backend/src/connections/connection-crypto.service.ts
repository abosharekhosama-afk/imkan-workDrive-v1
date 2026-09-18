import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

@Injectable()
export class ConnectionCryptoService {
  constructor(private readonly config: ConfigService) {}

  private key(): Buffer {
    const configured = this.config.get<string>('CONNECTION_ENCRYPTION_KEY')?.trim();
    if (configured) {
      const hex = Buffer.from(configured, 'hex');
      if (hex.length === 32) return hex;
      const base64 = Buffer.from(configured, 'base64');
      if (base64.length === 32) return base64;
      throw new BadRequestException('CONNECTION_ENCRYPTION_KEY must be 32 bytes (hex or base64)');
    }
    return createHash('sha256').update(this.config.get<string>('JWT_SECRET') ?? 'development-only-secret').digest();
  }

  encrypt(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return `v1.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`;
  }

  decrypt(value: string): string {
    const [version, iv, tag, data] = value.split('.');
    if (version !== 'v1' || !iv || !tag || !data) throw new BadRequestException('Stored connection secret is invalid');
    const decipher = createDecipheriv('aes-256-gcm', this.key(), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
  }
}
