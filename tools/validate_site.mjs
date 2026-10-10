#!/usr/bin/env node
/** Production-export checks. Tool packages and browser binaries live outside the repository. */
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const root = resolve(import.meta.dirname, '..');
const require = createRequire(resolve(process.env.SFPT_CHECK_DEPS || '/tmp/sfpt-checks', 'package.json'));
const { chromium } = require('@playwright/test');
const { default: AxeBuilder } = require('@axe-core/playwright');
const core = await import(`data:text/javascript;base64,${Buffer.from(await readFile(resolve(root, 'site/core.js'))).toString('base64')}`);
const output = resolve(root, 'test/scratch/site-validation');
await mkdir(output, { recursive: true });
const results = { checks: [], pages: [], contrast: [], errors: [], limitations: ['Chromium emulation, not physical devices or a screen-reader session.', 'Fixture launch data; no live deployment or market verification.', 'GPU software-renderer warnings may occur during screenshots.'] };
const check = (name, fn) => { fn(); results.checks.push(name); };

check('Exact 1,000 SFPT split: 20 tax, 980 recipient', () => {
  const result = core.splitBuy('1000'); assert.equal(core.formatToken(result.tax), '20'); assert.equal(core.formatToken(result.net), '980');
});
check('Rounding boundaries, zero, supply ceiling and conservation', () => {
  assert.equal(core.splitBuy('0').tax, 0n);
  assert.equal(core.splitBuy('0.000000000000000049').tax, 0n);
  assert.equal(core.splitBuy('0.000000000000000050').tax, 1n);
  for (const value of ['0', '1', '1.234567890123456789', '999999999.999999999999999999', '1000000000']) { const r = core.splitBuy(value); assert.equal(r.tax + r.net, r.gross); }
  for (const value of ['', '-1', '1e9', '1,000', 'Infinity', '.5', '0.1234567890123456789', '1000000001']) assert.throws(() => core.splitBuy(value));
});
check('Unsafe links, malformed addresses and invalid market numbers are rejected', () => {
  for (const link of ['javascript:alert(1)', 'data:text/html,hi', 'http://unsafe.example/', 'https://user:password@example.com']) assert.equal(core.safeUrl(link, 'https://superfrenpettest.si-md.xyz'), null);
  for (const value of [null, '', ' ', -1, Infinity, {}, 'invalid']) assert.equal(core.marketNumber(value), null);
  assert.equal(core.marketNumber(0), 0);
  assert.equal(core.normalizeCoin({ token: 'not a contract' }, 'https://superfrenpettest.si-md.xyz').token, null);
  assert.equal(core.normalizeCoin({ token: `0x${'0'.repeat(40)}` }, 'https://superfrenpettest.si-md.xyz').token, null);
});

const server = spawn('python3', ['tools/preview_site.py', '--port', '8766'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
await Promise.race([once(server.stdout, 'data'), once(server, 'exit').then(() => { throw new Error('Preview failed to start.'); })]);
const base = 'http://127.0.0.1:8766';
let browser;
try {
  browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ reducedMotion: 'reduce', permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  const resourceFailures = [];
  page.on('requestfailed', req => resourceFailures.push(req.url()));
  page.on('response', response => { if (response.status() >= 400) resourceFailures.push(`${response.status()} ${response.url()}`); });

  for (const path of ['/preview/', '/preview/docs/', '/preview/404.html']) {
    await page.goto(base + path); await page.evaluate(() => document.fonts.ready);
    for (const width of [320, 360, 375, 390, 768, 1024, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      const state = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth, images: [...document.images].filter(i => !i.complete || !i.naturalWidth).map(i => i.src), h1: document.querySelectorAll('h1').length }));
      assert.equal(state.overflow, false, `Overflow: ${path} at ${width}`);
      assert.deepEqual(state.images, [], `Images: ${path} at ${width}`);
      assert.equal(state.h1, 1);
      results.pages.push({ path, width, overflow: false, brokenImages: 0 });
      if (width === 375 || width === 1440) {
        const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
        assert.deepEqual(audit.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })), [], `Accessibility: ${path} at ${width}`);
        results.checks.push(`axe WCAG A/AA automated scan: ${path} at ${width}`);
      }
    }
    const links = await page.evaluate(() => [...document.querySelectorAll('a[href]')].map(a => a.href));
    for (const href of new Set(links)) {
      const url = new URL(href);
      if (url.origin !== base) continue;
      if (url.hash && url.pathname === new URL(page.url()).pathname) assert(await page.locator(url.hash).count(), `Missing anchor ${href}`);
      else { const response = await context.request.get(href); assert(response.ok(), `Dead local link: ${href}`); }
    }
  }
  assert.deepEqual(errors, []); assert.deepEqual(resourceFailures, []);
  results.checks.push('All three pages: no application console errors, failed resources or dead local links');

  await page.setViewportSize({ width: 390, height: 844 }); await page.goto(`${base}/preview/`);
  await page.waitForFunction(() => document.querySelector('#room').dataset.ready === 'true');
  assert(await page.locator('#scene-fallback').isHidden());
  const action = await page.locator('.hero a[href="./docs/"]').boundingBox(); assert(action.y + action.height < 844);
  await page.locator('.menu-toggle').click(); assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'), 'true');
  await page.keyboard.press('Escape'); assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'), 'false');
  assert(await page.locator('.menu-toggle').evaluate(el => el === document.activeElement));
  await page.locator('.menu-toggle').click(); await page.locator('#main-nav a[href="#calculator"]').click();
  assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'), 'false');
  results.checks.push('390px first-screen action, responsive navigation, Escape and focus return');

  await page.locator('#buy-amount').fill('1000000'); assert.equal(await page.locator('#tax-output').textContent(), '20,000'); assert.equal(await page.locator('#net-output').textContent(), '980,000');
  await page.locator('#buy-amount').fill('0.000000000000000050'); assert.equal(await page.locator('#tax-output').textContent(), '0.000000000000000001');
  await page.locator('#buy-amount').fill('-2'); assert.equal(await page.locator('#buy-amount').getAttribute('aria-invalid'), 'true'); assert(await page.locator('#amount-error').isVisible());
  assert.equal(await page.locator('#net-output').textContent(), '—');
  await page.locator('#buy-amount').fill('1000'); assert.equal(await page.locator('#buy-amount').getAttribute('aria-invalid'), null);
  await page.locator('#buy-range').focus(); await page.keyboard.press('ArrowRight'); assert.equal(await page.locator('#net-output').textContent(), '1,960');
  results.checks.push('Calculator: exact decimals, invalid-input recovery and keyboard slider');

  await page.locator('[data-step="1"]').click(); assert.match(await page.locator('#guide-description').textContent(), /ETH pays/);
  await page.locator('#guide-next').click(); assert.match(await page.locator('#guide-description').textContent(), /1.25%/);
  await page.locator('#guide-next').click(); assert.match(await page.locator('#guide-heading').textContent(), /Ethereum wallet/);
  const summary = page.locator('summary').first(); await summary.focus(); await page.keyboard.press('Enter'); assert(await summary.evaluate(el => el.parentElement.open));
  await page.keyboard.press('Enter'); assert.equal(await summary.evaluate(el => el.parentElement.open), false);
  await page.locator('#trace-buy').click(); assert.match(await page.locator('#den-message').textContent(), /20 treasury \+ 980 recipient/);
  assert(await page.locator('#motion-toggle').isDisabled());
  assert.equal(await page.locator('body').evaluate(el => el.classList.contains('motion-paused')), true);
  results.checks.push('Guide navigation, native FAQ keyboard control, trace demo and reduced-motion state');

  await page.locator('#copy-link').click(); assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'https://superfrenpettest.si-md.xyz/');
  const intents = await page.locator('[data-share]').evaluateAll(links => links.map(link => link.href));
  assert.equal(new Set(intents.map(href => new URL(href).searchParams.get('text'))).size, 3);
  for (const intent of intents) { assert.equal(new URL(intent).origin, 'https://x.com'); assert.equal(new URL(intent).searchParams.get('url'), 'https://superfrenpettest.si-md.xyz/'); }
  await context.route('https://x.com/intent/tweet**', route => route.fulfill({ body: '<!doctype html><title>Share destination fixture</title>' }));
  const popupEvent = page.waitForEvent('popup'); await page.locator('[data-share="0"]').click(); const popup = await popupEvent; await popup.waitForLoadState(); assert.match(popup.url(), /^https:\/\/x.com\/intent\/tweet/); await popup.close();
  results.checks.push('Clipboard copy, three distinct X share intents and a working new-tab action');

  // This supplied treasury address is used only as a test fixture, never a production token address.
  const fixtureToken = '0x900bCC8d58B67fF741c32D0Cd9a28aA1555c8068';
  let feed = { token: fixtureToken, coinUrl: 'https://www.si-md.xyz/launchpad', chartUrl: 'https://www.si-md.xyz/launchpad?view=chart', market: { priceUsd: 0.00025, marketCap: 250000, volume24h: 1000 } };
  await page.route('**/simd-coin.json', route => route.fulfill({ json: feed }));
  await page.locator('#refresh-data').click();
  await page.waitForFunction(address => document.querySelector('[data-address]').textContent === address, fixtureToken);
  assert.equal(await page.locator('[data-coin-link]').getAttribute('href'), feed.coinUrl);
  assert.equal(await page.locator('[data-chart-link]').getAttribute('href'), feed.chartUrl);
  assert.equal(await page.locator('[data-stat="marketCap"]').textContent(), '$250,000');
  await page.locator('[data-copy-contract]').first().click(); assert.equal(await page.evaluate(() => navigator.clipboard.readText()), fixtureToken);
  feed = { ...feed, market: { priceUsd: 0, marketCap: 0, volume24h: 0 } };
  await page.locator('#refresh-data').click(); await page.waitForFunction(() => document.querySelector('[data-stat="marketCap"]').textContent === '$0');
  await page.unroute('**/simd-coin.json');
  // The feed's selected logo supersedes the supplied reference, with no remote scripts.
  const replacementLogo = 'https://logo.example.test/sfpt.jpg';
  await page.route(replacementLogo, async route => route.fulfill({ contentType: 'image/jpeg', headers: { 'access-control-allow-origin': '*' }, body: await readFile(resolve(root, 'site/assets/logo.jpg')) }));
  await page.route('**/simd-coin.json', route => route.fulfill({ json: { ...feed, logo: replacementLogo } }));
  await page.locator('#refresh-data').click();
  await page.waitForFunction(url => [...document.querySelectorAll('img[data-logo]')].every(image => image.src === url), replacementLogo);
  results.checks.push('Feed logo overrides local image and updates share metadata');
  await page.unroute('**/simd-coin.json');
  // A malformed JSON body tests the same recovery path without intentional browser HTTP errors.
  await page.route('**/simd-coin.json', route => route.fulfill({ contentType: 'application/json', body: '{broken' }));
  await page.locator('#refresh-data').click(); await page.waitForFunction(() => document.querySelector('#data-status').textContent.includes('unavailable'));
  assert.equal(await page.locator('[data-stat="marketCap"]').textContent(), '—');
  assert.match(await page.locator('[data-token-status]').textContent(), /Cached address/);
  assert.equal(await page.locator('[data-coin-link]').getAttribute('href'), feed.coinUrl);
  await page.unroute('**/simd-coin.json'); await page.route('**/simd-coin.json', route => route.fulfill({ json: { token: 'bad', coinUrl: 'javascript:alert(1)', chartUrl: 'data:text/html,x', market: { marketCap: -1 } } }));
  await page.locator('#refresh-data').click(); await page.waitForFunction(() => document.querySelector('[data-address]').textContent === 'launching…');
  assert.equal(await page.locator('[data-coin-link]').getAttribute('href'), null); assert.equal(await page.locator('[data-chart-link]').getAttribute('href'), null);
  results.checks.push('Live-data success, valid zeroes, gross feed failure, cached-link labels, malformed-data recovery and unsafe-URL rejection');

  await page.unroute('**/simd-coin.json');
  // Verify refresh interval with a virtual clock, not a real-time wait.
  await page.clock.install(); let polls = 0;
  await page.route('**/simd-coin.json', route => { polls++; return route.fulfill({ json: { status: 'launching', market: {} } }); });
  await page.reload(); await page.waitForFunction(() => document.querySelector('#data-status').textContent.includes('Launching'));
  await page.bringToFront();
  const initialPolls = polls;
  const timedRequest = page.waitForRequest('**/simd-coin.json', { timeout: 5000 });
  const timedResponse = page.waitForResponse('**/simd-coin.json', { timeout: 5000 });
  await page.clock.runFor(30_100); await timedRequest; await timedResponse;
  assert(polls > initialPolls);
  results.checks.push('30-second refresh verified with virtual time');

  const fallbackContext = await browser.newContext({ reducedMotion: 'reduce' });
  await fallbackContext.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, ...args) { if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null; return original.call(this, type, ...args); };
  });
  const fallback = await fallbackContext.newPage(); await fallback.goto(`${base}/preview/`);
  await fallback.waitForFunction(() => document.querySelector('#den-message').textContent.includes('Static view'));
  assert(await fallback.locator('#scene-fallback').isVisible()); await fallback.locator('#trace-buy').click(); assert.match(await fallback.locator('#den-message').textContent(), /980 recipient/);
  results.checks.push('No-WebGL fallback retains the logo and working text demonstration'); await fallbackContext.close();

  const motionContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const motionPage = await motionContext.newPage(); await motionPage.goto(`${base}/preview/`);
  await motionPage.waitForFunction(() => document.querySelector('#room').dataset.ready === 'true');
  await motionPage.locator('#motion-toggle').click(); assert.equal(await motionPage.locator('#motion-toggle').getAttribute('aria-pressed'), 'true');
  await motionPage.locator('#motion-toggle').click(); assert.equal(await motionPage.locator('#motion-toggle').getAttribute('aria-pressed'), 'false');
  await motionPage.emulateMedia({ reducedMotion: 'reduce' }); await motionPage.waitForFunction(() => document.querySelector('#motion-toggle').disabled);
  await motionPage.evaluate(() => document.querySelectorAll('.reveal').forEach(el => el.classList.remove('reveal-pending')));
  await motionPage.screenshot({ path: resolve(output, 'desktop.jpg'), type: 'jpeg', quality: 75, fullPage: true });
  await motionPage.setViewportSize({ width: 390, height: 844 }); await motionPage.screenshot({ path: resolve(output, 'mobile.jpg'), type: 'jpeg', quality: 80 });
  results.checks.push('Real Three.js initialization, pause/resume, live reduced-motion change and rendered screenshots');

  results.contrast = await motionPage.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    function lum(hex) { const rgb = hex.trim().slice(1).match(/../g).map(c => parseInt(c, 16) / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4); return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722; }
    return [['--text','--bg'],['--muted','--bg'],['--muted','--surface'],['--muted','--surface-raised'],['--accent-ink','--accent'],['--warning','--bg'],['--error','--bg'],['--focus','--bg'],['--focus','--surface-raised']].map(([fg,bg]) => { const a = root.getPropertyValue(fg).trim(); const b = root.getPropertyValue(bg).trim(); const l1=lum(a), l2=lum(b); return { fg, bg, foreground:a, background:b, ratio:Number(((Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05)).toFixed(2)) }; });
  });
  for (const pair of results.contrast) assert(pair.ratio >= 4.5, `Contrast ${pair.fg}/${pair.bg}: ${pair.ratio}`);
  results.checks.push('Measured solid-background text and focus token pairs exceed 4.5:1');
  await motionContext.close(); await context.close();
  results.status = 'PASS';
} catch (error) {
  results.status = 'FAIL'; results.errors.push(error.stack); process.exitCode = 1;
} finally {
  await browser?.close(); server.kill('SIGTERM');
  await writeFile(resolve(output, 'results.json'), JSON.stringify(results, null, 2) + '\n');
  console.log(JSON.stringify(results, null, 2));
}
