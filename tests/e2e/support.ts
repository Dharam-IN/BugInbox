import { expect, type Page } from '@playwright/test';

export const WEB = process.env.BUGINBOX_WEB_URL ?? 'http://localhost:58080';
export const FIXTURE = process.env.BUGINBOX_FIXTURE_URL ?? 'http://localhost:58081';
export const MAILPIT = process.env.BUGINBOX_MAILPIT_URL ?? 'http://localhost:58025';

export const PASSWORD = 'playwright-local-password';

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}@owner.test`;
}

interface MailpitMessage {
  ID: string;
  Subject: string;
  To: Array<{ Address: string }>;
}

export async function findMessage(
  query: string,
  predicate: (message: MailpitMessage) => boolean,
  timeoutMs = 20_000,
): Promise<MailpitMessage> {
  const deadline = Date.now() + timeoutMs;
  let last: MailpitMessage[] = [];
  while (Date.now() < deadline) {
    const response = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(query)}&limit=50`);
    if (response.ok) {
      last = ((await response.json()) as { messages: MailpitMessage[] }).messages ?? [];
      const found = last.find(predicate);
      if (found) return found;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`No matching message for "${query}". Saw: ${last.map((m) => m.Subject).join(' | ')}`);
}

/** Pull the first link out of a Mailpit message's plain-text part. */
export async function linkFromMessage(id: string, pattern: RegExp): Promise<string> {
  const response = await fetch(`${MAILPIT}/api/v1/message/${id}`);
  const message = (await response.json()) as { Text: string; HTML: string };
  const source = `${message.Text}\n${message.HTML}`;
  const match = source.match(pattern);
  if (!match) throw new Error(`No link matching ${pattern} in message ${id}`);
  return match[0].replace(/&amp;/g, '&');
}

/** Sign up through the real UI and confirm the address via Mailpit. */
export async function signUpAndVerify(page: Page, email: string): Promise<void> {
  await page.goto(`${WEB}/signup`);
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page.getByRole('heading', { name: 'Projects', level: 1 })).toBeVisible();

  const message = await findMessage(email, (m) => m.Subject.includes('Confirm your BugInbox email'));
  const link = await linkFromMessage(message.ID, /https?:\/\/[^\s"'<>]*\/verify-email\?token=[^\s"'<>]+/);

  await page.goto(link);
  await expect(page.getByText('Your email address is confirmed.')).toBeVisible();
}

export async function createProject(page: Page, name: string, origins: string[]): Promise<string> {
  await page.goto(`${WEB}/projects/new`);
  await page.getByLabel('Project name').fill(name);
  await page.getByLabel('Allowed website origins').fill(origins.join('\n'));
  await page.getByRole('button', { name: 'Create project' }).click();

  await expect(page.getByRole('heading', { name: 'Install the widget' })).toBeVisible();
  const key = await page.locator('pre.snippet code').first().innerText();
  const match = key.match(/bi_pub_[0-9a-f]{32}/);
  if (!match) throw new Error('No project key found in the install snippet');
  return match[0];
}

/** Open a fixture page with the project key remembered for that origin. */
export async function openFixture(page: Page, path: string, projectKey: string): Promise<void> {
  const separator = path.includes('?') ? '&' : '?';
  await page.goto(`${FIXTURE}${path}${separator}key=${projectKey}&api=${encodeURIComponent(WEB)}`);
}

export function widgetRoot(page: Page) {
  return page.locator('[data-buginbox="root"]');
}
