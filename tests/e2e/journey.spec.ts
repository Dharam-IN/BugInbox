import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  FIXTURE,
  WEB,
  createProject,
  findMessage,
  openFixture,
  signUpAndVerify,
  uniqueEmail,
  widgetRoot,
} from './support.ts';

const here = dirname(fileURLToPath(import.meta.url));

test.describe.configure({ mode: 'serial' });

test('owner signs up, installs the widget, receives a report with a screenshot and works it', async ({
  page,
  context,
}) => {
  const email = uniqueEmail('journey');

  await test.step('sign up and confirm the address in Mailpit', async () => {
    await signUpAndVerify(page, email);
  });

  const projectKey = await test.step('create a project for the fixture website', async () => {
    return createProject(page, 'Fixture Website', [FIXTURE, 'http://127.0.0.1:58081']);
  });

  await test.step('the snippet is shown with the project key', async () => {
    const snippet = await page.locator('pre.snippet code').first().innerText();
    expect(snippet).toContain('/widget/v1/buginbox.js');
    expect(snippet).toContain(projectKey);
  });

  // The reporter uses a separate browser context: no BugInbox session at all.
  const reporterContext = await context.browser()!.newContext({ viewport: { width: 1280, height: 900 } });
  const reporter = await reporterContext.newPage();

  await test.step('a reporter submits a report with a screenshot from the host website', async () => {
    await openFixture(reporter, '/pricing.html?utm_source=email&token=should-be-stripped', projectKey);

    const root = widgetRoot(reporter);
    await expect(root).toBeVisible();

    await root.getByRole('button', { name: 'Report a problem' }).click();
    await expect(root.getByRole('dialog')).toBeVisible();

    await root.getByLabel('What went wrong?').fill('The pricing cards overlap the footer at narrow widths.');
    await root.getByLabel(/Your email/).fill('reporter@reporter.test');

    const png = await readFile(join(here, 'fixtures', 'screenshot.png'));
    await root.locator('input[type="file"]').setInputFiles({
      name: 'screenshot.png',
      mimeType: 'image/png',
      buffer: png,
    });
    // The preview and its remove control appear before anything is sent.
    await expect(root.getByRole('button', { name: /Remove the attached image/ })).toBeVisible();

    await root.getByRole('button', { name: 'Send report' }).click();
    await expect(root.getByRole('heading', { name: 'Report sent' })).toBeVisible();
  });

  await test.step('the report appears in the owner inbox with its context', async () => {
    await page.goto(`${WEB}/reports`);
    const item = page.getByText('The pricing cards overlap the footer at narrow widths.');
    await expect(item).toBeVisible();
    await item.click();

    await expect(page.getByRole('heading', { name: 'Report' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'reporter@reporter.test' })).toBeVisible();
    // Query string and fragment must not have survived.
    await expect(page.getByText(`${FIXTURE}/pricing.html`, { exact: true })).toBeVisible();
    await expect(page.getByText('should-be-stripped')).toHaveCount(0);

    const screenshot = page.getByRole('img', { name: 'Screenshot attached by the reporter' });
    await expect(screenshot).toBeVisible();
    const naturalWidth = await screenshot.evaluate((img) => (img as HTMLImageElement).naturalWidth);
    expect(naturalWidth).toBeGreaterThan(0);
  });

  await test.step('the owner changes the status', async () => {
    await page.getByRole('button', { name: 'In progress' }).click();
    await expect(page.locator('.badge.in_progress').first()).toBeVisible();
  });

  await test.step('the notification email arrived in Mailpit', async () => {
    const message = await findMessage(email, (m) => m.Subject === 'New report in Fixture Website');
    expect(message.To[0]?.Address).toBe(email);
  });

  await reporterContext.close();
});

test('the widget respects page rules, pause and manual triggers', async ({ page, context }) => {
  const email = uniqueEmail('rules');
  await signUpAndVerify(page, email);
  const projectKey = await createProject(page, 'Rules Website', [FIXTURE]);

  await test.step('exclude the admin section', async () => {
    const projectUrl = page.url().replace('/install', '/settings');
    await page.goto(projectUrl);
    const excludeInput = page.getByPlaceholder('/checkout/*');
    await excludeInput.fill('/admin/*');
    await excludeInput.press('Enter');
    await expect(page.getByText('/admin/*', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Save settings' }).click();
    await expect(page.getByText('Saved')).toBeVisible();
  });

  const reporterContext = await context.browser()!.newContext();
  const reporter = await reporterContext.newPage();

  await test.step('the launcher appears on an ordinary page', async () => {
    await openFixture(reporter, '/', projectKey);
    await expect(widgetRoot(reporter)).toBeVisible();
  });

  await test.step('the launcher does not appear in the excluded section', async () => {
    await openFixture(reporter, '/admin/', projectKey);
    await expect(reporter.getByText(/eligible=false/)).toBeVisible();
    await expect(widgetRoot(reporter).getByRole('button', { name: 'Report a problem' })).toBeHidden();
  });

  await test.step('the server rejects a report that claims an excluded page', async () => {
    const status = await reporter.evaluate(
      async ([api, key]) => {
        const body = new FormData();
        body.set('message', 'A report that claims to come from the excluded admin area');
        body.set('pageUrl', `${window.location.origin}/admin/users`);
        const response = await fetch(`${api}/api/v1/widget/${key}/reports`, { method: 'POST', body });
        return response.status;
      },
      [WEB, projectKey] as const,
    );
    expect(status).toBe(403);
  });

  await test.step('pausing the project stops submissions even with cached configuration', async () => {
    await openFixture(reporter, '/', projectKey);
    await expect(widgetRoot(reporter)).toBeVisible();

    const projectUrl = page.url().includes('/settings') ? page.url() : `${page.url()}/settings`;
    await page.goto(projectUrl);
    await page.getByRole('button', { name: 'Pause project' }).click();
    await expect(page.getByRole('button', { name: 'Resume project' })).toBeVisible();

    // The reporter's page still holds the configuration it fetched while active.
    const result = await reporter.evaluate(
      async ([api, key]) => {
        const body = new FormData();
        body.set('message', 'Submitted from a browser that still thinks the project is active');
        const response = await fetch(`${api}/api/v1/widget/${key}/reports`, { method: 'POST', body });
        return { status: response.status, payload: await response.json() };
      },
      [WEB, projectKey] as const,
    );
    expect(result.status).toBe(409);
    expect(result.payload.error.code).toBe('project_paused');
  });

  await reporterContext.close();
});

test('SPA navigation, the host API and host resilience', async ({ page, context }) => {
  const email = uniqueEmail('spa');
  await signUpAndVerify(page, email);
  const projectKey = await createProject(page, 'SPA Website', [FIXTURE]);

  await test.step('exclude /admin/* so route changes can be observed', async () => {
    await page.goto(page.url().replace('/install', '/settings'));
    const excludeInput = page.getByPlaceholder('/checkout/*');
    await excludeInput.fill('/admin/*');
    await excludeInput.press('Enter');
    await expect(page.getByText('/admin/*', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Save settings' }).click();
    await expect(page.getByText('Saved')).toBeVisible();
  });

  const reporterContext = await context.browser()!.newContext();
  const reporter = await reporterContext.newPage();

  await test.step('the host page opens the form from its own button', async () => {
    await openFixture(reporter, '/app/', projectKey);
    await expect(reporter.getByText(/initialised=true/)).toBeVisible();

    // The floating launcher is not used on this page; the host button is.
    await reporter.getByRole('button', { name: 'Report a bug' }).click();
    await expect(widgetRoot(reporter).getByRole('dialog')).toBeVisible();
    await reporter.keyboard.press('Escape');
    await expect(widgetRoot(reporter).getByRole('dialog')).toBeHidden();
  });

  await test.step('pushState navigation re-evaluates the rules', async () => {
    await reporter.getByRole('button', { name: 'Reports' }).click();
    await expect(reporter.getByText('route: /app/reports')).toBeVisible();
    await expect(reporter.getByText(/eligible=true/)).toBeVisible();

    await reporter.getByRole('button', { name: 'Admin billing (excluded)' }).click();
    await expect(reporter.getByText('route: /admin/billing')).toBeVisible();
    await expect(reporter.getByText(/eligible=false/)).toBeVisible();

    // Browser back must restore eligibility without a reload.
    await reporter.goBack();
    await expect(reporter.getByText(/eligible=true/)).toBeVisible();
  });

  await test.step('an open form closes when the route becomes ineligible', async () => {
    await reporter.getByRole('button', { name: 'Report a bug' }).click();
    await expect(widgetRoot(reporter).getByRole('dialog')).toBeVisible();

    await reporter.getByRole('button', { name: 'Admin billing (excluded)' }).click();
    await expect(reporter.getByText(/formOpen=false/)).toBeVisible();
    await expect(widgetRoot(reporter).getByRole('dialog')).toBeHidden();
  });

  await test.step('destroy removes the widget entirely and init brings it back', async () => {
    await reporter.getByRole('button', { name: 'Sign out' }).click();
    await expect(widgetRoot(reporter)).toHaveCount(0);

    await reporter.getByRole('button', { name: 'Sign in' }).click();
    await expect(reporter.getByText(/initialised=true/)).toBeVisible();
  });

  await test.step('the host website still works when BugInbox is unreachable', async () => {
    const errors: string[] = [];
    reporter.on('pageerror', (error) => errors.push(error.message));

    await reporter.goto(`${FIXTURE}/offline.html`);
    await reporter.getByRole('button', { name: /Host clicks/ }).click();
    await reporter.getByRole('button', { name: /Host clicks/ }).click();
    await expect(reporter.getByRole('button', { name: 'Host clicks: 2' })).toBeVisible();
    await expect(reporter.locator('#host-status')).toContainText('Host page ready');
    expect(errors, 'the host page threw no script errors').toEqual([]);
  });

  await reporterContext.close();
});

test('the widget form is operable by keyboard alone', async ({ page, context }) => {
  const email = uniqueEmail('a11y');
  await signUpAndVerify(page, email);
  const projectKey = await createProject(page, 'Keyboard Website', [FIXTURE]);

  const reporterContext = await context.browser()!.newContext();
  const reporter = await reporterContext.newPage();
  await openFixture(reporter, '/', projectKey);

  const root = widgetRoot(reporter);
  const launcher = root.getByRole('button', { name: 'Report a problem' });
  await expect(launcher).toBeVisible();

  await test.step('the launcher can be reached and activated with the keyboard', async () => {
    await launcher.focus();
    await reporter.keyboard.press('Enter');
    await expect(root.getByRole('dialog')).toBeVisible();
    // Focus lands in the description field when the form opens.
    await expect(root.getByLabel('What went wrong?')).toBeFocused();
  });

  await test.step('a report can be filled in and sent without a mouse', async () => {
    await reporter.keyboard.type('Reported entirely with the keyboard, no pointer involved at all.');
    await reporter.keyboard.press('Tab');
    await reporter.keyboard.type('keyboard@reporter.test');
    await root.getByRole('button', { name: 'Send report' }).press('Enter');
    await expect(root.getByRole('heading', { name: 'Report sent' })).toBeVisible();
  });

  await test.step('Escape closes the form and focus returns to the launcher', async () => {
    await reporter.keyboard.press('Escape');
    await expect(root.getByRole('dialog')).toBeHidden();
    const focusedText = await reporter.evaluate(() => {
      const host = document.querySelector('[data-buginbox="root"]');
      const inner = host?.shadowRoot?.activeElement;
      return inner?.textContent ?? document.activeElement?.tagName ?? '';
    });
    expect(focusedText).toContain('Report a problem');
  });

  await reporterContext.close();
});
