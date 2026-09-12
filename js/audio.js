'use strict';
/* Monaco GT - Web Audio engine. Fully procedural: no audio files.
   Four logical channels with independent gain:
     music   - 4-part chiptune sequencer (pulse lead, bass, arp, noise drums)
     engine  - layered oscillators tracking RPM/gear with tunnel echo
     sfx     - squeal, collisions, turbo, jingles, beeps
     ambient - crowd noise and the odd seagull
   The AudioContext is created/resumed inside the first user gesture (iOS).
   Every public method is a no-op if audio is unavailable. */

// ---------- music data ----------
const NOTE_INDEX = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function noteToMidi(tok) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(tok);
  if (!m) return null;
  let n = NOTE_INDEX[m[1]];
  if (m[2] === '#') n++; else if (m[2] === 'b') n--;
  return 12 * (parseInt(m[3], 10) + 1) + n;
}
const midiToFreq = m => 440 * Math.pow(2, (m - 69) / 12);

// 16 tokens per bar: note = new note, '=' = hold previous, '-' = rest.
const LEAD_A = [
  'A5 = = C6 = = A5 = F5 = = G5 = A5 = =',
  'G5 = = = E5 = G5 = C6 = = = = = - -',
  'F5 = = A5 = = F5 = D5 = = E5 = F5 = =',
  'D5 = = = F5 = D5 = Bb4 = = = = = - -',
  'A5 = = C6 = = A5 = F5 = = G5 = A5 = =',
  'G5 = = = E5 = C5 = E5 = G5 = C6 = = =',
  'D6 = = C6 = = Bb5 = A5 = = G5 = F5 = =',
  'G5 = = = = = = = E5 = G5 = Bb5 = C6 =',
];
const LEAD_A2 = LEAD_A.slice(0, 7).concat(['G5 = = = = = = = C6 = Bb5 = A5 = G5 =']);
const LEAD_B = [
  'D6 = = = A5 = D6 = F6 = = = E6 = D6 =',
  'C6 = = = = = Bb5 = A5 = = = = = - -',
  'A5 = = = C6 = A5 = F5 = = = = = G5 =',
  'G5 = = = = = = = = = = = - - - -',
  'D6 = = = A5 = D6 = F6 = = = E6 = D6 =',
  'C6 = = = D6 = C6 = Bb5 = = = A5 = G5 =',
  'Bb5 = = = = = A5 = G5 = = = = = - -',
  'E5 = G5 = C6 = E6 = G6 = = = = = = =',
];
const LEAD_B2 = LEAD_B.slice(0, 7).concat(['E6 = = = D6 = C6 = G5 = = = = = = =']);
const LEAD = LEAD_A.concat(LEAD_A2, LEAD_B, LEAD_B2);

// chords per bar: [root midi (bass register), quality]
const CH = { F: [41, 'M'], C: [48, 'M'], Dm: [50, 'm'], Bb: [46, 'M'], Gm: [43, 'm'] };
const PROG_A = ['F', 'C', 'Dm', 'Bb', 'F', 'C', 'Bb', 'C'];
const PROG_B = ['Dm', 'Bb', 'F', 'C', 'Dm', 'Bb', 'Gm', 'C'];
const PROG = PROG_A.concat(PROG_A, PROG_B, PROG_B);

// bass patterns: semitone offsets from root per 16th (null = rest)
const BASS_A = [0, null, 12, null, 0, null, null, 12, null, 0, null, 7, null, 12, null, null];
const BASS_B = [0, null, 0, null, 12, null, 0, null, 7, null, 7, null, 12, null, 0, 12];
// arp pattern: chord tone index per 16th (0 root, 1 third, 2 fifth, 3 octave)
const ARP_A = [0, 2, 3, 2, 0, 2, 3, 2, 0, 2, 3, 2, 1, 2, 3, 2];
const ARP_B = [3, 2, 1, 2, 3, 2, 1, 2, 3, 2, 1, 2, 3, 1, 3, 2];
// drums: k kick, s snare, h hat, o open hat, '.' nothing (16 steps)
const DRUM_A = 'khhhshhokhkhshho';
const DRUM_B = 'khhhshhokhhhshho';
const DRUM_FILL = 'khhhshsskhkhssss';

const SONG = { bpm: 152, bars: 32 };

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ok = false;
    this.muted = false;
    this.paused = false;
    this.musicOn = false;
    this.pulse25 = null; this.pulse12 = null;
    this.noiseBuf = null;
    this._step = 0; this._nextTime = 0; this._timer = null;
    this.engineState = { rpm: 0, throttle: 0, tunnel: 0, on: false };
    try { this.muted = localStorage.getItem('monacogt.muted') === '1'; } catch (e) { /* ignore */ }
  }

  // Must be called from a user gesture handler.
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC({ latencyHint: 'interactive' });
      this._buildGraph();
      this.ok = true;
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      // iOS: play a silent buffer to fully unlock
      const b = this.ctx.createBuffer(1, 1, 22050);
      const s = this.ctx.createBufferSource(); s.buffer = b; s.connect(this.ctx.destination); s.start(0);
      this.applyMute();
    } catch (e) {
      this.ctx = null; this.ok = false;
    }
  }

  _pulseWave(duty) {
    const n = 32, real = new Float32Array(n), imag = new Float32Array(n);
    for (let i = 1; i < n; i++) { real[i] = (2 / (i * Math.PI)) * Math.sin(i * Math.PI * duty); }
    return this.ctx.createPeriodicWave(real, imag, { disableNormalization: false });
  }

  _buildGraph() {
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = 0.9; this.master.connect(c.destination);
    this.ch = {};
    for (const name of ['music', 'engine', 'sfx', 'ambient']) {
      const g = c.createGain(); g.connect(this.master); this.ch[name] = g;
    }
    this.ch.music.gain.value = 0.55;
    this.ch.engine.gain.value = 0.7;
    this.ch.sfx.gain.value = 0.9;
    this.ch.ambient.gain.value = 0.6;
    this.pulse25 = this._pulseWave(0.25);
    this.pulse12 = this._pulseWave(0.125);
    // noise buffer (2s)
    const len = c.sampleRate * 2;
    this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._buildEngine();
    this._buildContinuousSfx();
    this._buildAmbient();
  }

  // ---------- mute / pause ----------
  applyMute() {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(this.muted ? 0 : 0.9, t, 0.02);
    try { localStorage.setItem('monacogt.muted', this.muted ? '1' : '0'); } catch (e) { /* ignore */ }
  }
  toggleMute() { this.muted = !this.muted; this.applyMute(); return this.muted; }

  setPaused(p) {
    this.paused = p;
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    this.ch.music.gain.setTargetAtTime(p ? 0.12 : 0.55, t, 0.05);
    this.ch.engine.gain.setTargetAtTime(p ? 0 : 0.7, t, 0.05);
    this.ch.ambient.gain.setTargetAtTime(p ? 0 : 0.6, t, 0.05);
  }
  suspend() { if (this.ok && this.ctx.state === 'running') this.ctx.suspend().catch(() => {}); }
  resume() { if (this.ok && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); }

  // ---------- music sequencer ----------
  startMusic() {
    if (!this.ok || this.musicOn) return;
    this.musicOn = true;
    this._step = 0;
    this._nextTime = this.ctx.currentTime + 0.1;
    this._timer = setInterval(() => this._schedule(), 25);
  }
  stopMusic() {
    this.musicOn = false;
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  }
  _schedule() {
    if (!this.ok || !this.musicOn) return;
    const stepLen = 60 / SONG.bpm / 4;
    const total = SONG.bars * 16;
    while (this._nextTime < this.ctx.currentTime + 0.2) {
      this._playStep(this._step % total, this._nextTime, stepLen);
      this._nextTime += stepLen;
      this._step++;
    }
  }
  _playStep(step, t, stepLen) {
    const bar = Math.floor(step / 16), s = step % 16;
    const chord = CH[PROG[bar]];
    const root = chord[0], minor = chord[1] === 'm';
    const sectionB = bar >= 16;
    // --- lead ---
    const toks = LEAD[bar].split(/\s+/);
    const tok = toks[s];
    if (tok && tok !== '=' && tok !== '-') {
      let len = 1;
      for (let i = s + 1; i < 16 && toks[i] === '='; i++) len++;
      // ties across bar lines: peek the next bar's first token
      if (s + len === 16 && bar + 1 < SONG.bars) {
        const nt = LEAD[bar + 1].split(/\s+/);
        for (let i = 0; i < 16 && nt[i] === '='; i++) len++;
      }
      const midi = noteToMidi(tok);
      if (midi !== null) this._lead(midiToFreq(midi), t, len * stepLen);
    }
    // --- bass ---
    const bp = (sectionB ? BASS_B : BASS_A)[s];
    if (bp !== null) this._bass(midiToFreq(root + bp), t, stepLen * 0.9);
    // --- arp ---
    const ap = (sectionB ? ARP_B : ARP_A)[s];
    const tones = [0, minor ? 3 : 4, 7, 12];
    if (bar % 8 !== 7 || s < 12) this._arp(midiToFreq(root + 24 + tones[ap]), t, stepLen * 0.8);
    // --- drums ---
    const fill = (bar % 8 === 7);
    const pat = fill ? DRUM_FILL : (sectionB ? DRUM_B : DRUM_A);
    const d = pat[s];
    if (d === 'k') this._kick(t);
    else if (d === 's') this._snare(t);
    else if (d === 'h') this._hat(t, false);
    else if (d === 'o') this._hat(t, true);
    if (fill && s >= 8 && s % 2 === 0) this._snare(t, 0.6);
  }

  _lead(freq, t, dur) {
    const c = this.ctx;
    const o = c.createOscillator(); o.setPeriodicWave(this.pulse25);
    o.frequency.setValueAtTime(freq, t);
    if (dur > 0.25) { // vibrato on long notes
      const start = t + 0.12;
      for (let k = 0; k < Math.floor((dur - 0.12) / 0.08); k++) {
        o.frequency.linearRampToValueAtTime(freq * (k % 2 ? 1.006 : 0.994), start + k * 0.08);
      }
    }
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.16, t + 0.005);
    g.gain.linearRampToValueAtTime(0.11, t + 0.08);
    g.gain.setValueAtTime(0.11, t + dur - 0.02);
    g.gain.linearRampToValueAtTime(0, t + dur + 0.02);
    o.connect(g); g.connect(this.ch.music);
    o.start(t); o.stop(t + dur + 0.05);
  }
  _bass(freq, t, dur) {
    const c = this.ctx;
    const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = freq;
    const o2 = c.createOscillator(); o2.type = 'square'; o2.frequency.value = freq;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
    const g = c.createGain(), g2 = c.createGain();
    g.gain.setValueAtTime(0.3, t); g.gain.linearRampToValueAtTime(0.0, t + dur);
    g2.gain.setValueAtTime(0.11, t); g2.gain.linearRampToValueAtTime(0.0, t + dur * 0.7);
    o.connect(g); g.connect(this.ch.music);
    o2.connect(f); f.connect(g2); g2.connect(this.ch.music);
    o.start(t); o.stop(t + dur + 0.01); o2.start(t); o2.stop(t + dur + 0.01);
  }
  _arp(freq, t, dur) {
    const c = this.ctx;
    const o = c.createOscillator(); o.setPeriodicWave(this.pulse12); o.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(0.055, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.ch.music);
    o.start(t); o.stop(t + dur + 0.01);
  }
  _kick(t) {
    const c = this.ctx;
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.11);
    const g = c.createGain();
    g.gain.setValueAtTime(0.7, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    o.connect(g); g.connect(this.ch.music); o.start(t); o.stop(t + 0.18);
  }
  _snare(t, vol = 1) {
    const c = this.ctx;
    const n = c.createBufferSource(); n.buffer = this.noiseBuf; n.loop = true;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 0.7;
    const g = c.createGain();
    g.gain.setValueAtTime(0.32 * vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
    n.connect(f); f.connect(g); g.connect(this.ch.music); n.start(t); n.stop(t + 0.14);
    const o = c.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(110, t + 0.06);
    const g2 = c.createGain(); g2.gain.setValueAtTime(0.25 * vol, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    o.connect(g2); g2.connect(this.ch.music); o.start(t); o.stop(t + 0.08);
  }
  _hat(t, open) {
    const c = this.ctx;
    const n = c.createBufferSource(); n.buffer = this.noiseBuf; n.loop = true;
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7500;
    const g = c.createGain();
    const d = open ? 0.12 : 0.035;
    g.gain.setValueAtTime(open ? 0.1 : 0.08, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
    n.connect(f); f.connect(g); g.connect(this.ch.music); n.start(t); n.stop(t + d + 0.01);
  }

  // ---------- engine ----------
  _buildEngine() {
    const c = this.ctx;
    const e = this.eng = {};
    e.o1 = c.createOscillator(); e.o1.type = 'sawtooth';
    e.o2 = c.createOscillator(); e.o2.type = 'square';
    e.o3 = c.createOscillator(); e.o3.type = 'sawtooth'; e.o3.detune.value = 12;
    e.filter = c.createBiquadFilter(); e.filter.type = 'lowpass'; e.filter.frequency.value = 500; e.filter.Q.value = 2;
    e.g1 = c.createGain(); e.g1.gain.value = 0.5;
    e.g2 = c.createGain(); e.g2.gain.value = 0.35;
    e.g3 = c.createGain(); e.g3.gain.value = 0.25;
    e.gain = c.createGain(); e.gain.gain.value = 0;
    // tunnel echo
    e.delay = c.createDelay(0.5); e.delay.delayTime.value = 0.085;
    e.fb = c.createGain(); e.fb.gain.value = 0.5;
    e.wet = c.createGain(); e.wet.gain.value = 0;
    e.o1.connect(e.g1); e.o2.connect(e.g2); e.o3.connect(e.g3);
    e.g1.connect(e.filter); e.g2.connect(e.filter); e.g3.connect(e.filter);
    e.filter.connect(e.gain);
    e.gain.connect(this.ch.engine);
    e.gain.connect(e.delay); e.delay.connect(e.fb); e.fb.connect(e.delay); e.delay.connect(e.wet); e.wet.connect(this.ch.engine);
    // turbo whine
    e.turbo = c.createOscillator(); e.turbo.type = 'sine'; e.turbo.frequency.value = 900;
    e.turboG = c.createGain(); e.turboG.gain.value = 0;
    e.turbo.connect(e.turboG); e.turboG.connect(this.ch.engine);
    e.o1.start(); e.o2.start(); e.o3.start(); e.turbo.start();
  }
  // rpm 0..1, throttle 0..1, tunnel 0..1, turbo 0..1
  setEngine(rpm, throttle, tunnel, turbo, on) {
    if (!this.ok) return;
    const e = this.eng, t = this.ctx.currentTime;
    const f = 38 + rpm * 150 + turbo * 30;
    e.o1.frequency.setTargetAtTime(f, t, 0.03);
    e.o2.frequency.setTargetAtTime(f * 0.5, t, 0.03);
    e.o3.frequency.setTargetAtTime(f * 1.5, t, 0.03);
    e.filter.frequency.setTargetAtTime(280 + rpm * 1900 + throttle * 900, t, 0.05);
    const vol = on ? (0.10 + rpm * 0.18 + throttle * 0.08) * (1 + tunnel * 0.3) : 0;
    e.gain.gain.setTargetAtTime(vol, t, 0.05);
    e.wet.gain.setTargetAtTime(tunnel * 0.55, t, 0.1);
    e.turbo.frequency.setTargetAtTime(700 + rpm * 900 + turbo * 600, t, 0.05);
    e.turboG.gain.setTargetAtTime(turbo * 0.06, t, 0.05);
  }

  // ---------- continuous sfx (squeal, off-road rumble) ----------
  _buildContinuousSfx() {
    const c = this.ctx;
    const s = this.cont = {};
    s.sq = c.createBufferSource(); s.sq.buffer = this.noiseBuf; s.sq.loop = true;
    s.sqF = c.createBiquadFilter(); s.sqF.type = 'bandpass'; s.sqF.frequency.value = 1600; s.sqF.Q.value = 6;
    s.sqO = c.createOscillator(); s.sqO.type = 'sawtooth'; s.sqO.frequency.value = 1500;
    s.sqOG = c.createGain(); s.sqOG.gain.value = 0.25;
    s.sqG = c.createGain(); s.sqG.gain.value = 0;
    s.sq.connect(s.sqF); s.sqO.connect(s.sqOG); s.sqOG.connect(s.sqF); s.sqF.connect(s.sqG); s.sqG.connect(this.ch.sfx);
    s.sq.start(); s.sqO.start();
    s.rm = c.createBufferSource(); s.rm.buffer = this.noiseBuf; s.rm.loop = true;
    s.rmF = c.createBiquadFilter(); s.rmF.type = 'lowpass'; s.rmF.frequency.value = 220;
    s.rmG = c.createGain(); s.rmG.gain.value = 0;
    s.rm.connect(s.rmF); s.rmF.connect(s.rmG); s.rmG.connect(this.ch.sfx); s.rm.start();
  }
  setSqueal(level) {
    if (!this.ok) return;
    const t = this.ctx.currentTime, s = this.cont;
    s.sqG.gain.setTargetAtTime(level * 0.22, t, 0.04);
    s.sqF.frequency.setTargetAtTime(1300 + level * 700, t, 0.05);
    s.sqO.frequency.setTargetAtTime(1200 + level * 800 + Math.sin(t * 40) * 60, t, 0.05);
  }
  setOffroad(level) {
    if (!this.ok) return;
    this.cont.rmG.gain.setTargetAtTime(level * 0.5, this.ctx.currentTime, 0.05);
  }

  // ---------- one-shot sfx ----------
  _noiseHit(t, dur, freq, q, vol, type = 'bandpass') {
    const c = this.ctx;
    const n = c.createBufferSource(); n.buffer = this.noiseBuf; n.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    n.connect(f); f.connect(g); g.connect(this.ch.sfx); n.start(t); n.stop(t + dur + 0.02);
    return f;
  }
  _tone(t, freq, dur, vol, type = 'square', ch = 'sfx') {
    const c = this.ctx;
    const o = c.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.setValueAtTime(vol, t + dur - 0.02); g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g); g.connect(this.ch[ch]); o.start(t); o.stop(t + dur + 0.01);
    return o;
  }
  hit(strength = 1) {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    this._noiseHit(t, 0.25, 900, 0.8, 0.5 * strength);
    const o = this.ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(30, t + 0.2);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.6 * strength, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    o.connect(g); g.connect(this.ch.sfx); o.start(t); o.stop(t + 0.3);
  }
  scrape() {
    if (!this.ok) return;
    this._noiseHit(this.ctx.currentTime, 0.15, 2500, 1.5, 0.15, 'highpass');
  }
  turboWhoosh() {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    const f = this._noiseHit(t, 0.7, 400, 1.2, 0.35);
    f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(3500, t + 0.5);
    const o = this._tone(t, 300, 0.5, 0.12, 'sawtooth');
    o.frequency.exponentialRampToValueAtTime(1400, t + 0.5);
  }
  beep(final) {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    if (final) { this._tone(t, 880, 0.55, 0.25); this._tone(t, 1320, 0.55, 0.12); }
    else this._tone(t, 440, 0.18, 0.25);
  }
  blip() { if (this.ok) { const t = this.ctx.currentTime; this._tone(t, 660, 0.05, 0.2); this._tone(t + 0.05, 990, 0.06, 0.2); } }
  lapJingle() {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    [[0, 784], [0.09, 988], [0.18, 1175], [0.27, 1568]].forEach(([d, f]) => this._tone(t + d, f, 0.12, 0.2));
  }
  bestLapJingle() {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    [[0, 784], [0.08, 988], [0.16, 1175], [0.24, 1568], [0.36, 1175], [0.44, 1568], [0.52, 2093]].forEach(([d, f]) => this._tone(t + d, f, 0.11, 0.2));
  }
  finishFanfare(win) {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    const seq = win
      ? [[0, 523], [0.15, 659], [0.3, 784], [0.45, 1047], [0.75, 784], [0.9, 1047], [1.05, 1319], [1.5, 1568]]
      : [[0, 659], [0.2, 587], [0.4, 523], [0.7, 494], [1.0, 523]];
    seq.forEach(([d, f], i) => {
      const last = i === seq.length - 1;
      this._tone(t + d, f, last ? 0.9 : 0.16, 0.22);
      this._tone(t + d, f / 2, last ? 0.9 : 0.16, 0.12, 'triangle');
    });
  }

  // ---------- ambient ----------
  _buildAmbient() {
    const c = this.ctx;
    const a = this.amb = {};
    a.n = c.createBufferSource(); a.n.buffer = this.noiseBuf; a.n.loop = true;
    a.f = c.createBiquadFilter(); a.f.type = 'bandpass'; a.f.frequency.value = 700; a.f.Q.value = 0.5;
    a.g = c.createGain(); a.g.gain.value = 0;
    a.lfo = c.createOscillator(); a.lfo.type = 'sine'; a.lfo.frequency.value = 0.35;
    a.lfoG = c.createGain(); a.lfoG.gain.value = 0.25;
    a.mod = c.createGain(); a.mod.gain.value = 1;
    a.n.connect(a.f); a.f.connect(a.mod); a.mod.connect(a.g); a.g.connect(this.ch.ambient);
    a.lfo.connect(a.lfoG); a.lfoG.connect(a.mod.gain);
    a.n.start(); a.lfo.start();
    a.level = 0;
  }
  setCrowd(level) {
    if (!this.ok) return;
    this.amb.g.gain.setTargetAtTime(level * 0.12, this.ctx.currentTime, 0.4);
  }
  seagull() {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    for (let k = 0; k < 2; k++) {
      const o = this.ctx.createOscillator(); o.type = 'triangle';
      const st = t + k * 0.28;
      o.frequency.setValueAtTime(1900, st); o.frequency.linearRampToValueAtTime(2600, st + 0.08); o.frequency.linearRampToValueAtTime(1500, st + 0.22);
      const g = this.ctx.createGain(); g.gain.setValueAtTime(0, st); g.gain.linearRampToValueAtTime(0.07, st + 0.03); g.gain.linearRampToValueAtTime(0, st + 0.24);
      o.connect(g); g.connect(this.ch.ambient); o.start(st); o.stop(st + 0.26);
    }
  }
}
