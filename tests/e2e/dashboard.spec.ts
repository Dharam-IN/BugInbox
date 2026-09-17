import { expect, test, type Page } from '@playwright/test';
import { FIXTURE, WEB, clearIngestLimits, createProject, signUpAndVerify, uniqueEmail } from './support.ts';

test.describe.configure({ mode: 'serial' });

function watchForErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  return errors;
}

/**
 * Submit reports through the real public ingestion endpoint from an allowed
 * origin. This is synthetic data in a brand-new project belonging to a
 * brand-new owner, so no existing project is touched.
 */
async function sendReports(page: Page, projectKey: string, count: number, prefix: string): Promise<void> {
  await page.goto(`${FIXTURE}/`);
  const BATCH = 8;

  for (let offset = 0; offset < count; offset += BATCH) {
    // The per-IP limit is deliberately low; clear it between batches so the
    // fixture can be built without weakening the limit itself.
    await clearIngestLimits();
    const failures = await page.evaluate(
      async ([api, key, from, size, total, label]) => {
        const problems: string[] = [];
        const end = Math.min(Number(from) + Number(size), Number(total));
        for (let index = Number(from); index < end; index += 1) {
          const body = new FormData();
          body.set('message', `${label} synthetic report number ${index + 1} for pagination and chart checks`);
          body.set('dedupeKey', `${label}-${index}-${Date.now()}`);
          const response = await fetch(`${api}/api/v1/widget/${key}/reports`, { method: 'POST', body });
          if (!response.ok) problems.push(`${index}: ${response.status}`);
        }
        return problems;
      },
      [WEB, projectKey, String(offset), String(BATCH), String(count), prefix] as const,
    );
    expect(failures, 'every synthetic report was accepted').toEqual([]);
  }
}

test('a new account sees a truthful empty overview and an onboarding action', async ({ page }) => {
  const errors = watchForErrors(page);
  await signUpAndVerify(page, uniqueEmail('overview-empty'));
  await page.goto(`${WEB}/dashboard`);

  await expect(page.getByRole('heading', { name: 'Overview', level: 1 })).toBeVisible();

  // Zeroes, not invented activity.
  for (const label of ['Reports received', 'New', 'In progress', 'Resolved']) {
    const card = page.locator('.stat', { hasText: label });
    await expect(card.locator('.stat-value')).toHaveText('0');
  }

  await expect(page.getByRole('heading', { name: 'Create your first project' })).toBeVisible();
  await page.getByRole('link', { name: 'Create a project' }).click();
  await expect(page).toHaveURL(`${WEB}/projects/new`);

  expect(errors).toEqual([]);
});

test('the guided setup validates, creates once, and stays reachable afterwards', async ({ page }) => {
  await signUpAndVerify(page, uniqueEmail('setup'));
  await page.goto(`${WEB}/projects/new`);

  await test.step('it refuses to continue without a name or a website', async () => {
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByText('Give the project a name so you can recognise it later.')).toBeVisible();
    await expect(page.getByText('Enter the website address.')).toBeVisible();
    // Still on the first step.
    await expect(page.getByRole('heading', { name: 'Where will you collect feedback?' })).toBeVisible();
  });

  await test.step('it explains what a bare domain will become', async () => {
    await page.getByLabel('Project name').fill('Setup Website');
    await page.getByLabel('Website address', { exact: true }).fill('example.com');
    await expect(page.getByText('https://example.com', { exact: false })).toBeVisible();
    await expect(page.getByText('Assumed https.')).toBeVisible();
  });

  await test.step('a full page URL is reduced to its origin, and said so', async () => {
    await page.getByLabel('Website address', { exact: true }).fill('https://example.com/pricing?utm=x');
    await expect(page.getByText('Permission applies to the whole website address, not just that page.')).toBeVisible();
    await expect(page.locator('.resolved-origin code')).toHaveText('https://example.com');
  });

  await test.step('unsupported input is refused rather than guessed at', async () => {
    for (const [value, message] of [
      ['ftp://example.com', 'Only http:// and https:// addresses are supported.'],
      ['https://*.example.com', 'Wildcards are not supported. Add each website address separately.'],
      ['https://user:pass@example.com', 'Remove the username and password from the address.'],
    ] as const) {
      await page.getByLabel('Website address', { exact: true }).fill(value);
      await page.getByRole('button', { name: 'Continue' }).click();
      await expect(page.getByText(message)).toBeVisible();
    }
  });

  let projectId = '';

  await test.step('it creates the project exactly once', async () => {
    await page.getByLabel('Website address', { exact: true }).fill('https://setup.test');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('heading', { name: 'How should it look?' })).toBeVisible();

    await page.getByLabel('Launcher label').fill('Tell us what broke');
    await page.getByRole('button', { name: 'Create project' }).click();
    await expect(page.getByRole('heading', { name: /^Install it on/ })).toBeVisible();

    // Going back to appearance and forward again must not create a second one.
    const settingsHref = await page.getByRole('link', { name: 'Widget settings' }).getAttribute('href');
    projectId = settingsHref?.match(/projects\/([0-9a-f-]{36})/)?.[1] ?? '';
    expect(projectId).not.toBe('');

    const count = await page.evaluate(async () => {
      const response = await fetch('/api/v1/projects', { credentials: 'same-origin' });
      return ((await response.json()) as { projects: unknown[] }).projects.length;
    });
    expect(count, 'exactly one project was created').toBe(1);
  });

  await test.step('what was chosen during setup is saved', async () => {
    const saved = await page.evaluate(async (id) => {
      const response = await fetch(`/api/v1/projects/${id}`, { credentials: 'same-origin' });
      const payload = await response.json();
      return { origins: payload.project.origins, launcher: payload.project.appearance.launcherText };
    }, projectId);

    // Exactly the origin that was shown, and nothing broader.
    expect(saved.origins).toEqual(['https://setup.test']);
    expect(saved.launcher).toBe('Tell us what broke');
  });

  await test.step('installation is still reachable after leaving the flow', async () => {
    await page.goto(`${WEB}/projects`);
    await page.getByRole('link', { name: 'Install' }).first().click();
    await expect(page.getByRole('heading', { name: 'Install the widget' })).toBeVisible();
    await expect(page.locator('pre.snippet code').first()).toContainText('bi_pub_');
  });
});

test('overview figures match the reports, and change when a report does', async ({ page }) => {
  const errors = watchForErrors(page);
  await signUpAndVerify(page, uniqueEmail('overview-data'));
  const project = await createProject(page, 'Overview Data Site', [FIXTURE]);

  await sendReports(page, project.key, 3, 'overview');

  await page.goto(`${WEB}/dashboard`);
  const received = page.locator('.stat', { hasText: 'Reports received' }).locator('.stat-value');
  await expect(received).toHaveText('3');
  await expect(page.locator('.stat', { hasText: 'New' }).first().locator('.stat-value')).toHaveText('3');

  await test.step('the chart totals agree with the cards', async () => {
    await page.locator('details.chart-data').first().locator('summary').click();
    const values = await page.locator('details.chart-data').first().locator('tbody td.numeric').allInnerTexts();
    const sum = values.reduce((total, value) => total + Number(value), 0);
    expect(sum).toBe(3);
  });

  await test.step('resolving a report moves it between the status cards', async () => {
    await page.goto(`${WEB}/reports`);
    await page.locator('.report-row').first().click();
    await page.getByRole('button', { name: 'Resolved' }).click();
    await expect(page.locator('.page-bar').getByText('Resolved')).toBeVisible();

    await page.goto(`${WEB}/dashboard`);
    await expect(page.locator('.stat', { hasText: 'Reports received' }).locator('.stat-value')).toHaveText('3');
    await expect(page.locator('.stat', { hasText: 'Resolved' }).locator('.stat-value')).toHaveText('1');
    await expect(page.locator('.stat', { hasText: 'New' }).first().locator('.stat-value')).toHaveText('2');
  });

  await test.step('the project filter narrows the figures', async () => {
    await page.selectOption('#overview-project', { label: 'Overview Data Site' });
    await expect(page.locator('.stat', { hasText: 'Reports received' }).locator('.stat-value')).toHaveText('3');
  });

  expect(errors).toEqual([]);
});

test('the inbox reaches reports past the first page', async ({ page }) => {
  await signUpAndVerify(page, uniqueEmail('paging'));
  const project = await createProject(page, 'Paging Site', [FIXTURE]);

  // Enough to need three pages at 25 per page.
  await sendReports(page, project.key, 60, 'paging');

  await page.goto(`${WEB}/projects/${project.id}/reports`);
  await expect(page.locator('.report-row')).toHaveCount(25);
  await expect(page.getByText('Showing 25 reports')).toBeVisible();

  await page.getByRole('button', { name: 'Load more' }).click();
  await expect(page.locator('.report-row')).toHaveCount(50);

  await page.getByRole('button', { name: 'Load more' }).click();
  await expect(page.locator('.report-row')).toHaveCount(60);
  await expect(page.getByText('End of the list')).toBeVisible();

  // Every loaded row is distinct, so paging does not repeat or skip.
  const links = await page.locator('.report-row').evaluateAll((rows) =>
    rows.map((row) => (row as HTMLAnchorElement).getAttribute('href')),
  );
  expect(new Set(links).size).toBe(60);

  await test.step('status tabs filter and keep their count semantics', async () => {
    await page.getByRole('tab', { name: /^New/ }).click();
    await expect(page).toHaveURL(/status=new/);
    await expect(page.locator('.report-row').first()).toBeVisible();

    await page.getByRole('tab', { name: /^Resolved/ }).click();
    await expect(page.getByText('No matching reports')).toBeVisible();

    // The filter survives a reload, so Back and shared links behave.
    await page.reload();
    await expect(page.getByText('No matching reports')).toBeVisible();
  });
});

test('the projects list is searchable and shows useful state', async ({ page }) => {
  await signUpAndVerify(page, uniqueEmail('projects-list'));
  await createProject(page, 'Alpha Marketing', ['https://alpha.test']);
  await createProject(page, 'Beta Docs', ['https://beta.test']);

  await page.goto(`${WEB}/projects`);
  await expect(page.locator('.data-table tbody tr')).toHaveCount(2);
  await expect(page.getByText('No reports yet').first()).toBeVisible();

  await page.getByLabel('Search projects').fill('beta');
  await expect(page.locator('.data-table tbody tr')).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'Beta Docs' })).toBeVisible();

  await page.getByLabel('Search projects').fill('nothing matches this');
  await expect(page.getByRole('heading', { name: 'No matching projects' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear search' }).click();
  await expect(page.locator('.data-table tbody tr')).toHaveCount(2);
});

test('the report detail screenshot enlarges and closes with the keyboard', async ({ page, context }) => {
  await signUpAndVerify(page, uniqueEmail('detail'));
  const project = await createProject(page, 'Detail Site', [FIXTURE]);

  // Send one report with a screenshot through the real widget.
  const reporterContext = await context.browser()!.newContext();
  const reporter = await reporterContext.newPage();
  await reporter.goto(`${FIXTURE}/?key=${project.key}&api=${encodeURIComponent(WEB)}`);
  const root = reporter.locator('[data-buginbox="root"]');
  await root.getByRole('button', { name: 'Report a problem' }).click();
  await root.getByLabel('What went wrong?').fill('A report used to check the detail screen and its screenshot.');
  await root.locator('input[type="file"]').setInputFiles('tests/e2e/fixtures/screenshot.png');
  await root.getByRole('button', { name: 'Send report' }).click();
  await expect(root.getByRole('heading', { name: 'Report sent' })).toBeVisible();
  await reporterContext.close();

  await page.goto(`${WEB}/projects/${project.id}/reports`);
  await page.locator('.report-row').first().click();

  await expect(page.getByRole('heading', { name: 'What the reporter said' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Detail Site/ }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Enlarge the screenshot' }).click();
  const lightbox = page.getByRole('dialog', { name: 'Screenshot' });
  await expect(lightbox).toBeVisible();

  // It declares aria-modal, so Tab must not walk out into the page behind it.
  // It used to: the first Tab landed on <body> and the next ones on the
  // sidebar links underneath the overlay.
  for (let press = 0; press < 5; press += 1) {
    await page.keyboard.press('Tab');
    expect(
      await page.evaluate(() => Boolean(document.activeElement?.closest('.lightbox'))),
      'focus stays inside the enlarged screenshot',
    ).toBe(true);
  }

  await page.keyboard.press('Escape');
  await expect(lightbox).toBeHidden();

  // Closing returns focus to the control that opened it, not to the document.
  await expect(page.getByRole('button', { name: 'Enlarge the screenshot' })).toBeFocused();
});

test('a report opened from a link is deleted without stranding the browser', async ({ page, context }) => {
  await signUpAndVerify(page, uniqueEmail('delete-nav'));
  const project = await createProject(page, 'Delete Nav Site', [FIXTURE]);
  await sendReports(page, project.key, 1, 'delete-nav');

  await page.goto(`${WEB}/reports`);
  const href = await page.locator('.report-row').first().getAttribute('href');
  expect(href).toBeTruthy();

  // A notification email opens the report in a tab with no history behind it.
  // `navigate(-1)` after deleting then left the owner on about:blank.
  const fresh = await context.newPage();
  await fresh.goto(`${WEB}${href}`);
  await expect(fresh.getByRole('heading', { name: 'What the reporter said' })).toBeVisible();

  await fresh.getByRole('button', { name: 'Delete this report…' }).click();
  await fresh.getByRole('button', { name: 'Yes, delete it' }).click();

  await expect(fresh).toHaveURL(`${WEB}/reports`);
  await expect(fresh.getByRole('heading', { name: 'All reports', level: 1 })).toBeVisible();
  await expect(fresh.locator('.report-row')).toHaveCount(0);

  // And the same for the shape a notification email actually sends,
  // /projects/:projectId/reports/:reportId, also in a tab with no history.
  await sendReports(page, project.key, 1, 'delete-nav-email');
  await page.goto(`${WEB}/projects/${project.id}/reports`);
  const emailedId = (await page.locator('.report-row').first().getAttribute('href'))!.split('/').pop();

  const emailed = await context.newPage();
  await emailed.goto(`${WEB}/projects/${project.id}/reports/${emailedId}`);
  await expect(emailed.getByRole('heading', { name: 'What the reporter said' })).toBeVisible();
  await emailed.getByRole('button', { name: 'Delete this report…' }).click();
  await emailed.getByRole('button', { name: 'Yes, delete it' }).click();
  await expect(emailed).toHaveURL(`${WEB}/projects/${project.id}/reports`);
  await expect(emailed.locator('.report-row')).toHaveCount(0);
  await emailed.close();
  await fresh.close();
});

test('retrying an interrupted setup does not create a second project', async ({ page }) => {
  await signUpAndVerify(page, uniqueEmail('setup-retry'));

  // The guided setup writes the project, then saves the appearance in a second
  // call. Failing only the second one is the realistic interruption: the
  // project already exists, and the owner is invited to try again.
  let appearanceCallsFailed = 0;
  await page.route('**/api/v1/projects/*', async (route) => {
    if (route.request().method() === 'PATCH' && appearanceCallsFailed < 2) {
      appearanceCallsFailed += 1;
      await route.abort('failed');
      return;
    }
    await route.continue();
  });

  await page.goto(`${WEB}/projects/new`);
  await page.getByLabel('Project name').fill('Retry Once');
  await page.getByLabel('Website address', { exact: true }).fill('https://retry.example');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Create project' }).click();

  // The first failure says plainly that the project itself was saved.
  await expect(page.getByText(/was created — only the appearance could not be saved/)).toBeVisible();

  // A second attempt, and a third that succeeds.
  await page.getByRole('button', { name: 'Save the appearance and continue' }).click();
  await expect(page.getByText(/was created — only the appearance could not be saved/)).toBeVisible();
  await page.getByRole('button', { name: 'Save the appearance and continue' }).click();
  await expect(page.getByRole('heading', { name: /^Install it on/ })).toBeVisible();

  expect(appearanceCallsFailed, 'both simulated failures were exercised').toBe(2);

  // Three presses of the create button, exactly one project.
  await page.goto(`${WEB}/projects`);
  await expect(page.getByRole('link', { name: 'Retry Once', exact: true })).toHaveCount(1);
  await expect(page.locator('.data-table tbody tr')).toHaveCount(1);
});
