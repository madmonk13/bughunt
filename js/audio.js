'use strict';
// ===== Synthesized sound effects (WebAudio, no asset files) =====
const SFX = (() => {
  let ac = null, master = null, noiseBuf = null, muted = false;
  let pingBuf = null, blipBuf = null;
  const BLIP_F = 2000, TRACKER_LPF = 2400;
  const last = {};
  const VOL = 0.45;

  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = muted ? 0 : VOL;
    master.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    pingBuf = crushed(0.42, 4, 7000, (t) => {
      const env = (u) => (u < 0 ? 0 : Math.min(1, u / 0.003) * Math.exp(-u * 14));
      const click = t < 0.004 ? (Math.random() * 2 - 1) * (1 - t / 0.004) : 0;
      const tri = (f, u) => 2 / Math.PI * Math.asin(Math.sin(TAU * f * u));
      return click * 0.6 + tri(1760, t) * env(t) * 0.8 + tri(1760, t - 0.12) * env(t - 0.12) * 0.3;
    });
    blipBuf = crushed(0.14, 3, 5500, (t) => Math.sin(TAU * BLIP_F * t) * Math.min(1, t / 0.003) * Math.exp(-t * 22));
  }

  // Renders fn(t) into a buffer through a bitcrusher: sample-and-hold at `rate` Hz, quantized to `bits`.
  function crushed(dur, bits, rate, fn) {
    const sr = ac.sampleRate, buf = ac.createBuffer(1, Math.ceil(dur * sr), sr), d = buf.getChannelData(0);
    const hold = Math.max(1, Math.round(sr / rate)), lv = 2 ** (bits - 1);
    let v = 0;
    for (let i = 0; i < d.length; i++) {
      if (i % hold === 0) v = Math.round(clamp(fn(i / sr), -1, 1) * lv) / lv;
      d[i] = v;
    }
    return buf;
  }

  function sample(buf, vol, rate = 1, delay = 0, lpf = 0) {
    const t = ac.currentTime + delay;
    const src = ac.createBufferSource();
    src.buffer = buf; src.playbackRate.value = rate;
    const g = ac.createGain();
    g.gain.value = vol;
    if (lpf) {
      const f = ac.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = lpf; f.Q.value = 0.5;
      src.connect(f); f.connect(g);
    } else src.connect(g);
    g.connect(master);
    src.start(t);
  }

  function ok(name, ms) {
    const now = performance.now();
    if (last[name] && now - last[name] < ms) return false;
    last[name] = now;
    return true;
  }

  function noise(dur, type, freq, vol, freqEnd, delay = 0, q = 1) {
    const t = ac.currentTime + delay;
    const src = ac.createBufferSource();
    src.buffer = noiseBuf; src.loop = true;
    const f = ac.createBiquadFilter();
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
  }

  function tone(freq, dur, type, vol, freqEnd, delay = 0) {
    const t = ac.currentTime + delay;
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0008, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  const sounds = {
    pulse() { if (!ok('pulse', 45)) return; noise(0.07, 'bandpass', 1900, 0.28, 900, 0, 0.9); tone(140, 0.05, 'square', 0.05, 60); },
    shotgun() { if (!ok('shotgun', 80)) return; noise(0.28, 'lowpass', 1600, 0.55, 150); tone(90, 0.15, 'sine', 0.3, 40); },
    smart() { if (!ok('smart', 55)) return; noise(0.06, 'bandpass', 2600, 0.2, 1200, 0, 1.2); },
    flame() { if (!ok('flame', 110)) return; noise(0.2, 'lowpass', 700, 0.14, 300); },
    grenade() { if (!ok('grenade', 60)) return; tone(320, 0.09, 'triangle', 0.18, 140); noise(0.05, 'lowpass', 600, 0.15); },
    boom() { if (!ok('boom', 50)) return; noise(0.6, 'lowpass', 900, 0.6, 50); tone(70, 0.45, 'sine', 0.45, 28); },
    arc() { if (!ok('arc', 60)) return; tone(1100, 0.14, 'sawtooth', 0.07, 180); noise(0.12, 'highpass', 3000, 0.12); },
    laser() { if (!ok('laser', 70)) return; tone(1500, 0.07, 'square', 0.04, 500); },
    deploy() { tone(400, 0.08, 'square', 0.06, 800); tone(800, 0.1, 'square', 0.05, 1200, 0.09); },
    hiss() {
      if (!ok('hiss', 45)) return;
      noise(0.28, 'bandpass', rand(2500, 3500), 0.14, 900, 0, 2);
      tone(rand(500, 900), 0.18, 'sawtooth', 0.035, 160);
    },
    hurt() { if (!ok('hurt', 160)) return; tone(110, 0.22, 'sine', 0.5, 45); noise(0.12, 'lowpass', 500, 0.3); },
    gem() { if (!ok('gem', 35)) return; tone(rand(1300, 1500), 0.06, 'sine', 0.05, 2100); },
    pickup() { tone(600, 0.14, 'triangle', 0.15, 1300); tone(900, 0.14, 'triangle', 0.1, 1800, 0.08); },
    level() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.14, 'square', 0.06, null, i * 0.07)); },
    // Low-passed so the crushed aliasing reads as grit rather than a piercing whistle.
    ping() { sample(pingBuf, 0.15, 1, 0, TRACKER_LPF); },
    blip(o) { sample(blipBuf, 0.11, o.f / BLIP_F, o.delay, TRACKER_LPF); },
    nvon() { tone(300, 0.7, 'sine', 0.06, 5200); tone(5200, 1.2, 'sine', 0.012, null, 0.65); },
    hatch() { if (!ok('hatch', 120)) return; noise(0.3, 'lowpass', 500, 0.25, 120); tone(220, 0.2, 'sawtooth', 0.04, 70); },
    leap() { if (!ok('leap', 150)) return; noise(0.18, 'bandpass', 4000, 0.1, 2000, 0, 3); },
    spit() { if (!ok('spit', 120)) return; noise(0.15, 'bandpass', 1200, 0.18, 400, 0, 2); },
    screech() { noise(1.3, 'bandpass', 1800, 0.45, 350, 0, 3); tone(520, 1.1, 'sawtooth', 0.1, 110); tone(780, 0.9, 'sawtooth', 0.05, 200, 0.1); },
    alarm() { for (let i = 0; i < 3; i++) { tone(660, 0.25, 'square', 0.06, null, i * 0.5); tone(440, 0.25, 'square', 0.06, null, i * 0.5 + 0.25); } },
    win() { [392, 523, 659, 784, 1046].forEach((f, i) => tone(f, 0.35, 'triangle', 0.12, null, i * 0.15)); },
    lose() { [440, 349, 262, 196].forEach((f, i) => tone(f, 0.45, 'triangle', 0.12, null, i * 0.28)); },
  };

  return {
    init,
    get muted() { return muted; },
    toggleMute() { muted = !muted; if (master) master.gain.value = muted ? 0 : VOL; return muted; },
    play(name, opt) {
      if (!ac || muted || ac.state !== 'running') return;
      const fn = sounds[name];
      if (fn) fn(opt);
    },
  };
})();
