import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sendSmtp, type SmtpMessage } from './smtp-transport';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.config.get<string>('SMTP_HOST')?.trim() && this.config.get<string>('MAIL_FROM')?.trim());
  }

  async send(message: SmtpMessage): Promise<{ delivered: boolean }> {
    if (!this.isConfigured()) {
      if (this.config.get<string>('NODE_ENV') === 'production') {
        throw new ServiceUnavailableException('Email delivery is not configured');
      }
      this.logger.warn(`SMTP is not configured. Email to ${message.to} was not delivered. Subject: ${message.subject}`);
      return { delivered: false };
    }

    const port = Number(this.config.get<string>('SMTP_PORT') ?? '587');
    const secureFlag = this.config.get<string>('SMTP_SECURE');
    const secure = secureFlag === 'true' || port === 465;
    await sendSmtp(
      {
        host: this.config.get<string>('SMTP_HOST')!.trim(),
        port,
        secure,
        user: this.config.get<string>('SMTP_USER')?.trim() || undefined,
        pass: this.config.get<string>('SMTP_PASS') ?? undefined,
        from: this.config.get<string>('MAIL_FROM')!.trim(),
      },
      message,
    );
    return { delivered: true };
  }
}
