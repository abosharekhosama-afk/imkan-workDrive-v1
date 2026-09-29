export type RenderedEmail = { subject: string; text: string; html: string };

function shell(title: string, body: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f4f6f8;font-family:Segoe UI,Tahoma,sans-serif;color:#1c1e21">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center">
    <table role="presentation" width="100%" style="max-width:480px;background:#fff;border:1px solid #e6e8eb;border-radius:12px;padding:32px 28px">
      <tr><td style="font-size:13px;letter-spacing:.08em;color:#00a884;font-weight:700">IMKAN WORKDRIVE</td></tr>
      <tr><td style="padding-top:16px;font-size:20px;font-weight:650">${title}</td></tr>
      <tr><td style="padding-top:12px;font-size:14px;line-height:1.6;color:#3c4043">${body}</td></tr>
    </table>
  </td></tr></table></body></html>`;
}

export function verificationCodeEmail(input: { code: string; minutes: number; action: string }): RenderedEmail {
  const subject = `${input.code} is your IMKAN WorkDrive verification code`;
  const text = `${input.action}\n\nYour verification code is ${input.code}. It expires in ${input.minutes} minutes.\n\nIf you did not request this, you can ignore this email.`;
  const html = shell(
    'Verification code',
    `<p style="margin:0 0 12px">${input.action}</p><p style="margin:0 0 16px;font-size:28px;letter-spacing:.28em;font-weight:700;color:#111">${input.code}</p><p style="margin:0">This code expires in ${input.minutes} minutes. If you did not request it, ignore this email.</p>`,
  );
  return { subject, text, html };
}

export function collectionInviteEmail(input: {
  collectionName: string;
  requesterName: string;
  organizationName: string;
  description?: string | null;
  message?: string | null;
  link: string;
  expiresAt?: Date | null;
  signInRequired: boolean;
}): RenderedEmail {
  const when = input.expiresAt ? input.expiresAt.toUTCString() : '';
  const subject = `${input.requesterName} requested files: ${input.collectionName}`;
  const text = [
    `${input.requesterName} from ${input.organizationName} asked you to upload files to "${input.collectionName}".`,
    input.description ? `\n${input.description}` : '',
    input.message ? `\nMessage:\n${input.message}` : '',
    when ? `\nSubmit before ${when}.` : '',
    input.signInRequired ? '\nSign in to WorkDrive before uploading.' : '\nYou can upload without a WorkDrive account.',
    `\nUpload files:\n${input.link}`,
  ].join('');
  const html = shell(
    escapeHtml(input.collectionName),
    `<p style="margin:0 0 12px"><strong>${escapeHtml(input.requesterName)}</strong> from ${escapeHtml(input.organizationName)} asked you to upload files.</p>`
    + (input.description ? `<p style="margin:0 0 12px">${escapeHtml(input.description)}</p>` : '')
    + (input.message ? `<p style="margin:0 0 12px;padding:12px;background:#f4f6f8;border-radius:8px">${escapeHtml(input.message)}</p>` : '')
    + (when ? `<p style="margin:0 0 12px">Submit before <strong>${escapeHtml(when)}</strong>.</p>` : '')
    + `<p style="margin:0 0 16px">${input.signInRequired ? 'Sign in before uploading.' : 'No WorkDrive account is required.'}</p>`
    + `<p style="margin:0 0 16px"><a href="${escapeHtml(input.link)}" style="display:inline-block;background:#00a884;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:650">Upload files</a></p>`
    + `<p style="margin:0;word-break:break-all;font-size:12px;color:#5f6368">${escapeHtml(input.link)}</p>`,
  );
  return { subject, text, html };
}

export function collectionSubmissionEmail(input: { collectionName: string; submitter: string; fileName: string; folderUrl: string }): RenderedEmail {
  const subject = `New file submitted to ${input.collectionName}`;
  const text = `${input.submitter} submitted "${input.fileName}" to ${input.collectionName}.\n\nOpen the folder:\n${input.folderUrl}`;
  const html = shell(
    'New collection submission',
    `<p style="margin:0 0 12px"><strong>${escapeHtml(input.submitter)}</strong> submitted <strong>${escapeHtml(input.fileName)}</strong> to ${escapeHtml(input.collectionName)}.</p><p style="margin:0"><a href="${escapeHtml(input.folderUrl)}" style="color:#00a884">Open the folder</a></p>`,
  );
  return { subject, text, html };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char));
}

export function passwordResetEmail(input: { link: string }): RenderedEmail {
  const subject = 'Reset your IMKAN WorkDrive password';
  const text = `Reset your password using this link (valid for 30 minutes):\n${input.link}\n\nIf you did not request a reset, ignore this email.`;
  const html = shell(
    'Reset your password',
    `<p style="margin:0 0 16px">Use the button below to choose a new password. The link expires in 30 minutes.</p><p style="margin:0 0 16px"><a href="${input.link}" style="display:inline-block;background:#00a884;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:650">Reset password</a></p><p style="margin:0;word-break:break-all;font-size:12px;color:#5f6368">${input.link}</p>`,
  );
  return { subject, text, html };
}
