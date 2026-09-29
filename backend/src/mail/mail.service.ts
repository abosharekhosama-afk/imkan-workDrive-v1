import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sendBrevo } from './brevo-transport';
import type { SmtpMessage } from './smtp-transport';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(
      this.config.get<string>('BREVO_API_KEY')?.trim() &&
      this.config.get<string>('MAIL_FROM')?.trim(),
    );
  }

  async send(message: SmtpMessage): Promise<{ delivered: boolean }> {
    const apiKey = this.config.get<string>('BREVO_API_KEY')?.trim();
    const from = this.config.get<string>('MAIL_FROM')?.trim();
    if (!apiKey || !from) {
      if (this.config.get<string>('NODE_ENV') === 'production') {
        throw new ServiceUnavailableException('Email delivery is not configured');
      }
      this.logger.warn('Brevo email delivery is not configured; message was not delivered.');
      return { delivered: false };
    }

    await sendBrevo(
      {
        apiKey,
        from,
        fromName: this.config.get<string>('MAIL_FROM_NAME')?.trim() || 'IMKAN WorkDrive',
      },
      message,
    );
    return { delivered: true };
  }
}
