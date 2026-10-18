// Injected before the page runs. Records every audio source start/stop and taps the
// final output (what reaches the speakers) so tests can measure real loudness and pitch.
(() => {
  const log = (window.__log = []);
  let n = 0;
  window.__ctxCount = 0;
  window.__cap = { blocks: [] };
  window.__rec = false;
  const origConnect = AudioNode.prototype.connect;
  const NativeAC = window.AudioContext;
  function setupTap(c) {
    const sp = c.createScriptProcessor(512, 1, 1);
    window.__cap.sr = c.sampleRate;
    sp.onaudioprocess = e => {
      const d = e.inputBuffer.getChannelData(0);
      let s = 0, p = 0;
      for (let i = 0; i < d.length; i++) { const x = d[i]; s += x * x; const a = Math.abs(x); if (a > p) p = a; }
      const blk = { t: e.playbackTime, rms: Math.sqrt(s / d.length), peak: p };
      if (window.__rec) blk.d = Array.from(d);
      window.__cap.blocks.push(blk);
    };
    origConnect.call(sp, c.destination);
    window.__tap = sp;
  }
  window.AudioContext = function (...a) {
    const c = new NativeAC(...a);
    window.__ctxCount++;
    window.__ctx = c;
    setupTap(c);
    return c;
  };
  window.AudioContext.prototype = NativeAC.prototype;
  AudioNode.prototype.connect = function (dest, ...r) {
    const res = origConnect.call(this, dest, ...r);
    if (dest instanceof AudioDestinationNode && this !== window.__tap && window.__tap) origConnect.call(this, window.__tap);
    return res;
  };
  const wrap = (P, kind) => {
    const st = P.start;
    P.start = function (when = 0, ...r) {
      this.__id ||= ++n;
      log.push({ ev: 'start', kind: this instanceof OscillatorNode ? 'osc' : 'buf', id: this.__id, when, now: this.context.currentTime, f: this.frequency ? this.frequency.value : null });
      return st.call(this, when, ...r);
    };
  };
  wrap(AudioScheduledSourceNode.prototype);
  if (Object.prototype.hasOwnProperty.call(AudioBufferSourceNode.prototype, 'start')) wrap(AudioBufferSourceNode.prototype);
  const sp0 = AudioScheduledSourceNode.prototype.stop;
  AudioScheduledSourceNode.prototype.stop = function (when = 0) {
    this.__id ||= ++n;
    log.push({ ev: 'stop', id: this.__id, when, now: this.context.currentTime });
    return sp0.call(this, when);
  };
})();
