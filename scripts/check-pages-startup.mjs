import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const url = new URL(process.env.PAGES_URL);
const purchaseCheck = process.argv[2] === 'purchase';
const diagnostics = 'smoke-diagnostics';
const logs = [];
const errors = [];
let browser;
let page;

async function enterLobby(page) {
  await page.locator('button.title-start').click({ timeout: 45_000 });
  await page.locator('button.hud-menu-play:enabled').waitFor({ state: 'visible', timeout: 20_000 });
}

async function openScarf(page) {
  await page.locator('button.hud-menu-shop').click();
  await page.locator('button[data-shop-tab="Style"]').click();
  await page.locator('.shop-categories button[data-i18n="Acc"]').click();
  const scarf = page.locator('button.shop-slot').filter({
    has: page.locator('img[src$="/karakusa-scarf.png"]'),
  });
  await scarf.click();
  return scarf;
}

async function checkPurchase(page) {
  const balance = page.locator('.shop-balance');
  const footer = page.locator('.shop-purchase');
  const scarf = await openScarf(page);
  const initial = Number((await balance.innerText()).match(/:\s*(\d+)$/)?.[1]);
  const price = Number((await footer.locator('.shop-cost').innerText()).match(/^(\d+)\b/)?.[1]);
  assert.ok(price > 0 && initial >= price, 'Fresh guest must be able to afford the scarf');
  assert.equal(await scarf.getAttribute('data-owned'), 'false');

  await footer.locator('button[data-purchase-state="available"]').click();
  await page.locator('button.purchase-confirm').click();
  await footer.getByRole('button', { name: 'Equip', exact: true }).click();
  const equipped = footer.getByRole('button', { name: 'Equipped', exact: true });
  await equipped.waitFor({ state: 'visible' });
  const afterPurchase = await balance.innerText();
  assert.equal(Number(afterPurchase.match(/:\s*(\d+)$/)?.[1]), initial - price);
  assert.ok(await equipped.isDisabled());

  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
  await enterLobby(page);
  const restoredScarf = await openScarf(page);
  assert.equal(await restoredScarf.getAttribute('data-owned'), 'true');
  await equipped.waitFor({ state: 'visible' });
  assert.ok(await equipped.isDisabled());
  assert.equal(await balance.innerText(), afterPurchase);
}

try {
  browser = await chromium.launch({
    channel: process.env.SMOKE_BROWSER_CHANNEL,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.setDefaultTimeout(15_000);
  page.on('pageerror', error => { errors.push(error.message); logs.push(error.stack ?? error.message); });
  page.on('console', message => {
    if (message.type() === 'error' || message.type() === 'warning') {
      logs.push(`Console ${message.type()}: ${message.text()}`);
    }
  });
  page.on('requestfailed', request => {
    logs.push(`Request failed: ${new URL(request.url()).pathname} (${request.failure()?.errorText})`);
  });
  page.on('response', response => {
    if (response.status() >= 400) logs.push(`HTTP ${response.status()}: ${new URL(response.url()).pathname}`);
  });

  const response = await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  if (!response?.ok()) throw Error(`Game page returned HTTP ${response?.status() ?? 'unknown'}`);

  await enterLobby(page);
  if (purchaseCheck) await checkPurchase(page);
  if (errors.length) throw Error(`Uncaught browser error: ${errors[0]}`);
  console.log(purchaseCheck
    ? 'Guest purchase, equipped scarf and coin balance survived reload.'
    : `Guest startup reached the lobby at ${url.href}`);
} catch (error) {
  await mkdir(diagnostics, { recursive: true });
  if (page) {
    await page.screenshot({ path: `${diagnostics}/screen.png`, timeout: 5000 }).catch(screenshotError => {
      logs.push(`Screenshot failed: ${screenshotError.message}`);
    });
  }
  await writeFile(`${diagnostics}/browser.log`, [error.stack ?? String(error), ...logs].join('\n') + '\n');
  throw error;
} finally {
  await browser?.close();
}
