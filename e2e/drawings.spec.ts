import { test, expect } from '@playwright/test';

test('mobile native drawing backup restores one pair safely', async ({ page, context }) => {
  await page.goto('/?mode=demo');
  await expect(page.getByRole('heading', { name: 'Native crypto drawing backups' })).toBeVisible();
  const initial = [{ id: 'browser-test', type: 'horizontal', price: 100, color: '#ffffff' }];
  await page.evaluate((drawings) => { localStorage.setItem('oc_drawings_BTCUSD', JSON.stringify(drawings)); localStorage.setItem('oc_drawings_ETHUSD', 'other pair'); }, initial);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export drawings' }).click();
  const bytes = Buffer.concat(await (await (await download).createReadStream()).toArray());
  const exported = JSON.parse(bytes.toString());
  expect(exported.drawings).toEqual(initial);
  exported.drawings[0].price = 200;
  const replacement = { name: 'drawings.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exported)) };
  page.once('dialog', (d) => d.dismiss());
  await page.getByLabel('Restore native drawing backup').setInputFiles(replacement);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('oc_drawings_BTCUSD')!)[0].price)).toBe(100);
  const other = await context.newPage();
  await other.goto('/?mode=live');
  await expect(other.getByRole('heading', { name: 'Know your markets.' })).toBeVisible();
  // The live app itself owns the live lock, so a demo restore must be refused.
  page.once('dialog', (d) => d.accept());
  await page.getByLabel('Restore native drawing backup').setInputFiles(replacement);
  await expect(page.getByText(/Close the other data-mode tab/)).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('oc_drawings_BTCUSD')!)[0].price)).toBe(100);
  await other.close();
  page.once('dialog', (d) => d.accept());
  await Promise.all([page.waitForEvent('load'), page.getByLabel('Restore native drawing backup').setInputFiles(replacement)]);
  await expect(page.getByRole('heading', { name: 'Native crypto drawing backups' })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('oc_drawings_BTCUSD')!)[0].price)).toBe(200);
  expect(await page.evaluate(() => localStorage.getItem('oc_drawings_ETHUSD'))).toBe('other pair');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
