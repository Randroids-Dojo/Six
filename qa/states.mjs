// Screenshots of interactive states at phone and desktop sizes (viewport only, as a user sees them).
import { launch, open, PHONE, SMALL, DESK, sleep } from './lib.mjs';
const b = await launch();
for (const [name, o] of [['phone', PHONE], ['desk', DESK]]) {
  const { page, ctx, errors } = await open(b, o, '1');
  const tap = sel => o.isMobile ? page.tap(sel) : page.click(sel);
  const shot = async n => page.screenshot({ path: `shots/st-${name}-${n}.png` });
  for (let s = 1; s <= 6; s++) { await page.evaluate(n => { location.hash = '#' + n; }, s); await sleep(120); await shot(`fold${s}`); }
  await page.evaluate(() => { location.hash = '#1'; }); await sleep(100);
  await tap('#b1 .cell[data-l="1"][data-f="3"]'); await sleep(250); await shot('s1-tap');
  await page.evaluate(() => { location.hash = '#3'; }); await sleep(100);
  await tap('#b3 .cell[data-l="0"][data-f="5"]'); await sleep(250); await shot('s3-tap');
  await page.evaluate(() => { location.hash = '#4'; }); await sleep(100);
  await tap('#close4'); await sleep(300); await shot('s4-close');
  await page.evaluate(() => { location.hash = '#5'; }); await sleep(100);
  await tap('#move5'); await sleep(1400 + 350); await shot('s5-moving'); await sleep(900); await shot('s5-moved');
  await page.evaluate(() => { location.hash = '#6'; }); await sleep(100);
  await tap('[data-bpm="66"]');
  await tap('#play6');
  const spb = 60 / 66 * 1000;
  await sleep(spb * 5.5); await shot('s6-ring');
  await sleep(spb * 2); await shot('s6-brush');
  await sleep(spb * 0.9); await shot('s6-strike2');
  await tap('#play6'); await sleep(200); await shot('s6-paused');
  console.log(name, errors);
  await ctx.close();
}
await b.close();
