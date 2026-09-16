import { config } from '../config.ts';
import { escapeHtml } from './html.ts';
import type { OutgoingMail } from './mail.ts';

const STYLE_BODY =
  'font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;' +
  'color:#16181d;line-height:1.5;font-size:15px;max-width:560px;margin:0 auto;padding:24px';
const STYLE_BUTTON =
  'display:inline-block;background:#2f6df6;color:#ffffff;text-decoration:none;' +
  'padding:10px 18px;border-radius:8px;font-weight:600';

function layout(title: string, bodyHtml: string): string {
  return [
    '<!doctype html><html><body style="margin:0;background:#f6f7f9">',
    `<div style="${STYLE_BODY}">`,
    `<h1 style="font-size:19px;margin:0 0 16px">${escapeHtml(title)}</h1>`,
    bodyHtml,
    '<p style="color:#6b7280;font-size:13px;margin-top:28px">BugInbox</p>',
    '</div></body></html>',
  ].join('');
}

export function verifyEmailMail(to: string, token: string): OutgoingMail {
  const link = `${config().publicBaseUrl}/verify-email?token=${encodeURIComponent(token)}`;
  return {
    to,
    subject: 'Confirm your BugInbox email address',
    text: `Confirm your BugInbox email address by opening this link:\n\n${link}\n\nThe link expires in 24 hours. If you did not create an account, ignore this email.`,
    html: layout(
      'Confirm your email address',
      `<p>Confirm your BugInbox email address to finish setting up your account.</p>
       <p><a href="${escapeHtml(link)}" style="${STYLE_BUTTON}">Confirm email address</a></p>
       <p style="color:#6b7280;font-size:13px">The link expires in 24 hours. If you did not create an account, ignore this email.</p>`,
    ),
  };
}

export function passwordResetMail(to: string, token: string): OutgoingMail {
  const link = `${config().publicBaseUrl}/reset-password?token=${encodeURIComponent(token)}`;
  return {
    to,
    subject: 'Reset your BugInbox password',
    text: `Reset your BugInbox password by opening this link:\n\n${link}\n\nThe link expires in 1 hour. If you did not request a reset, ignore this email.`,
    html: layout(
      'Reset your password',
      `<p>Use the link below to choose a new BugInbox password.</p>
       <p><a href="${escapeHtml(link)}" style="${STYLE_BUTTON}">Choose a new password</a></p>
       <p style="color:#6b7280;font-size:13px">The link expires in 1 hour. If you did not request a reset, ignore this email.</p>`,
    ),
  };
}

export interface ReportMailInput {
  to: string;
  projectName: string;
  projectId: string;
  reportId: string;
  message: string;
  reporterEmail: string | null;
  pageUrl: string | null;
  pageContext: string | null;
  createdAt: Date;
  hasScreenshot: boolean;
}

export function newReportMail(input: ReportMailInput): OutgoingMail {
  const link = `${config().publicBaseUrl}/projects/${input.projectId}/reports/${input.reportId}`;
  const where = input.pageContext ?? input.pageUrl ?? 'Not collected';
  const preview = input.message.length > 400 ? `${input.message.slice(0, 400)}...` : input.message;

  const textLines = [
    `New report in ${input.projectName}`,
    '',
    preview,
    '',
    `Page: ${where}`,
    `Reporter email: ${input.reporterEmail ?? 'not provided'}`,
    `Screenshot: ${input.hasScreenshot ? 'yes' : 'no'}`,
    `Received: ${input.createdAt.toISOString()}`,
    '',
    `Open the report: ${link}`,
  ];

  return {
    to: input.to,
    subject: `New report in ${input.projectName}`,
    text: textLines.join('\n'),
    html: layout(
      `New report in ${input.projectName}`,
      `<div style="white-space:pre-wrap;background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:14px;margin:0 0 16px">${escapeHtml(preview)}</div>
       <table style="font-size:14px;border-collapse:collapse">
         <tr><td style="padding:2px 12px 2px 0;color:#6b7280">Page</td><td>${escapeHtml(where)}</td></tr>
         <tr><td style="padding:2px 12px 2px 0;color:#6b7280">Reporter email</td><td>${escapeHtml(input.reporterEmail ?? 'not provided')}</td></tr>
         <tr><td style="padding:2px 12px 2px 0;color:#6b7280">Screenshot</td><td>${input.hasScreenshot ? 'yes' : 'no'}</td></tr>
         <tr><td style="padding:2px 12px 2px 0;color:#6b7280">Received</td><td>${escapeHtml(input.createdAt.toISOString())}</td></tr>
       </table>
       <p style="margin-top:20px"><a href="${escapeHtml(link)}" style="${STYLE_BUTTON}">Open the report</a></p>`,
    ),
  };
}
