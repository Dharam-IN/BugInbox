import { expect, test, type Page } from '@playwright/test';
import { PASSWORD, WEB, createProject, signUpAndVerify, uniqueEmail } from './support.ts';

test.describe.configure({ mode: 'serial' });

const themeOf = (page: Page) => page.evaluate(() => document.documentElement.dataset.theme);
const storedPreference = (page: Page) => page.evaluate(() => window.localStorage.getItem('buginbox.theme'));

function themeButton(page: Page, name: 'Light' | 'Dark' | 'System') {
  // The nav renders one selector; the mobile panel adds a second, so scope to the first.
  return page.getByRole('radio', { name, exact: true }).first();
}

/** Collect real page errors and console errors, ignoring nothing. */
function watchForErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  return errors;
}

test('the public homepage works for a signed-out visitor', async ({ page }) => {
  const errors = watchForErrors(page);
  await page.goto(`${WEB}/`);

  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Collect website bug reports with the context you need.',
  );
  await expect(page).toHaveTitle(/BugInbox/);

  // Signed-out navigation offers the two auth actions and never the dashboard.
  await expect(page.getByRole('link', { name: 'Get started' }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign in' }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open dashboard' })).toHaveCount(0);

  // Every required section is present and reachable from the nav.
  for (const id of ['how-it-works', 'who', 'features', 'control', 'faq']) {
    await expect(page.locator(`#${id}`)).toHaveCount(1);
  }

  // The preview is clearly marked so nobody reads it as real customer data.
  await expect(page.getByText('Example — illustrative, not real reports')).toBeVisible();

  // No owner data of any kind is exposed on the public page.
  const body = (await page.textContent('body')) ?? '';
  expect(body).not.toContain('owner@buginbox.test');
  expect(body).not.toContain('bi_pub_');

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'no horizontal page scroll').toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});

test('the homepage call-to-action links reach the real forms', async ({ page }) => {
  await page.goto(`${WEB}/`);

  await page.getByRole('link', { name: 'Get started' }).first().click();
  await expect(page).toHaveURL(`${WEB}/signup`);
  await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible();

  await page.goto(`${WEB}/`);
  await page.getByRole('link', { name: 'Sign in' }).first().click();
  await expect(page).toHaveURL(`${WEB}/login`);
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
});

test('protected routes still redirect a signed-out visitor to sign in', async ({ page }) => {
  for (const path of ['/dashboard', '/reports', '/account', '/projects/new']) {
    await page.goto(`${WEB}${path}`);
    await expect(page, path).toHaveURL(`${WEB}/login`);
  }

  // An unknown path lands on the public homepage, not on the sign-in form.
  await page.goto(`${WEB}/not-a-real-page`);
  await expect(page).toHaveURL(`${WEB}/`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('a signed-in visitor gets the dashboard entry point from the homepage', async ({ page }) => {
  const email = uniqueEmail('site-signedin');
  await signUpAndVerify(page, email);

  await page.goto(`${WEB}/`);
  await expect(page.getByRole('link', { name: 'Open dashboard' }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Get started' })).toHaveCount(0);

  await page.getByRole('link', { name: 'Open dashboard' }).first().click();
  await expect(page).toHaveURL(`${WEB}/dashboard`);
  await expect(page.getByRole('heading', { name: 'Overview', level: 1 })).toBeVisible();

  // Projects now has its own route, reachable from the sidebar.
  await page.getByRole('link', { name: 'Projects', exact: true }).click();
  await expect(page).toHaveURL(`${WEB}/projects`);
  await expect(page.getByRole('heading', { name: 'Projects', level: 1 })).toBeVisible();
});

test('theme selection applies, persists and survives sign-out and sign-in', async ({ page }) => {
  const email = uniqueEmail('site-theme');
  await signUpAndVerify(page, email);

  await page.goto(`${WEB}/`);
  await expect(themeButton(page, 'System')).toHaveAttribute('aria-checked', 'true');

  await test.step('choosing dark applies it immediately', async () => {
    await themeButton(page, 'Dark').click();
    expect(await themeOf(page)).toBe('dark');
    expect(await storedPreference(page)).toBe('dark');
  });

  await test.step('it survives a reload', async () => {
    await page.reload();
    expect(await themeOf(page)).toBe('dark');
    await expect(themeButton(page, 'Dark')).toHaveAttribute('aria-checked', 'true');
  });

  await test.step('it survives navigating into the dashboard', async () => {
    await page.goto(`${WEB}/dashboard`);
    expect(await themeOf(page)).toBe('dark');
    await page.goto(`${WEB}/account`);
    expect(await themeOf(page)).toBe('dark');
  });

  await test.step('it survives signing out and back in', async () => {
    await page.goto(`${WEB}/account`);
    await page.getByRole('button', { name: 'Sign out of this browser' }).click();
    await expect(page).toHaveURL(/\/login$/);
    expect(await themeOf(page)).toBe('dark');

    await page.getByLabel('Email address').fill(email);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('heading', { name: 'Overview', level: 1 })).toBeVisible();
    expect(await themeOf(page)).toBe('dark');
  });

  await test.step('switching back to light works too', async () => {
    await themeButton(page, 'Light').click();
    expect(await themeOf(page)).toBe('light');
    await page.reload();
    expect(await themeOf(page)).toBe('light');
  });
});

test('the system option follows the operating system, and the others do not', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto(`${WEB}/`);

  await themeButton(page, 'System').click();
  expect(await themeOf(page)).toBe('light');

  await test.step('system reacts to an operating system change', async () => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect.poll(() => themeOf(page)).toBe('dark');
    await page.emulateMedia({ colorScheme: 'light' });
    await expect.poll(() => themeOf(page)).toBe('light');
  });

  await test.step('an explicit choice ignores the operating system', async () => {
    await themeButton(page, 'Dark').click();
    expect(await themeOf(page)).toBe('dark');

    await page.emulateMedia({ colorScheme: 'light' });
    await expect.poll(() => themeOf(page)).toBe('dark');

    await themeButton(page, 'Light').click();
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect.poll(() => themeOf(page)).toBe('light');
  });
});

test('the saved theme is applied before the application renders', async ({ page }) => {
  await page.goto(`${WEB}/`);
  await themeButton(page, 'Dark').click();
  expect(await themeOf(page)).toBe('dark');

  // Hold the application bundle back so the only thing that could have themed
  // the document is the pre-paint script in <head>.
  await page.route('**/assets/*.js', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    await route.continue();
  });

  await page.goto(`${WEB}/`, { waitUntil: 'commit' });

  // Sample the moment the theme attribute appears, and record how much of the
  // application had rendered by then.
  const handle = await page.waitForFunction(() => {
    const theme = document.documentElement.dataset.theme;
    if (!theme) return null;
    return { theme, rootChildren: document.getElementById('root')?.childElementCount ?? -1 };
  });
  const snapshot = (await handle.jsonValue()) as { theme: string; rootChildren: number };

  expect(snapshot.theme, 'themed before the app bundle ran').toBe('dark');
  expect(snapshot.rootChildren, 'nothing had rendered yet').toBeLessThanOrEqual(0);

  await page.unroute('**/assets/*.js');
});

test('changing the interface theme never changes a project widget setting', async ({ page }) => {
  const email = uniqueEmail('site-independence');
  await signUpAndVerify(page, email);
  const created = await createProject(page, 'Theme Independence Site', ['https://independence.test']);
  const projectId = created.id;
  expect(projectId).not.toBe('');

  const widgetTheme = () =>
    page.evaluate(async (id) => {
      const response = await fetch(`/api/v1/projects/${id}`, { credentials: 'same-origin' });
      const payload = await response.json();
      return payload.project.appearance.theme as string;
    }, projectId);

  // Give the project an explicit widget appearance that differs from what we
  // are about to select for the dashboard.
  await page.goto(`${WEB}/projects/${projectId}/settings`);
  await page.getByRole('group', { name: 'Appearance mode' }).getByRole('button', { name: 'Light' }).click();
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Saved')).toBeVisible();
  expect(await widgetTheme()).toBe('light');

  await test.step('switching the interface to dark leaves the widget on light', async () => {
    await themeButton(page, 'Dark').click();
    expect(await themeOf(page)).toBe('dark');
    expect(await widgetTheme()).toBe('light');

    await page.reload();
    expect(await themeOf(page)).toBe('dark');
    expect(await widgetTheme()).toBe('light');
    await expect(
      page.getByRole('group', { name: 'Appearance mode' }).getByRole('button', { name: 'Light' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  await test.step('and changing the widget setting leaves the interface alone', async () => {
    await page.getByRole('group', { name: 'Appearance mode' }).getByRole('button', { name: 'System' }).click();
    await page.getByRole('button', { name: 'Save settings' }).click();
    await expect(page.getByText('Saved')).toBeVisible();

    expect(await widgetTheme()).toBe('system');
    expect(await themeOf(page)).toBe('dark');
    expect(await storedPreference(page)).toBe('dark');
  });
});

test('the homepage is usable by keyboard', async ({ page }) => {
  await page.goto(`${WEB}/`);

  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(`${WEB}/#main`);

  // The theme control is a real radio group: arrow keys move between options.
  await themeButton(page, 'System').click();
  await themeButton(page, 'System').focus();
  await page.keyboard.press('ArrowRight');
  expect(await storedPreference(page)).toBe('light');
  await page.keyboard.press('ArrowRight');
  expect(await storedPreference(page)).toBe('dark');

  const focusRing = await page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null;
    return active ? getComputedStyle(active).outlineStyle : 'none';
  });
  expect(focusRing).not.toBe('none');
});

test('arrow keys move focus with the selection in the theme group', async ({ page }) => {
  await page.goto(`${WEB}/`);

  // Reach the group by keyboard alone; only the checked option is a tab stop.
  for (let press = 0; press < 25; press += 1) {
    await page.keyboard.press('Tab');
    const reached = await page.evaluate(() =>
      document.activeElement?.classList.contains('theme-option'),
    );
    if (reached) break;
  }
  await expect(page.locator('.theme-option:focus')).toHaveCount(1);

  await page.keyboard.press('ArrowRight');

  // A roving-tabindex radio group has to keep focus on the checked option.
  // It used to leave focus behind on the option that had just become
  // aria-checked="false" and tabindex="-1".
  const state = await page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null;
    return {
      inGroup: Boolean(active?.classList.contains('theme-option')),
      checked: active?.getAttribute('aria-checked'),
      tabIndex: active?.getAttribute('tabindex'),
      outline: active ? getComputedStyle(active).outlineStyle : 'none',
    };
  });
  expect(state.inGroup).toBe(true);
  expect(state.checked).toBe('true');
  expect(state.tabIndex).toBe('0');
  expect(state.outline, 'the moved focus is visible').not.toBe('none');
});

test('every screen has one main landmark to skip to', async ({ page }) => {
  await signUpAndVerify(page, uniqueEmail('landmark'));
  const project = await createProject(page, 'Landmark Site', ['https://landmark.example']);

  const paths = [
    '/',
    '/dashboard',
    '/projects',
    '/projects/new',
    '/reports',
    '/account',
    `/projects/${project.id}/install`,
    `/projects/${project.id}/settings`,
  ];
  for (const path of paths) {
    await page.goto(`${WEB}${path}`);
    await expect(page.locator('main#main'), `${path} has one main landmark`).toHaveCount(1);
    await expect(page.locator('a.skip-link[href="#main"]').first()).toHaveAttribute('href', '#main');
  }

  // Signed out, the authentication pages too.
  await page.getByRole('button', { name: 'Sign out' }).first().click();
  await page.waitForURL(/\/login/);
  for (const path of ['/login', '/signup', '/forgot-password']) {
    await page.goto(`${WEB}${path}`);
    await expect(page.locator('main#main'), `${path} has one main landmark`).toHaveCount(1);
  }
});

test('an expired reset or confirmation link offers a way forward', async ({ page }) => {
  await page.goto(`${WEB}/reset-password?token=this-token-is-not-valid-at-all`);
  await page.getByLabel('New password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByText('That reset link is invalid or has expired.')).toBeVisible();

  // The page used to end here with no route out of it.
  await page.getByRole('link', { name: 'Send me a new reset link' }).click();
  await expect(page).toHaveURL(`${WEB}/forgot-password`);

  // A link that lost its token in the mail client is recoverable too.
  await page.goto(`${WEB}/reset-password`);
  await expect(page.getByRole('link', { name: 'Send me a new reset link' })).toBeVisible();

  // A signed-out reader of a stale confirmation link is sent to sign in.
  await page.goto(`${WEB}/verify-email?token=this-token-is-not-valid-at-all`);
  await expect(page.getByText('That confirmation link is invalid or has expired.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
});

test('each screen names itself in the document title', async ({ page }) => {
  await page.goto(`${WEB}/`);
  await expect(page).toHaveTitle(/^BugInbox — collect website bug reports/);

  await page.goto(`${WEB}/login`);
  await expect(page).toHaveTitle('Sign in · BugInbox');

  await signUpAndVerify(page, uniqueEmail('titles'));
  await page.goto(`${WEB}/dashboard`);
  await expect(page).toHaveTitle('Overview · BugInbox');
  await page.goto(`${WEB}/projects`);
  await expect(page).toHaveTitle('Projects · BugInbox');

  // Returning to the public page restores the page's own title.
  await page.goto(`${WEB}/`);
  await expect(page).toHaveTitle(/^BugInbox — collect website bug reports/);
});
