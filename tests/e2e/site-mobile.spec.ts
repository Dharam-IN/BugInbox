import { expect, test } from '@playwright/test';
import { WEB } from './support.ts';

test.describe.configure({ mode: 'serial' });

test('the public homepage works at phone width', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));

  await page.goto(`${WEB}/`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'no horizontal page scroll at phone width').toBeLessThanOrEqual(1);

  await test.step('the section links collapse into a menu', async () => {
    const toggle = page.getByRole('button', { name: 'Menu' });
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');

    // The desktop section nav is not shown while the menu is closed.
    await expect(page.locator('.site-nav-links')).toBeHidden();
    await expect(page.locator('.nav-panel')).toHaveCount(0);

    await toggle.click();
    await expect(page.getByRole('button', { name: 'Close' })).toHaveAttribute('aria-expanded', 'true');

    const panel = page.locator('.nav-panel');
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('link', { name: 'How it works' })).toBeVisible();
    await expect(panel.getByRole('link', { name: 'Get started' })).toBeVisible();
  });

  await test.step('Escape closes the menu', async () => {
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Menu' })).toHaveAttribute('aria-expanded', 'false');
  });

  await test.step('the menu can change the theme and navigate', async () => {
    await page.getByRole('button', { name: 'Menu' }).click();
    await page.locator('.nav-panel').getByRole('radio', { name: 'Dark', exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');

    await page.locator('.nav-panel').getByRole('link', { name: 'Get started' }).click();
    await expect(page).toHaveURL(`${WEB}/signup`);
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
  });

  expect(errors).toEqual([]);
});
