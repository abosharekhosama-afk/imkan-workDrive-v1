import { connect as netConnect, type Socket } from 'node:net';
import { connect as tlsConnect, type TLSSocket } from 'node:tls';

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
};

export type SmtpMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

type Conn = Socket | TLSSocket;

function encodeHeader(value: string): string {
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

function dotStuff(body: string): string {
  return body.replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..');
}

function readReply(socket: Conn): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('SMTP server timed out'));
    }, 20_000);
    const onData = (chunk: Buffer) => {
      data += chunk.toString('utf8');
      const lines = data.split(/\r?\n/).filter((line) => line.length > 0);
      const last = lines[lines.length - 1] ?? '';
      if (/^\d{3} /.test(last)) {
        cleanup();
        resolve(data);
      }
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      clearTimeout(timer);
      socket.off('data', onData);
      socket.off('error', onError);
    };
    socket.on('data', onData);
    socket.on('error', onError);
  });
}

function connect(config: SmtpConfig): Promise<Conn> {
  return new Promise((resolve, reject) => {
    const socket = config.secure
      ? tlsConnect({ host: config.host, port: config.port, servername: config.host })
      : netConnect({ host: config.host, port: config.port });
    const onError = (error: Error) => {
      socket.off('connect', onConnect);
      socket.off('secureConnect', onConnect);
      reject(error);
    };
    const onConnect = () => {
      socket.off('error', onError);
      resolve(socket);
    };
    socket.once('error', onError);
    socket.once(config.secure ? 'secureConnect' : 'connect', onConnect);
  });
}

async function command(socket: Conn, line: string | null, expected: number): Promise<string> {
  if (line !== null) socket.write(`${line}\r\n`);
  const reply = await readReply(socket);
  const code = Number(reply.trim().split(/\s+/)[0]?.slice(0, 3));
  if (code !== expected) throw new Error(`SMTP ${line ?? 'greeting'} failed: ${reply.trim()}`);
  return reply;
}

function upgradeTls(socket: Socket, host: string): Promise<TLSSocket> {
  return new Promise((resolve, reject) => {
    const secure = tlsConnect({ socket, servername: host });
    secure.once('secureConnect', () => resolve(secure));
    secure.once('error', reject);
  });
}

export async function sendSmtp(config: SmtpConfig, message: SmtpMessage): Promise<void> {
  let socket = await connect(config);
  try {
    await command(socket, null, 220);
    let hello = await command(socket, `EHLO imkan-workdrive`, 250);
    if (!config.secure && /STARTTLS/i.test(hello)) {
      await command(socket, 'STARTTLS', 220);
      socket = await upgradeTls(socket as Socket, config.host);
      hello = await command(socket, 'EHLO imkan-workdrive', 250);
    }
    if (config.user) {
      await command(socket, 'AUTH LOGIN', 334);
      await command(socket, Buffer.from(config.user).toString('base64'), 334);
      await command(socket, Buffer.from(config.pass ?? '').toString('base64'), 235);
    }
    await command(socket, `MAIL FROM:<${config.from}>`, 250);
    await command(socket, `RCPT TO:<${message.to}>`, 250);
    await command(socket, 'DATA', 354);
    const boundary = `wd_${Date.now().toString(16)}`;
    const payload = [
      `From: IMKAN WorkDrive <${config.from}>`,
      `To: ${message.to}`,
      `Subject: ${encodeHeader(message.subject)}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: 8bit',
      '',
      message.text,
      `--${boundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      'Content-Transfer-Encoding: 8bit',
      '',
      message.html,
      `--${boundary}--`,
      '',
    ].join('\r\n');
    socket.write(`${dotStuff(payload)}\r\n.\r\n`);
    await command(socket, null, 250);
    await command(socket, 'QUIT', 221);
  } finally {
    socket.end();
  }
}
