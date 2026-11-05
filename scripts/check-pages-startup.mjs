import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const url = new URL(process.env.PAGES_URL);
const diagnostics = 'smoke-diagnostics';
const logs = [];
const errors = [];
let browser;
let page;

try {
  browser = await chromium.launch({
    channel: process.env.SMOKE_BROWSER_CHANNEL,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  page = await browser.newPage({ viewport: { width: 960, height: 540 } });
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

  await page.locator('button.title-start').click({ timeout: 45_000 });
  await page.locator('button.hud-menu-play:enabled').waitFor({ state: 'visible', timeout: 20_000 });
  if (errors.length) throw Error(`Uncaught browser error: ${errors[0]}`);
  console.log(`Guest startup reached the lobby at ${url.href}`);
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
