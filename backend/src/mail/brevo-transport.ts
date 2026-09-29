import type { SmtpMessage } from './smtp-transport';

export type BrevoConfig = { apiKey: string; from: string; fromName?: string };

/** Sends transactional email through Brevo's HTTPS API (works on Render Free). */
export async function sendBrevo(config: BrevoConfig, message: SmtpMessage): Promise<void> {
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'api-key': config.apiKey,
    },
    body: JSON.stringify({
      sender: { email: config.from, ...(config.fromName ? { name: config.fromName } : {}) },
      to: [{ email: message.to }],
      subject: message.subject,
      textContent: message.text,
      htmlContent: message.html,
    }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    // Do not include response bodies: providers may echo sensitive request data.
    throw new Error(`Brevo email API request failed with HTTP ${response.status}`);
  }
}
