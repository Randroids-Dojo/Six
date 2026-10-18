// Rapid input: tap spam, Play/Pause mashing, scene hopping. Checks voices are bounded, freed, and never doubled.
import { launch, open, PHONE, sleep } from './lib.mjs';
const b = await launch();
const { page, errors } = await open(b, PHONE, '1');
let maxVoices = 0;
for (let i = 0; i < 60; i++) {
  const l = i % 6, f = (i * 5) % 8;
  await page.tap(`#b1 .cell[data-l="${l}"][data-f="${f}"]`);
  maxVoices = Math.max(maxVoices, await page.evaluate(() => E.voices.size));
  await sleep(30);
}
console.log('tap spam: max live voices', maxVoices, '(6 lanes, so ≤ 6 sounding + a few fading)');
await sleep(12000);
console.log('12 s later live voices', await page.evaluate(() => E.voices.size));
await page.evaluate(() => { location.hash = '#6'; });
await sleep(100);
await page.tap('[data-bpm="66"]');
for (let i = 0; i < 9; i++) { await page.tap('#play6'); await sleep(40 + i * 7); }   // ends on Play (odd count)
const m = await page.evaluate(() => window.__log.length);
await sleep(9000);
const st = await page.evaluate(m => window.__log.slice(m).filter(e => e.ev === 'start' && e.kind === 'osc' && e.f < 1000).map(e => e.when), m);
const groups = [];
for (const w of st) { const g = groups.find(g => Math.abs(g[0] - w) < 0.1); if (g) g.push(w); else groups.push([w]); }
console.log('after Play/Pause mashing: strikes', groups.length, 'notes per strike', groups.map(g => g.length).join(','), 'transport on', await page.evaluate(() => T.on));
for (let i = 0; i < 12; i++) { await page.evaluate(n => { location.hash = '#' + n; }, (i % 6) + 1); if (i % 2) await page.tap(`#s${(i % 6) + 1} .ctrl .btn`); await sleep(120); }
await page.evaluate(() => { location.hash = '#1'; });
await sleep(300);
const t = await page.evaluate(() => window.__ctx.currentTime);
await sleep(2000);
const tail = await page.evaluate(t => Math.max(0, ...window.__cap.blocks.filter(x => x.t > t + 0.08).map(x => x.rms)), t);
console.log('scene hopping then landing on scene 1: max RMS afterwards', tail.toExponential(1), 'errors', errors);
process.exit(0);
