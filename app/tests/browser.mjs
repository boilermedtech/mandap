import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { createLocalBackend } from '../server/local.mjs';

test('polished UI: responsive onboarding, registrations, payments, expenses and offline behavior', { timeout: 90000 }, async () => {
  const edge = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ].find(existsSync);
  const origin = 'http://127.0.0.1:4187';
  const dataDir = await mkdtemp(join(tmpdir(), 'mandap-browser-test-'));
  const backend = await createLocalBackend({ dataDir, origins: [origin] });
  const port = await backend.listen(0);
  const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '4187', '--strictPort'], {
    stdio: ['ignore', 'pipe', 'inherit'], env: { ...process.env, MANDAP_API_PORT: String(port) },
  });
  let browser;
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Preview did not become ready')), 15000);
      server.once('error', error => { clearTimeout(timeout); reject(error); });
      server.once('exit', code => { clearTimeout(timeout); reject(new Error(`Preview exited: ${code}`)); });
      server.stdout.on('data', chunk => { if (chunk.toString().includes('4187')) { clearTimeout(timeout); resolve(); } });
    });
    browser = await chromium.launch({ headless: true, ...(edge ? { executablePath: edge } : {}) });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const form = title => page.locator('form').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
    const nav = name => page.getByRole('navigation', { name: 'Workspace navigation' }).getByRole('button', { name, exact: true });
    await page.goto(origin);
    await page.getByRole('button', { name: 'Switch to dark theme' }).waitFor();
    for (const mode of ['light', 'dark']) {
      if (mode === 'dark') await page.getByRole('button', { name: 'Switch to dark theme' }).click();
      for (const width of [320, 360, 390, 412, 768, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        await page.reload();
        await page.getByRole('heading', { name: 'A new way to come together.' }).waitFor();
        assert.equal(await page.locator('html').getAttribute('data-mantine-color-scheme'), mode, 'theme preference survives reload');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${mode} horizontal overflow at ${width}`);
        assert.equal(await form('Sign in by email').getByLabel('Email', { exact: true }).evaluate(input => parseFloat(getComputedStyle(input).fontSize) >= 16), true, 'email stays readable without mobile zoom');
      }
      const contrasts = await page.evaluate(() => {
        const styles = getComputedStyle(document.documentElement);
        const luminance = token => {
          const hex = styles.getPropertyValue(token).trim().slice(1);
          const rgb = hex.match(/../g).map(channel => parseInt(channel, 16) / 255)
            .map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4);
          return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
        };
        return [
          ['body', '--ink', '--canvas', 4.5], ['secondary', '--muted', '--panel', 4.5],
          ['links', '--accent', '--canvas', 4.5], ['button', '--primary-ink', '--primary', 4.5],
          ['error', '--error', '--panel', 4.5], ['success', '--success', '--success-well', 4.5],
          ['warning', '--warning', '--warning-well', 4.5], ['input boundary', '--input-line', '--input', 3],
          ['focus', '--focus', '--panel', 3],
        ].map(([label, foreground, background, minimum]) => {
          const a = luminance(foreground), b = luminance(background);
          return { label, ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05), minimum };
        });
      });
      for (const { label, ratio, minimum } of contrasts) assert.ok(ratio >= minimum, `${mode} ${label} contrast ${ratio.toFixed(2)} must meet ${minimum}:1`);
      assert.equal(await page.locator('meta[name="theme-color"]').getAttribute('content'), mode === 'dark' ? '#16241e' : '#f8f7f2', 'browser chrome follows theme');
    }
    await page.getByRole('button', { name: 'Switch to light theme' }).click();
    await page.setViewportSize({ width: 1280, height: 800 });
    const start = page.getByRole('link', { name: 'Get started', exact: true });
    const startBox = await start.boundingBox();
    assert.ok(startBox && startBox.y >= 0 && startBox.y + startBox.height <= 800, 'primary action is above the fold');
    await start.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    assert.equal(await start.evaluate(link => link.matches(':focus-visible') && parseFloat(getComputedStyle(link).outlineWidth) >= 3), true, 'keyboard focus is explicit');
    await start.click();
    await form('Sign in by email').getByLabel('Email', { exact: true }).waitFor();
    await page.setViewportSize({ width: 1920, height: 1080 });
    assert.ok((await page.locator('main').boundingBox()).width <= 1320, 'wide screens retain a capped reading width');
    await page.setViewportSize({ width: 1280, height: 900 });
    await form('Sign in by email').getByLabel('Email', { exact: true }).fill('browser@example.test');
    await form('Sign in by email').getByRole('button', { name: 'Send sign-in code' }).click();
    await page.getByLabel('Local sign-in code', { exact: true }).waitFor();
    const code = await page.getByLabel('Local sign-in code', { exact: true }).textContent();
    await form('Verify your code').getByLabel('Email code').fill(code);
    await form('Verify your code').getByRole('button', { name: 'Sign in', exact: true }).click();
    await form('Create your Mandap').getByLabel('Mandap name').fill('Browser Community');
    await form('Create your Mandap').getByLabel('Public link slug').fill('browser-community');
    await form('Create your Mandap').getByRole('button', { name: 'Create private workspace' }).click();
    await page.getByRole('heading', { name: 'Browser Community', exact: true }).waitFor();
    await nav('Workspace settings').click();
    await form('Mandap settings').getByLabel('Publish public page', { exact: true }).check();
    await form('Mandap settings').getByLabel('Publish approved aggregate finances').check();
    await form('Mandap settings').getByRole('button', { name: 'Save settings' }).click();
    await form('Mandap settings').getByText('Saved successfully.').waitFor();
    const festival = form('Create festival');
    await festival.getByLabel('Name', { exact: true }).fill('Festival 2027');
    await festival.getByLabel('Start', { exact: true }).fill('2027-10-01');
    await festival.getByLabel('End', { exact: true }).fill('2027-10-09');
    await festival.getByLabel('Publish festival', { exact: true }).check();
    await festival.getByRole('button', { name: 'Create festival', exact: true }).click();
    await festival.getByText('Saved successfully.').waitFor();
    const pooja = form('Configure pooja');
    await pooja.getByLabel('Festival', { exact: true }).selectOption({ label: 'Festival 2027' });
    await pooja.getByLabel('Name', { exact: true }).fill('Daily Pooja');
    await pooja.getByLabel('Dates (YYYY-MM-DD, separated by commas)').fill('2027-10-01');
    await pooja.getByLabel('Pricing unit').selectOption('person_day');
    await pooja.getByLabel('Amount (INR; package is per participant)').fill('400');
    await pooja.getByLabel('Capacity per day').fill('2');
    await pooja.getByLabel('Registration opens').fill('2020-01-01T10:00');
    await pooja.getByLabel('Registration closes').fill('2099-01-01T10:00');
    await pooja.getByRole('button', { name: 'Create pooja and dates' }).click();
    await pooja.getByText('Saved successfully.').waitFor();
    await nav('Registrations').click();
    const registration = form('Register participants');
    await registration.getByLabel('Family/contact name').fill('Browser Family');
    await registration.getByLabel('Participant names, one per line').fill('First Person\nSecond Person');
    await registration.getByRole('checkbox', { name: /2027-10-01/ }).check();
    await registration.getByRole('button', { name: 'Register and create pledge' }).click();
    await form('Submit payment for verification').waitFor();
    await form('Submit payment for verification').getByLabel('Amount (INR)', { exact: true }).fill('800');
    await form('Submit payment for verification').getByLabel('Method').selectOption('cash');
    await form('Submit payment for verification').getByRole('button', { name: 'Submit payment', exact: true }).click();
    await page.getByRole('button', { name: 'Verify payment', exact: true }).click();
    await page.getByRole('button', { name: 'View receipt #1' }).click();
    await page.getByRole('region', { name: 'Receipt' }).getByRole('heading', { name: /Receipt #1/ }).waitFor();
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await nav('Expenses').click();
    const expense = form('Submit an expense');
    await expense.getByLabel('Festival', { exact: true }).selectOption({ label: 'Festival 2027' });
    await expense.getByLabel('Title', { exact: true }).fill('Flowers');
    await expense.getByLabel('Category', { exact: true }).fill('Decoration');
    await expense.getByLabel('Amount (INR)', { exact: true }).fill('100');
    await expense.getByRole('button', { name: 'Send for approval' }).click();
    await form('Review expense').getByLabel('Decision').selectOption('approved');
    await form('Review expense').getByRole('button', { name: 'Save review' }).click();
    await nav('Overview').click();
    await page.getByText('Confirmed collections', { exact: true }).waitFor();
    const balanceCard = page.locator('.metrics article').filter({ hasText: 'Available balance' });
    assert.equal(await balanceCard.getAttribute('class'), 'metric-primary', 'available balance has primary visual hierarchy');
    assert.equal(await balanceCard.locator('strong').evaluate(value => getComputedStyle(value).fontVariantNumeric), 'tabular-nums');
    assert.match(await balanceCard.textContent(), /700/);
    await page.reload();
    await page.getByText('Confirmed collections', { exact: true }).waitFor();
    assert.match(await balanceCard.textContent(), /700/);
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `dashboard overflow at ${width}`);
    }
    await page.getByRole('button', { name: 'Switch to dark theme' }).click();
    await page.reload();
    await page.getByText('Confirmed collections', { exact: true }).waitFor();
    assert.match(await balanceCard.textContent(), /700/);
    assert.equal(await page.locator('html').getAttribute('data-mantine-color-scheme'), 'dark');
    await page.setViewportSize({ width: 320, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'signed-in dark theme fits small mobile');
    const manifest = await (await page.request.get(`${origin}/manifest.webmanifest`)).json();
    assert.equal(manifest.display, 'standalone');
    for (const icon of manifest.icons) {
      const response = await page.request.get(`${origin}${icon.src}`);
      assert.equal(response.status(), 200);
      assert.equal((await response.body()).readUInt32BE(16), Number(icon.sizes.split('x')[0]));
      assert.equal(await page.evaluate(async src => {
        const image = new Image(); image.src = src; await image.decode(); return image.naturalWidth;
      }, icon.src), Number(icon.sizes.split('x')[0]));
    }
    assert.deepEqual(errors, []);
    assert.match(await page.evaluate(async () => (await navigator.serviceWorker.ready).active.scriptURL), /\/sw\.js$/);
    await page.context().setOffline(true);
    await page.reload();
    await page.getByRole('heading', { name: 'You are offline' }).waitFor();
    assert.equal(await page.getByRole('link', { name: 'Try again' }).getAttribute('href'), '');
  } finally { await browser?.close(); server.kill(); await backend.close(); await rm(dataDir, { recursive: true }); }
});
