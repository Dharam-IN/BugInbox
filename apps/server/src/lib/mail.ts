import nodemailer, { type Transporter } from 'nodemailer';
import { config } from '../config.ts';

let transporter: Transporter | null = null;

export function getTransport(): Transporter {
  if (!transporter) {
    const cfg = config();
    transporter = nodemailer.createTransport({
      host: cfg.SMTP_HOST,
      port: cfg.SMTP_PORT,
      secure: cfg.SMTP_SECURE,
      auth: cfg.SMTP_USER ? { user: cfg.SMTP_USER, pass: cfg.SMTP_PASS ?? '' } : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }
  return transporter;
}

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Stable identifier so retries reuse the same Message-ID where the MTA honours it. */
  messageId?: string;
}

export async function sendMail(mail: OutgoingMail): Promise<{ messageId: string }> {
  const cfg = config();
  const info = await getTransport().sendMail({
    from: cfg.MAIL_FROM,
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    messageId: mail.messageId,
  });
  return { messageId: String(info.messageId ?? '') };
}

export async function mailHealthy(): Promise<boolean> {
  try {
    await getTransport().verify();
    return true;
  } catch {
    return false;
  }
}

export function closeMail(): void {
  transporter?.close();
  transporter = null;
}
