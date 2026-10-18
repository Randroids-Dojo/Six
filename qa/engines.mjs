// Smoke test in WebKit (Safari engine) and Firefox: scenes render, strum schedules correct notes, no errors.
import { chromium, webkit, firefox } from 'playwright-core';
import { FILE, INSTR, sleep } from './lib.mjs';
for (const [name, eng] of [['webkit', webkit], ['firefox', firefox]]) {
  let b;
  try { b = await eng.launch(); } catch (e) { console.log(name, 'NOT AVAILABLE:', e.message.split('\n')[0]); continue; }
  const ctx = await b.newContext({ viewport: { width: 448, height: 860 } });
  await ctx.addInitScript(INSTR);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(FILE + '#4');
  await page.click('#close4');
  await sleep(600);
  const r = await page.evaluate(() => ({ st: window.__log.filter(e => e.ev === 'start').map(e => +(12 * Math.log2(e.f / 82.406889)).toFixed(3)), state: window.__ctx && window.__ctx.state, rms: Math.max(0, ...window.__cap.blocks.map(b => b.rms)) }));
  await page.click('#stop');
  await sleep(300);
  const after = await page.evaluate(() => window.__cap.blocks.slice(-5).map(b => b.rms));
  await page.screenshot({ path: `shots/${name}-s4.png` });
  console.log(name, JSON.stringify(r), 'after stop', after.map(x => x.toExponential(0)).join(' '), errs.length ? errs : 'no errors');
  await b.close();
}
