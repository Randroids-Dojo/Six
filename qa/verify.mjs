// Functional verification of six.html in real Google Chrome (headless), using qa/instrument.js:
// every audio source start/stop is logged, and the final mix is captured sample by sample.
import { launch, open, PHONE, PIXEL, SMALL, DESK, sleep } from './lib.mjs';

const OPEN = [0, 5, 10, 15, 19, 24];
const hz = h => 82.406889 * 2 ** (h / 12);
const heightOf = f => 12 * Math.log2(f / 82.406889);
const SILENT = 1e-4;      // block RMS below -80 dBFS counts as silence
const fails = [];
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); if (!ok) fails.push(name); };
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const sameList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

const browser = await launch();
let { page, errors, ctx } = await open(browser, DESK, '1');
const ev = (fn, arg) => page.evaluate(fn, arg);
const mark = () => ev(() => window.__log.length);
const since = m => ev(m => window.__log.slice(m), m);
const now = () => ev(() => window.__ctx ? window.__ctx.currentTime : 0);
const go = n => page.click(`.tabs a[href="#${n}"]`);
const oscStarts = log => log.filter(e => e.ev === 'start' && e.kind === 'osc' && e.f < 1000);
const hts = log => oscStarts(log).map(e => Math.round(heightOf(e.f) * 1000) / 1000);
let OFF = 0.02; // capture latency (playbackTime of tap block minus render time); calibrated below
async function rmsRange(t0, t1) {
  return ev(([a, b, o]) => {
    const bl = window.__cap.blocks.filter(x => x.t - o >= a && x.t - o < b);
    return { n: bl.length, max: Math.max(0, ...bl.map(x => x.rms)), mean: bl.reduce((s, x) => s + x.rms, 0) / Math.max(1, bl.length), peak: Math.max(0, ...bl.map(x => x.peak)) };
  }, [t0, t1, OFF]);
}
async function waitCtx(t) { while ((await now()) < t) await sleep(40); }

// ---------- 1. Model: Heights and recipes, computed independently here ----------
{
  const EXPECT = {
    bare:  ['0 2 2 – – –', [7], 0, 'Bare'],
    wide:  ['0 2 2 1 0 0', [4, 7], 0, 'Wide'],
    close: ['0 2 2 0 0 0', [3, 7], 0, 'Close'],
    float: ['0 2 2 2 0 0', [5, 7], 0, 'Float'],
    bare3: ['3 5 5 – – –', [7], 3, 'Bare'],
    bare5: ['5 7 7 – – –', [7], 5, 'Bare'],
    slip:  ['0 4 4 – – –', [2, 9], 0, null],
    bare2: ['2 4 4 – – –', [7], 2, 'Bare'],
  };
  const page_ = await ev(() => Object.fromEntries(Object.entries(S).map(([k, s]) => [k, { text: shapeText(s), frets: s.frets, h: heights(s), r: recipe(s) }])));
  for (const [k, [text, ds, root, name]] of Object.entries(EXPECT)) {
    const p = page_[k];
    const mine = p.frets.map((f, l) => f == null ? null : OPEN[l] + f);
    const sounding = mine.filter(h => h != null), r0 = Math.min(...sounding);
    const myDs = [...new Set(sounding.map(h => (h - r0) % 12))].filter(Boolean).sort((a, b) => a - b);
    check(`model ${k} ${text}`, p.text === text && sameList(p.h.map(String), mine.map(String)) && r0 === root && sameList(myDs, ds) && p.r.root === root && sameList(p.r.ds, ds) && p.r.name === name,
      `Heights ${sounding.join(',')} root ${root} recipe +${ds.join(' +')} → ${name}`);
  }
  const f = await ev(() => [0, 5, 7, 12, 15, 16, 17, 24, 29].map(hz));
  check('pitch formula 82.406889 × 2^(H/12)', f.every((x, i) => Math.abs(x - hz([0, 5, 7, 12, 15, 16, 17, 24, 29][i])) < 1e-9) && near(f[1], 110, 1e-3) && near(f[8], 440, 1e-3), `H5=${f[1].toFixed(4)} Hz, H29=${f[8].toFixed(4)} Hz`);
}

// ---------- 2. No sound before a tap ----------
for (let n = 1; n <= 6; n++) { await go(n); await sleep(120); }
await go(1);
check('no AudioContext and no sound before a tap (all scenes visited)', (await ev(() => window.__ctxCount)) === 0 && (await mark()) === 0);
const CAP_CLIMB = 'Hear the same string rise in pitch, one fret at a time.', CAP_OPENS = 'Hear all six open strings, from thickest to thinnest.', CAP_START = 'Tap a string or fret, or try a demo.';
const s1text = () => ev(() => ({ cap: $('#say1').textContent, note: $('#note1').textContent }));
{
  const t = await s1text();
  check('scene 1 before any tap: instruction shown, note label empty', t.cap === CAP_START && t.note === '', JSON.stringify(t));
}

// ---------- 3. Scene 1: tap, climb, opens; measured pitch of the real output ----------
{
  await page.click('#b1 .cell[data-l="0"][data-f="3"]');
  await sleep(400);
  const lg = await since(0);
  check('scene 1 tap lane 1 fret 3 plays Height 3', sameList(hts(lg), [3]), `ctx state ${await ev(() => window.__ctx.state)}`);
  let t1 = await s1text();
  check('scene 1 tap: label reads "Lane 1 · fret 3", caption unchanged', t1.note === 'Lane 1 · fret 3' && t1.cap === CAP_START, JSON.stringify(t1));
  await page.click('#b1 .cell[data-l="5"][data-f="0"]');
  await sleep(200);
  t1 = await s1text();
  check('scene 1 tap: label reads "Lane 6 · open"', t1.note === 'Lane 6 · open' && t1.cap === CAP_START, JSON.stringify(t1));
  await page.click('#stop');
  await sleep(150);
  // calibrate capture latency from the onset of that note
  OFF = await ev(w => { const b = window.__cap.blocks.find(x => x.rms > 0.003 && x.t > w); return b ? b.t - w : 0.02; }, oscStarts(lg)[0].when);
  console.log(`      capture offset ${(OFF * 1000).toFixed(1)} ms`);

  async function pitched(btn, expectH, gap) {
    await ev(() => {
      window.__rec = true;
      window.__notes = [];
      window.__mo && window.__mo.disconnect();
      window.__mo = new MutationObserver(() => window.__notes.push({ text: $('#note1').textContent, t: window.__ctx.currentTime }));
      window.__mo.observe($('#note1'), { childList: true, characterData: true, subtree: true });
    });
    const m = await mark();
    await page.click(btn);
    await sleep(120);
    const capDuring = await ev(() => $('#say1').textContent);
    await sleep(gap * 1000 * expectH.length + 700);
    await ev(() => { window.__rec = false; });
    const lg = await since(m), st = oscStarts(lg);
    const got = hts(lg);
    const gaps = st.slice(1).map((e, i) => +(e.when - st[i].when).toFixed(3));
    const det = [];
    for (const e of st) {
      const x = await ev(([a, b, o]) => window.__cap.blocks.filter(z => z.d && z.t - o >= a && z.t - o < b).flatMap(z => z.d), [e.when + 0.1, e.when + 0.42, OFF]);
      det.push(detectPitch(x, sr));
    }
    const cents = det.map((f, i) => 1200 * Math.log2(f / hz(expectH[i])));
    const notes = await ev(() => window.__notes);
    const lag = notes.map((n, i) => st[i] ? n.t - st[i].when : NaN);
    return { got, gaps, cents, capDuring, capAfter: (await s1text()).cap, labels: notes.map(n => n.text), lag };
  }
  const sr = await ev(() => window.__cap.sr);
  if (sr !== 48000) console.log('      sample rate', sr);
  const climb = await pitched('#climb', [0, 1, 2, 3, 4, 5, 6, 7], 0.55);
  check('scene 1 "Climb lane 1" plays Heights 0..7, one per fret', sameList(climb.got, [0, 1, 2, 3, 4, 5, 6, 7]) && climb.gaps.every(g => near(g, 0.55, 0.002)));
  check('scene 1 climb: measured output pitch within 3 cents of formula', climb.cents.every(c => Math.abs(c) < 3), climb.cents.map(c => c.toFixed(2)).join(' '));
  check('scene 1 climb: caption describes the demo during it and after it ends', climb.capDuring === CAP_CLIMB && climb.capAfter === CAP_CLIMB, climb.capAfter);
  check('scene 1 climb: label names each note, open then frets 1 to 7', sameList(climb.labels, ['Lane 1 · open', ...[1, 2, 3, 4, 5, 6, 7].map(f => 'Lane 1 · fret ' + f)]), climb.labels.join(' | '));
  check('scene 1 climb: each label change lands within 60 ms after its note', climb.lag.every(x => x > -0.005 && x < 0.06), `ms ${climb.lag.map(x => Math.round(x * 1000)).join(' ')}`);
  const opens = await pitched('#opens', [0, 5, 10, 15, 19, 24], 0.65);
  check('scene 1 "Lanes 1 to 6, open" plays Heights 0 5 10 15 19 24', sameList(opens.got, [0, 5, 10, 15, 19, 24]));
  check('scene 1 opens: caption describes the demo during it and after it ends', opens.capDuring === CAP_OPENS && opens.capAfter === CAP_OPENS, opens.capAfter);
  check('scene 1 opens: label names lanes 1 to 6 open, in order', sameList(opens.labels, [1, 2, 3, 4, 5, 6].map(l => `Lane ${l} · open`)), opens.labels.join(' | '));
  check('scene 1 opens: each label change lands within 60 ms after its note', opens.lag.every(x => x > -0.005 && x < 0.06), `ms ${opens.lag.map(x => Math.round(x * 1000)).join(' ')}`);
  const cents = [];
  const spots = [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [0, 7], [2, 2], [3, 1], [3, 2], [4, 5], [5, 5], [5, 7]];
  for (const [l, f] of spots) {
    await page.click('#stop');
    await sleep(150);
    await ev(() => { window.__rec = true; });
    const m = await mark();
    await page.click(`#b1 .cell[data-l="${l}"][data-f="${f}"]`);
    await sleep(650);
    await ev(() => { window.__rec = false; });
    const e = oscStarts(await since(m))[0];
    const x = await ev(([a, b, o]) => window.__cap.blocks.filter(z => z.d && z.t - o >= a && z.t - o < b).flatMap(z => z.d), [e.when + 0.1, e.when + 0.45, OFF]);
    cents.push([OPEN[l] + f, 1200 * Math.log2(detectPitch(x, sr) / hz(OPEN[l] + f))]);
  }
  check('single notes on every lane (Heights 0–31): measured output pitch within 3 cents', cents.every(([, c]) => Math.abs(c) < 3), cents.map(([h, c]) => `H${h} ${c.toFixed(2)}`).join(', '));
}

// ---------- 4. Scene 1: Stop cancels pending playback that was already scheduled ----------
{
  const m = await mark();
  await page.click('#climb');
  await sleep(1200);
  const before = await s1text();
  await page.click('#stop');
  const tStop = await now();
  await sleep(4000);
  const lg = await since(m);
  const later = lg.filter(e => e.ev === 'start' && e.now > tStop);
  const r = await rmsRange(tStop + 0.06, tStop + 3.8);
  const after = await s1text();
  check('Stop silences already-scheduled future notes (scene 1 climb)', later.length === 0 && r.max < SILENT && r.n > 100, `max RMS after stop ${r.max.toExponential(1)} over ${r.n} blocks`);
  check('Stop freezes the note label (no pending updates) and keeps the demo caption', before.note === after.note && /fret [12]$/.test(after.note) && after.cap === CAP_CLIMB, JSON.stringify(after));
  check('Stop darkens the strings', await ev(() => [...document.querySelectorAll('#b1 .vib')].every(v => +getComputedStyle(v).opacity === 0)));
}

// ---------- 5. Scene 2: Bare ----------
{
  await go(2);
  let m = await mark();
  await page.click('#strum2');
  await sleep(700);
  let lg = await since(m), st = oscStarts(lg);
  check('scene 2 Strum Bare plays Heights 0 7 12, thick to thin', sameList(hts(lg), [0, 7, 12]) && near(st[1].when - st[0].when, 0.02, 0.001) && near(st[2].when - st[1].when, 0.02, 0.001));
  const r = await rmsRange(st[0].when + 0.1, st[0].when + 0.5);
  check('scene 2 strum is audible and modest', r.max > 0.01 && r.peak < 0.5, `peak ${(20 * Math.log10(r.peak)).toFixed(1)} dBFS, RMS ${(20 * Math.log10(r.mean)).toFixed(1)} dBFS`);
  const vis = await ev(() => ({ lit: [...document.querySelectorAll('#b2 .vib')].map(v => +getComputedStyle(v).opacity > 0.15), dots: [...document.querySelectorAll('#b2 .dot')].map(d => d.className + ':' + d.textContent + ':' + d.style.gridRow) }));
  check('scene 2 board lights exactly lanes 1-3 while sounding', sameList(vis.lit.map(String), ['true', 'true', 'true', 'false', 'false', 'false']), vis.dots.join(' | '));
  m = await mark();
  await page.click('#each2');
  await sleep(3000);
  check('scene 2 "One lane at a time" plays 0, 7, 12 separately', sameList(hts(await since(m)), [0, 7, 12]));
  // Mute
  await page.click('#mute');
  m = await mark();
  await page.click('#strum2');
  await sleep(800);
  lg = await since(m); st = oscStarts(lg);
  const rm = await rmsRange(st[0].when + 0.1, st[0].when + 0.7);
  const shown = await ev(() => [...document.querySelectorAll('#b2 .vib')].slice(0, 3).every(v => +getComputedStyle(v).opacity > 0.15));
  check('Mute: notes still scheduled and shown, but output is silent', st.length === 3 && shown && rm.max < SILENT && (await ev(() => $('#mute').getAttribute('aria-pressed'))) === 'true', `max RMS ${rm.max.toExponential(1)}`);
  await page.click('#mute');
  m = await mark();
  await page.click('#strum2');
  await sleep(700);
  st = oscStarts(await since(m));
  check('Unmute restores sound', (await rmsRange(st[0].when + 0.05, st[0].when + 0.5)).max > 0.01);
}

// ---------- 6. Leaving a scene stops its audio ----------
{
  await page.click('#strum2');
  await sleep(300);
  await page.click('#s2 .pager a[href="#3"]');
  const t = await now();
  await sleep(1500);
  const r = await rmsRange(t + 0.06, t + 1.4);
  check('leaving scene 2 mid-sound silences it', r.max < SILENT, `max ${r.max.toExponential(1)}`);
  check('Next moves focus to the new scene heading', await ev(() => document.activeElement.id === 'h3'));
}

// ---------- 7. Scene 3: same Height, twins ----------
{
  const runs = [['#a3', [5]], ['#bb3', [5]], ['#ab3', [5, 5]], ['#tw3', [5, 17]]];
  for (const [sel, want] of runs) {
    const m = await mark();
    await page.click(sel);
    await sleep(2200);
    const lg = await since(m), st = oscStarts(lg);
    const lanes = st.map(e => e.f);
    check(`scene 3 ${sel} plays Heights ${want.join(', ')}`, sameList(hts(lg), want));
    if (sel === '#ab3') {
      // A (lane 1 fret 5) is released before B (lane 2 open) starts
      const a = await rmsRange(st[0].when + 1.1, st[0].when + 1.28), gap = await rmsRange(st[1].when - 0.04, st[1].when - 0.005);
      check('scene 3 "A, then B": A has faded out (below -40 dB of itself) before B starts', gap.max < a.mean * 0.01, `A ${(20 * Math.log10(a.mean)).toFixed(0)} dB, just before B ${(20 * Math.log10(gap.max + 1e-12)).toFixed(0)} dB`);
    }
  }
  await page.click('#b3 .cell[data-l="0"][data-f="5"]');
  await sleep(200);
  const hl = await ev(() => ({ same: [...document.querySelectorAll('#b3 .cell.same')].map(c => c.dataset.l + '/' + c.dataset.f), twin: [...document.querySelectorAll('#b3 .cell.twin')].map(c => c.dataset.l + '/' + c.dataset.f) }));
  const wantSame = [], wantTwin = [];
  for (let f = 0; f <= 7; f++) for (let l = 0; l < 6; l++) { const h = OPEN[l] + f; if (h === 5) wantSame.push(l + '/' + f); else if ((h - 5) % 12 === 0) wantTwin.push(l + '/' + f); }
  check('scene 3 tap Height 5 rings same-Height and twin spots', sameList(hl.same, wantSame) && sameList(hl.twin, wantTwin), `same ${hl.same} twin ${hl.twin}`);
  check('scene 3 Height labels match lane + fret everywhere', await ev(() => [...document.querySelectorAll('#b3 .cell')].every(c => +c.textContent === OPEN[+c.dataset.l] + +c.dataset.f)));
}

// ---------- 8. Scene 4: Wide / Close / Bare / Float ----------
{
  await go(4);
  const want = { '#wide4': [0, 7, 12, 16, 19, 24], '#close4': [0, 7, 12, 15, 19, 24], '#bare4': [0, 7, 12], '#float4': [0, 7, 12, 17, 19, 24] };
  for (const [sel, w] of Object.entries(want)) {
    const m = await mark();
    await page.click(sel);
    await sleep(900);
    const st = await ev(() => ({ table: [...document.querySelectorAll('#b4 .fb-tv')].map(e => e.textContent), say: $('#say4').textContent, pressed: [...document.querySelectorAll('#s4 [aria-pressed="true"]')].map(b => b.id) }));
    check(`scene 4 ${sel} plays Heights ${w.join(' ')}`, sameList(hts(await since(m)), w) && st.pressed.length === 1 && st.pressed[0] === sel.slice(1), `table ${st.table.join(' ')} · ${st.say}`);
  }
  await page.click('#close4');
  await sleep(300);
  const c = await ev(() => ({ ghost: [...document.querySelectorAll('#b4 .ghost.chg')].map(g => g.style.gridColumn + '/' + g.style.gridRow), lane4: document.querySelectorAll('#b4 .dot')[3].className }));
  check('scene 4 Close shows the lifted index finger as a ghost at lane 4 fret 1', sameList(c.ghost, ['5/2']) && c.lane4.includes('open') && c.lane4.includes('chg'), JSON.stringify(c));
  await page.click('#wide4');
  await sleep(300);
  check('scene 4 Wide highlights the index finger on lane 4 fret 1', await ev(() => { const d = document.querySelectorAll('#b4 .dot')[3]; return d.textContent === 'I' && d.classList.contains('chg') && d.style.gridRow === '2'; }));
  let m = await mark();
  await page.click('#diff4');
  await sleep(5200);
  check('scene 4 "Only the changed note" plays lane 4 alone: 16, 15, 16, 15', sameList(hts(await since(m)), [16, 15, 16, 15]));
  m = await mark();
  await page.click('#flip4');
  await sleep(7600);
  const fl = hts(await since(m));
  check('scene 4 "Back and forth" plays Wide, Close, Wide, Close', sameList(fl, [].concat(want['#wide4'], want['#close4'], want['#wide4'], want['#close4'])));
  check('scene 4 board ends on Close after back and forth', await ev(() => $('#close4').getAttribute('aria-pressed') === 'true' && document.querySelectorAll('#b4 .dot')[3].classList.contains('open')));
}

// ---------- 9. Scene 5: moving shapes ----------
async function scene5(p, sel, first, second, nameOK) {
  const m = await p.evaluate(() => window.__log.length);
  await p.click(sel);
  await sleep(1650);   // move starts 1.4 s after the click
  const mid = await p.evaluate(() => [...document.querySelectorAll('#b5 .dot')].map(d => d.getAnimations().length));
  await sleep(1500);
  const lg = await p.evaluate(m => window.__log.slice(m), m);
  const st = oscStarts(lg);
  const after = await p.evaluate(() => ({ rows: [...document.querySelectorAll('#b5 .dot')].slice(0, 3).map(d => d.style.gridRow), ghosts: document.querySelectorAll('#b5 .ghost').length, say: $('#say5').textContent, tv: [...document.querySelectorAll('#b5 .fb-tv')].map(e => e.textContent).join(' ') }));
  return { h: hts(lg), mid, after, st, lg };
}
{
  await go(5);
  let r = await scene5(page, '#move5', [3, 10, 15], [5, 12, 17]);
  check('scene 5 move: 3 5 5 then 5 7 7 (Heights 3 10 15 → 5 12 17)', sameList(r.h, [3, 10, 15, 5, 12, 17]), r.after.say);
  check('scene 5 move: every sounding dot animates', r.mid.slice(0, 3).every(n => n > 0) && r.mid.slice(3).every(n => n === 0), `animations per lane ${r.mid}`);
  check('scene 5 move: dots end at frets 5 7 7, ghosts at the old frets', sameList(r.after.rows, ['6', '8', '8']) && r.after.ghosts === 3, JSON.stringify(r.after));
  // the first chord is hushed during the slide
  const firstIds = r.st.slice(0, 3).map(e => e.id), tm = r.st[0].when + 1.4;
  const stops = firstIds.map(id => r.lg.filter(e => e.ev === 'stop' && e.id === id).pop());
  const gap = await rmsRange(tm + 0.2, r.st[3].when - 0.01);
  check('scene 5 move: first chord really ends during the slide', stops.every(s => s && near(s.when, tm + 0.2, 0.01)) && gap.max < SILENT, `silence max ${gap.max.toExponential(1)}`);
  r = await scene5(page, '#slip5');
  check('scene 5 fingers only: 0 2 2 then 0 4 4 → not Bare', sameList(r.h, [0, 7, 12, 0, 9, 14]) && /not Bare/.test(r.after.say) && r.after.tv.includes('0 9 2'), r.after.say);
  r = await scene5(page, '#all5');
  check('scene 5 every lane: 0 2 2 then 2 4 4 → Bare', sameList(r.h, [0, 7, 12, 2, 9, 14]) && /: Bare\./.test(r.after.say) && r.after.mid !== null, r.after.say);
  check('scene 5 every lane: the open ring slides down to fret 2', r.mid[0] > 0 && r.after.rows[0] === '3');
}

// ---------- 10. Scene 6: Strike, Ring, Hush, Brush ----------
async function runProgression(p, bpm) {
  await p.click(`[data-bpm="${bpm}"]`);
  if ((await p.evaluate(() => $('#loop6').getAttribute('aria-pressed'))) === 'true') await p.click('#loop6');
  await p.evaluate(() => {
    window.__vis = [];
    window.__ops = [];
    const els = [...document.querySelectorAll('#prog6 .bt')];
    new MutationObserver(() => { const i = els.findIndex(e => e.classList.contains('now6')); const l = window.__vis[window.__vis.length - 1]; if (!l || l.i !== i) window.__vis.push({ i, t: window.__ctx.currentTime, word: $('#word6').textContent }); })
      .observe($('#prog6'), { subtree: true, attributes: true, attributeFilter: ['class'] });
    window.__opT = setInterval(() => window.__ops.push({ t: window.__ctx && window.__ctx.currentTime, op: [...document.querySelectorAll('#b6 .vib')].slice(0, 3).map(v => +getComputedStyle(v).opacity) }), 20);
  });
  const m = await p.evaluate(() => window.__log.length);
  await p.click('#play6');
  const spb = 60 / bpm;
  await sleep((4 + 16 + 1.5) * spb * 1000 + 500);
  await p.evaluate(() => clearInterval(window.__opT));
  const lg = await p.evaluate(m => window.__log.slice(m), m);
  return { lg, spb, vis: await p.evaluate(() => window.__vis), ops: await p.evaluate(() => window.__ops), ui: await p.evaluate(() => ({ play: $('#play6').textContent, word: $('#word6').textContent })) };
}
{
  await go(6);
  const { lg, spb, vis, ops, ui } = await runProgression(page, 66);
  const starts = lg.filter(e => e.ev === 'start');
  const ticks = starts.filter(e => e.kind === 'osc' && e.f >= 1000);
  check('scene 6 count-in: four ticks one beat apart', ticks.length === 4 && ticks.every((t, i) => !i || near(t.when - ticks[i - 1].when, spb, 0.002)));
  const T0 = ticks[0].when + 4 * spb;
  const beatT = k => T0 + k * spb;
  const PROGH = [[0, 7, 12], [3, 10, 15], [5, 12, 17], [0, 7, 12]];
  const inBeat = (k, e) => e.when >= beatT(k) - 0.005 && e.when < beatT(k + 1) - 0.005;
  let ringNew = 0, hushNew = 0, brushOsc = 0, strikeOK = true, brushBuf = true, ringSound = true, hushSilent = true, brushShort = true;
  const detail = [];
  for (let g = 0; g < 4; g++) {
    const k = g * 4;
    const sk = starts.filter(e => inBeat(k, e));
    if (!(sk.every(e => e.kind === 'osc') && sameList(sk.map(e => Math.round(heightOf(e.f))), PROGH[g]) && near(sk[0].when, beatT(k), 0.002))) strikeOK = false;
    ringNew += starts.filter(e => inBeat(k + 1, e)).length;
    hushNew += starts.filter(e => inBeat(k + 2, e)).length;
    const br = starts.filter(e => inBeat(k + 3, e));
    brushOsc += br.filter(e => e.kind === 'osc').length;
    if (!(br.length === 3 && br.every(e => e.kind === 'buf'))) brushBuf = false;
    const ring = await rmsRange(beatT(k + 1) + 0.03, beatT(k + 2) - 0.03);
    const hush = await rmsRange(beatT(k + 2) + 0.15, beatT(k + 3) - 0.01);
    const chk = await rmsRange(beatT(k + 3), beatT(k + 3) + 0.08);
    const tail = await rmsRange(beatT(k + 3) + 0.2, beatT(k + 4) - 0.01);
    if (!(ring.mean > 0.004)) ringSound = false;
    if (!(hush.max < SILENT)) hushSilent = false;
    if (!(chk.max > 0.001 && tail.max < SILENT)) brushShort = false;
    // every strike oscillator is told to stop at the hush (+0.2 s release)
    for (const e of sk) { const s = lg.filter(x => x.ev === 'stop' && x.id === e.id).pop(); if (!s || !near(s.when, beatT(k + 2) + 0.2, 0.01)) hushSilent = false; }
    detail.push(`shape ${g + 1}: ring RMS ${(20 * Math.log10(ring.mean)).toFixed(0)} dB, hush max ${hush.max.toExponential(0)}, brush ${(20 * Math.log10(chk.max)).toFixed(0)} dB then ${tail.max.toExponential(0)}`);
  }
  check('scene 6 Strike starts the right three notes on the beat (E5 G5 A5 E5)', strikeOK);
  check('scene 6 Ring starts nothing at all', ringNew === 0, `${ringNew} starts during Ring beats`);
  check('scene 6 Ring keeps the struck sound going', ringSound);
  check('scene 6 Hush starts nothing and the output goes silent', hushNew === 0 && hushSilent);
  check('scene 6 Brush is noise only (no pitched notes) and dies away', brushOsc === 0 && brushBuf && brushShort);
  detail.forEach(d => console.log('      ' + d));
  // visuals against audio
  const vb = vis.filter(v => v.i >= 0);
  const offs = vb.map(v => v.t - beatT(v.i));
  check('scene 6 beat highlight visits all 16 beats in order', sameList(vb.map(v => v.i), [...Array(16).keys()]));
  check('scene 6 beat highlight lands within 60 ms after its audio', offs.every(o => o > -0.005 && o < 0.06), `offsets ms ${offs.map(o => Math.round(o * 1000)).join(' ')}`);
  const lit = (t0, t1) => ops.filter(o => o.t >= t0 && o.t < t1);
  let litOK = true;
  for (let g = 0; g < 4; g++) {
    const k = g * 4;
    if (!lit(beatT(k + 1) + 0.1, beatT(k + 2) - 0.05).every(o => o.op.every(x => x > 0.15))) litOK = false;          // Ring: still lit
    if (!lit(beatT(k + 2) + 0.15, beatT(k + 3) - 0.02).every(o => o.op.every(x => x === 0))) litOK = false;          // Hush: dark
  }
  check('scene 6 strings stay lit through Ring and go dark at Hush', litOK);
  check('scene 6 ends cleanly when Repeat is off', ui.play === 'Play' && ui.word === 'Ready', JSON.stringify(ui));
}

// ---------- 11. Scene 6: Pause / Resume, Stop, leaving, hidden tab ----------
{
  await page.click('[data-bpm="66"]');
  await page.click('#loop6'); // Repeat back on
  const m = await mark();
  await page.click('#play6');
  const spb = 60 / 66;
  // wait until beat 5 (shape 2, Ring) is shown
  while (!(await ev(() => document.querySelectorAll('#prog6 .bt')[5].classList.contains('now6')))) await sleep(20);
  await page.click('#play6'); // Pause
  const tP = await now();
  await sleep(1500);
  let lg = await since(m);
  const r = await rmsRange(tP + 0.06, tP + 1.4);
  const st = await ev(() => ({ btn: $('#play6').textContent, beat: T.beat, word: $('#word6').textContent }));
  check('Pause: silence, nothing new starts, resume point is the start of shape 2', lg.filter(e => e.ev === 'start' && e.now > tP).length === 0 && r.max < SILENT && st.btn === 'Resume' && st.beat === 4, JSON.stringify(st));
  const m2 = await mark();
  await page.click('#play6'); // Resume
  await sleep((5 + 0.5) * spb * 1000);
  lg = await since(m2);
  const tk = lg.filter(e => e.ev === 'start' && e.f >= 1000).length;
  check('Resume: count-in, then Strike of 3 5 5', tk === 4 && sameList(hts(lg).slice(0, 3), [3, 10, 15]), `heights ${hts(lg)}`);
  // Stop mid-play
  await sleep(1300);
  const m3 = await mark();
  await page.click('#stop');
  const tS = await now();
  await sleep(2500);
  lg = await since(m3);
  const rs = await rmsRange(tS + 0.06, tS + 2.3);
  const ui = await ev(() => ({ btn: $('#play6').textContent, word: $('#word6').textContent, hl: document.querySelectorAll('#prog6 .now6').length, beat: T.beat, on: T.on }));
  check('Stop during the progression: silence, no new sounds, back to the start', lg.filter(e => e.ev === 'start').length === 0 && rs.max < SILENT && ui.btn === 'Play' && ui.hl === 0 && ui.beat === 0 && !ui.on, JSON.stringify(ui));
  // leaving scene 6 mid-play
  await page.click('#play6');
  await sleep(4200);
  await ev(() => addEventListener('hashchange', () => { window.__hashT = window.__ctx.currentTime; }, { once: true }));
  const m4 = await mark();
  await page.click('#s6 .pager a[href="#5"]');
  await sleep(50);
  const tL = await ev(() => window.__hashT);
  await sleep(2500);
  const rl = await rmsRange(tL + 0.06, tL + 2.3);
  const ls = (await since(m4)).filter(e => e.ev === 'start' && e.now > tL);
  check('Leaving scene 6 mid-play stops it', ls.length === 0 && rl.max < SILENT && !(await ev(() => T.on)), `starts after leaving ${ls.length} ${JSON.stringify(ls.slice(0, 3))}, max ${rl.max.toExponential(1)}, scene ${await ev(() => scene)}, T.on ${await ev(() => T.on)}`);
  // hidden tab pauses
  await go(6);
  await page.click('#play6');
  await sleep(4200);
  await ev(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  const tH = await now();
  await sleep(1500);
  const rh = await rmsRange(tH + 0.06, tH + 1.4);
  check('Switching away from the tab pauses and silences', rh.max < SILENT && (await ev(() => $('#play6').textContent)) !== 'Pause');
  await ev(() => { delete document.hidden; });
}

// ---------- 12. Keyboard ----------
{
  await go(1);
  await page.click('#stop');
  await ev(() => document.activeElement.blur());
  let tabs = 0, onCell = false;
  while (tabs < 30 && !onCell) { await page.keyboard.press('Tab'); tabs++; onCell = await ev(() => document.activeElement.classList.contains('cell')); }
  const ring = await ev(() => getComputedStyle(document.activeElement).outlineStyle);
  const [l0, f0] = await ev(() => [+document.activeElement.dataset.l, +document.activeElement.dataset.f]);
  const l1 = l0 > 2 ? l0 - 1 : l0 + 1, f1 = f0 > 3 ? f0 - 3 : f0 + 3;
  const want = `${l1}/${f1}`, wantH = OPEN[l1] + f1;
  const vk = f0 > 3 ? 'ArrowUp' : 'ArrowDown', hk = l0 > 2 ? 'ArrowLeft' : 'ArrowRight';
  for (const k of [vk, vk, vk, hk]) await page.keyboard.press(k);
  const at = await ev(() => document.activeElement.dataset.l + '/' + document.activeElement.dataset.f);
  const m = await mark();
  await page.keyboard.press('Enter');
  await sleep(300);
  await page.keyboard.press(' ');
  await sleep(300);
  check('keyboard: Tab reaches the board, arrows move, Enter/Space play', onCell && at === want && sameList(hts(await since(m)), [wantH, wantH]) && ring !== 'none', `${tabs} tabs, started ${l0}/${f0} (last tapped), focus ring ${ring}, now ${at} → Height ${wantH}`);
  await page.keyboard.press('Tab');
  const nextIsBtn = await ev(() => document.activeElement.id);
  const m2 = await mark();
  await page.keyboard.press('Enter');
  await sleep(700);
  check('keyboard: one Tab leaves the board to its first button, which plays', nextIsBtn === 'climb' && hts(await since(m2)).length >= 1, nextIsBtn);
  await page.click('#stop');
}
check('no console errors or warnings in desktop run', errors.length === 0, errors.join(' | '));
await ctx.close();

// ---------- 13. Reduced motion ----------
{
  const o = await open(browser, { ...DESK, reducedMotion: 'reduce' }, '5');
  const r = await scene5(o.page, '#move5');
  check('reduced motion: shape jumps without animation, ghosts still show the old place', sameList(r.h, [3, 10, 15, 5, 12, 17]) && r.mid.every(n => n === 0) && r.after.ghosts === 3 && sameList(r.after.rows, ['6', '8', '8']));
  await o.page.click('#strum5');
  await sleep(100);
  check('reduced motion: no strike pulse animation', await o.page.evaluate(() => [...document.querySelectorAll('#b5 .dot')].every(d => getComputedStyle(d).animationName === 'none')));
  await o.ctx.close();
}

// ---------- 14. Phone: touch taps, sizes, overflow at many widths ----------
for (const [name, opts] of [['Pixel 8 Pro 448', PHONE], ['Pixel 8 Pro 412', PIXEL], ['small Android 360', SMALL]]) {
  const o = await open(browser, opts, '1');
  await o.page.tap('#b1 .cell[data-l="2"][data-f="2"]');
  await sleep(400);
  const lg = await o.page.evaluate(() => window.__log);
  check(`${name}: touch tap plays lane 3 fret 2 (Height 12)`, sameList(hts(lg), [12]) && (await o.page.evaluate(() => window.__ctx.state)) === 'running');
  await o.page.tap('#climb');
  await sleep(4800);
  const lay = await o.page.evaluate(() => {
    const r = s => document.querySelector(s).getBoundingClientRect();
    const b = r('#b1'), n = r('#note1'), c = r('#s1 .ctrl'), y = r('#say1');
    return { board: Math.round(b.bottom), note: [Math.round(n.top), Math.round(n.bottom), Math.round(n.left), Math.round(n.right)], ctrl: [Math.round(c.top), Math.round(c.bottom)], cap: [Math.round(y.top), Math.round(y.bottom)], vh: innerHeight, vw: innerWidth, text: $('#note1').textContent, cap1: $('#say1').textContent };
  });
  check(`${name}: scene 1 order is board, note label, demo buttons, caption; label on one line`,
    lay.board <= lay.note[0] && lay.note[1] <= lay.ctrl[0] && lay.ctrl[1] <= lay.cap[0] && lay.note[1] - lay.note[0] < 40 && lay.note[2] >= 0 && lay.note[3] <= lay.vw && lay.text === 'Lane 1 · fret 7' && lay.cap1 === CAP_CLIMB,
    `board ends ${lay.board}, label ${lay.note[0]}–${lay.note[1]}, buttons ${lay.ctrl[0]}–${lay.ctrl[1]}, caption ${lay.cap[0]}–${lay.cap[1]} of ${lay.vh}px`);
  await o.page.screenshot({ path: `shots/s1-feedback-${opts.viewport.width}.png` });
  await o.page.tap('#stop');
  let small = [];
  for (let s = 1; s <= 6; s++) {
    await o.page.tap(`.tabs a[href="#${s}"]`);
    await sleep(100);
    small = small.concat(await o.page.evaluate(n => [...document.querySelectorAll(`#s${n} .cell, #s${n} .btn, .bar .btn, .tabs a, #s${n} summary`)].map(e => { const r = e.getBoundingClientRect(); return { n: e.id || e.className || e.tagName, w: r.width, h: r.height }; }).filter(r => r.w && (r.w < 43.5 || r.h < 43.5)), s));
  }
  check(`${name}: every touch target is at least 44 × 44 px`, small.length === 0, small.slice(0, 5).map(x => `${x.n} ${x.w.toFixed(0)}×${x.h.toFixed(0)}`).join(', '));
  check(`${name}: no console errors`, o.errors.length === 0, o.errors.join(' | '));
  await o.ctx.close();
}
{
  const over = [];
  for (const w of [320, 360, 393, 412, 448, 600, 768, 1024, 1280, 1440, 1920]) {
    const o = await open(browser, { viewport: { width: w, height: 800 } }, '1');
    for (let s = 1; s <= 6; s++) {
      await o.page.evaluate(n => { location.hash = '#' + n; }, s);
      await sleep(60);
      const sw = await o.page.evaluate(() => document.documentElement.scrollWidth);
      if (sw > w) over.push(`${w}px scene ${s}: ${sw}`);
    }
    await o.ctx.close();
  }
  check('no horizontal overflow at 320–1920 px, every scene', over.length === 0, over.join(', '));
}

await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join('; ')}` : '\nAll checks passed.');
process.exit(fails.length ? 1 : 0);

// McLeod-style normalized autocorrelation pitch detector
function detectPitch(x, sr) {
  const n = x.length, minLag = Math.floor(sr / 1200), maxLag = Math.ceil(sr / 60);
  const nsdf = new Float64Array(maxLag + 2);
  for (let tau = minLag; tau <= maxLag + 1; tau++) {
    let ac = 0, m = 0;
    for (let i = 0; i + tau < n; i++) { ac += x[i] * x[i + tau]; m += x[i] * x[i] + x[i + tau] * x[i + tau]; }
    nsdf[tau] = m ? 2 * ac / m : 0;
  }
  let best = 0;
  for (let t = minLag + 1; t <= maxLag; t++) best = Math.max(best, nsdf[t]);
  for (let t = minLag + 1; t <= maxLag; t++) {
    if (nsdf[t] >= 0.9 * best && nsdf[t] >= nsdf[t - 1] && nsdf[t] >= nsdf[t + 1]) {
      const a = nsdf[t - 1], b = nsdf[t], c = nsdf[t + 1], d = (a - c) / (2 * (a - 2 * b + c) || 1);
      return sr / (t + d);
    }
  }
  return NaN;
}
