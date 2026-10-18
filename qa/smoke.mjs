import { launch, open, PHONE, SMALL, DESK, sleep } from './lib.mjs';
import { mkdirSync } from 'node:fs';
mkdirSync('shots', { recursive: true });
const b = await launch();
for (const [name, o] of [['phone', PHONE], ['small', SMALL], ['desk', DESK]]) {
  const { page, errors, ctx } = await open(b, o);
  for (let s = 1; s <= 6; s++) {
    await page.evaluate(n => { location.hash = '#' + n; }, s);
    await sleep(150);
    const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, h: document.documentElement.scrollHeight }));
    console.log(name, s, JSON.stringify(m));
    await page.screenshot({ path: `shots/${name}-s${s}.png`, fullPage: true });
  }
  console.log(name, 'ctxCount', await page.evaluate(() => window.__ctxCount), 'errors', errors);
  await ctx.close();
}
await b.close();
