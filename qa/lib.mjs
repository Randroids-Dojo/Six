import { chromium, webkit } from 'playwright-core';
import { readFileSync } from 'node:fs';
// Test the local file by default; set SIX_URL to test a deployment instead.
export const FILE = process.env.SIX_URL || new URL('../six.html', import.meta.url).href;
export const INSTR = readFileSync(new URL('./instrument.js', import.meta.url), 'utf8');
export const PHONE = { viewport: { width: 448, height: 860 }, deviceScaleFactor: 2.25, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 16; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Mobile Safari/537.36' };
// the user's Pixel as screenshotted on 2026-10-18: 1080 px wide, about 412 CSS px
export const PIXEL = { ...PHONE, viewport: { width: 412, height: 830 }, deviceScaleFactor: 2.625 };
export const SMALL = { ...PHONE, viewport: { width: 360, height: 760 }, deviceScaleFactor: 3 };
export const DESK = { viewport: { width: 1440, height: 900 } };
export async function launch(engine = 'chrome') {
  if (engine === 'webkit') return webkit.launch();
  return chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=user-gesture-required'] });
}
export async function open(browser, ctxOpts = DESK, hash = '1') {
  const ctx = await browser.newContext(ctxOpts);
  await ctx.addInitScript(INSTR);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if ((m.type() === 'error' || m.type() === 'warning') && !/ScriptProcessorNode is deprecated/.test(m.text())) errors.push(m.type() + ': ' + m.text()); }); // that warning comes from instrument.js, not the page
  await page.goto(FILE + '#' + hash);
  return { ctx, page, errors };
}
export const sleep = ms => new Promise(r => setTimeout(r, ms));
