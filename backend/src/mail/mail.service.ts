import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sendBrevo } from './brevo-transport';
import { sendSmtp, type SmtpMessage } from './smtp-transport';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    const from = this.config.get<string>('MAIL_FROM')?.trim();
    const brevo = this.config.get<string>('BREVO_API_KEY')?.trim();
    const smtp = this.config.get<string>('SMTP_HOST')?.trim();
    return Boolean(from && (brevo || smtp));
  }

  async send(message: SmtpMessage): Promise<{ delivered: boolean }> {
    const from = this.config.get<string>('MAIL_FROM')?.trim();
    const fromName = this.config.get<string>('MAIL_FROM_NAME')?.trim() || 'IMKAN WorkDrive';
    const apiKey = this.config.get<string>('BREVO_API_KEY')?.trim();
    const smtpHost = this.config.get<string>('SMTP_HOST')?.trim();
    if (!from || (!apiKey && !smtpHost)) {
      if (this.config.get<string>('NODE_ENV') === 'production') {
        throw new ServiceUnavailableException('Email delivery is not configured');
      }
      this.logger.warn(`Email to ${message.to} was not delivered because MAIL_FROM and a Brevo or SMTP transport are not configured.`);
      return { delivered: false };
    }

    if (apiKey) {
      await sendBrevo({ apiKey, from, fromName }, message);
      return { delivered: true };
    }

    if (!smtpHost) throw new ServiceUnavailableException('Email delivery is not configured');
    const port = Number(this.config.get<string>('SMTP_PORT') ?? 587);
    const secure = this.config.get<string>('SMTP_SECURE') === 'true' || port === 465;
    await sendSmtp({
      host: smtpHost,
      port: Number.isFinite(port) ? port : 587,
      secure,
      user: this.config.get<string>('SMTP_USER')?.trim() || undefined,
      pass: this.config.get<string>('SMTP_PASS') ?? undefined,
      from,
    }, message);
    return { delivered: true };
  }
}
