import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { FIXTURE, WEB, createProject, signUpAndVerify, uniqueEmail } from './support.ts';

/**
 * Automated accessibility checks.
 *
 * axe-core finds a subset of real problems and proves nothing about the rest:
 * it cannot judge whether a label is meaningful, whether a reading order makes
 * sense or whether a screen reader can actually complete a task. Passing here
 * is a floor, not a compliance claim. Keyboard operation, focus management and
 * focus return are asserted separately in `site.spec.ts`, `journey.spec.ts` and
 * `dashboard.spec.ts`.
 *
 * Both themes are covered because the palettes are independent: the light
 * accent used to fail the contrast threshold as text while the dark one passed.
 */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function violations(page: Page) {
  // Colour tokens are transitioned, so sampling too early reads a blend of the
  // two themes rather than either of them.
  await page.waitForTimeout(600);
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    nodes: violation.nodes.map((node) => `${node.target.join(' ')} — ${node.failureSummary ?? ''}`),
  }));
}

async function inTheme(page: Page, path: string, theme: 'light' | 'dark') {
  await page.goto(`${WEB}${path}`);
  await page.evaluate((value: string) => {
    try {
      window.localStorage.setItem('buginbox.theme', value);
    } catch {
      /* storage may be blocked; the attribute below still applies it */
    }
  }, theme);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

test('the public pages pass axe in both themes', async ({ page }) => {
  for (const theme of ['light', 'dark'] as const) {
    for (const path of ['/', '/login', '/signup', '/forgot-password', '/reset-password?token=stale-token-value']) {
      await inTheme(page, path, theme);
      expect(await violations(page), `${path} (${theme})`).toEqual([]);
    }
  }
});

test('the signed-in screens pass axe in both themes', async ({ page, context }) => {
  test.slow();
  await signUpAndVerify(page, uniqueEmail('a11y'));
  const project = await createProject(page, 'Accessibility Site', [FIXTURE]);

  // One real report, so the inbox and the detail screen have something in them.
  const reporterContext = await context.browser()!.newContext();
  const reporter = await reporterContext.newPage();
  await reporter.goto(`${FIXTURE}/?key=${project.key}&api=${encodeURIComponent(WEB)}`);
  const root = reporter.locator('[data-buginbox="root"]');
  await root.getByRole('button', { name: 'Report a problem' }).click();
  await root.getByLabel('What went wrong?').fill('A report that gives the inbox and detail screens real content.');
  await root.locator('input[type="file"]').setInputFiles('tests/e2e/fixtures/screenshot.png');
  await root.getByRole('button', { name: 'Send report' }).click();
  await expect(root.getByRole('heading', { name: 'Report sent' })).toBeVisible();
  await reporterContext.close();

  await page.goto(`${WEB}/reports`);
  const reportHref = await page.locator('.report-row').first().getAttribute('href');

  const paths = [
    '/dashboard',
    '/projects',
    '/projects/new',
    '/reports',
    reportHref!,
    `/projects/${project.id}/install`,
    `/projects/${project.id}/settings`,
    '/account',
  ];

  for (const theme of ['light', 'dark'] as const) {
    for (const path of paths) {
      await inTheme(page, path, theme);
      expect(await violations(page), `${path} (${theme})`).toEqual([]);
    }
  }

  // The enlarged screenshot is a dialog rendered over the page; check it too.
  await inTheme(page, reportHref!, 'light');
  await page.getByRole('button', { name: 'Enlarge the screenshot' }).click();
  await expect(page.getByRole('dialog', { name: 'Screenshot' })).toBeVisible();
  expect(await violations(page), 'enlarged screenshot').toEqual([]);
});
