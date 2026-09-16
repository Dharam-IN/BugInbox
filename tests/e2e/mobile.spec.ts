import { expect, test } from '@playwright/test';
import { FIXTURE, WEB, createProject, openFixture, signUpAndVerify, uniqueEmail, widgetRoot } from './support.ts';

test.describe.configure({ mode: 'serial' });

test('the dashboard and the widget work at phone width', async ({ page, context }) => {
  const email = uniqueEmail('mobile');
  await signUpAndVerify(page, email);
  const projectKey = await createProject(page, 'Mobile Website', [FIXTURE]);

  await test.step('the dashboard lays out without horizontal scrolling', async () => {
    await page.goto(`${WEB}/`);
    await expect(page.getByRole('heading', { name: 'Projects', level: 1 })).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'no horizontal page scroll on the projects list').toBeLessThanOrEqual(1);

    await page.getByRole('link', { name: 'Mobile Website' }).click();
    await expect(page.getByRole('link', { name: 'Widget settings' })).toBeVisible();
  });

  const reporterContext = await context.browser()!.newContext({
    viewport: { width: 390, height: 780 },
    isMobile: true,
    hasTouch: true,
  });
  const reporter = await reporterContext.newPage();

  await test.step('the widget appears and the form fits the viewport', async () => {
    await openFixture(reporter, '/', projectKey);
    const root = widgetRoot(reporter);
    await expect(root).toBeVisible();

    await root.getByRole('button', { name: 'Report a problem' }).click();
    const dialog = root.getByRole('dialog');
    await expect(dialog).toBeVisible();

    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeLessThanOrEqual(390);
    expect(box!.x).toBeGreaterThanOrEqual(0);

    const overflow = await reporter.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'the widget adds no horizontal scroll to the host page').toBeLessThanOrEqual(1);
  });

  await test.step('turning mobile visibility off hides the widget on phones', async () => {
    await page.getByRole('link', { name: 'Widget settings' }).click();
    await page.getByLabel('Show on mobile').uncheck();
    await page.getByRole('button', { name: 'Save settings' }).click();
    await expect(page.getByText('Saved')).toBeVisible();

    // The first reporter still holds the cached configuration, which is the
    // documented behaviour: appearance changes take up to the cache window.
    await openFixture(reporter, '/', projectKey);
    await expect(reporter.getByText(/eligible=true/)).toBeVisible();

    // A browser without that cached response sees the new setting at once.
    const freshContext = await context.browser()!.newContext({
      viewport: { width: 390, height: 780 },
      isMobile: true,
      hasTouch: true,
    });
    const freshReporter = await freshContext.newPage();
    await openFixture(freshReporter, '/', projectKey);
    await expect(freshReporter.getByText(/eligible=false/)).toBeVisible();
    await expect(widgetRoot(freshReporter).getByRole('button', { name: 'Report a problem' })).toBeHidden();
    await freshContext.close();
  });

  await reporterContext.close();
});
