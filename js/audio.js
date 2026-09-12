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

/* Radio stations. Each is a self-contained song for the 4-part sequencer:
     bpm, swing (0..0.3, delays the off 16ths), sectionB (bar where the B
     section starts: bass/arp/drum patterns switch there),
     chords: name -> [root midi (bass register), quality]
       quality: M major, m minor, m7, 7 (dominant), M7, p5 (power chord)
     prog:   chord name per bar
     lead:   16 tokens per bar. note = new note, '=' hold, '-' rest
     bass:   [A, B] 16-step patterns: number = semitone offset from the root,
             'r' root, '3' third, '5' fifth, '7' seventh/top, 'R' octave, null rest
     arp:    [A, B] 16-step patterns of chord-tone index 0..3 (null rest)
     drums:  [A, B, fill] 16-char strings: k kick, s snare, h hat, o open hat
     inst:   instrument tweaks (lead wave / vibrato / echo, bass type, arp wave,
             pump = side-chain style ducking on every kick) */
const CHORD_TONES = { M: [0, 4, 7, 12], m: [0, 3, 7, 12], m7: [0, 3, 7, 10], 7: [0, 4, 7, 10], M7: [0, 4, 7, 11], p5: [0, 7, 12, 7] };
function withLastBar(bars, last) { return bars.slice(0, bars.length - 1).concat([last]); }

// --- Riviera FM: breezy Latin / samba feel, F major ---
const RIV_A = [
  'A5 = = C6 = = A5 = F5 = = G5 = A5 = =',
  'G5 = = = E5 = G5 = C6 = = = = = - -',
  'F5 = = A5 = = F5 = D5 = = E5 = F5 = =',
  'D5 = = = F5 = D5 = Bb4 = = = = = - -',
  'A5 = = C6 = = A5 = F5 = = G5 = A5 = =',
  'G5 = = = E5 = C5 = E5 = G5 = C6 = = =',
  'D6 = = C6 = = Bb5 = A5 = = G5 = F5 = =',
  'G5 = = = = = = = E5 = G5 = Bb5 = C6 =',
];
const RIV_B = [
  'D6 = = = A5 = D6 = F6 = = = E6 = D6 =',
  'C6 = = = = = Bb5 = A5 = = = = = - -',
  'A5 = = = C6 = A5 = F5 = = = = = G5 =',
  'G5 = = = = = = = = = = = - - - -',
  'D6 = = = A5 = D6 = F6 = = = E6 = D6 =',
  'C6 = = = D6 = C6 = Bb5 = = = A5 = G5 =',
  'Bb5 = = = = = A5 = G5 = = = = = - -',
  'E5 = G5 = C6 = E6 = G6 = = = = = = =',
];
const RIV_PROG_A = ['F', 'C', 'Dm', 'Bb', 'F', 'C', 'Bb', 'C'];
const RIV_PROG_B = ['Dm', 'Bb', 'F', 'C', 'Dm', 'Bb', 'Gm', 'C'];

// --- Casino Nights: funky, syncopated synth-bass, minor 7ths, A minor ---
const CAS_A = [
  'A5 = = G5 = E5 = = - - C5 = D5 = E5 =',
  'F5 = = = D5 = F5 = A5 = = = - - - -',
  'A5 = = G5 = E5 = = - - C5 = D5 = E5 =',
  'D5 = C5 = A4 = = = = = = = - - - -',
  'C5 = = E5 = A5 = = - - A5 = C6 = A5 =',
  'B5 = = = G5 = = = F5 = D5 = B4 = = =',
  'C5 = = = E5 = = = A5 = = = = = = =',
  'G#5 = = = B5 = = = E5 = = = - - - -',
];
const CAS_B = [
  'D5 = F5 = A5 = = = C6 = = = A5 = = =',
  'B5 = = = G5 = = = D5 = = = F5 = = =',
  'E5 = G5 = B5 = = = C6 = = = B5 = = =',
  'A5 = = = F5 = = = C5 = = = E5 = = =',
  'D5 = F5 = A5 = = = C6 = = = D6 = = =',
  'B5 = = = G#5 = = = E5 = = = - - - -',
  'A5 = = = = = = = - - E5 = G5 = A5 =',
  'A5 = = = = = = = = = = = - - - -',
];
const CAS_PROG_A = ['Am7', 'Dm7', 'Am7', 'Dm7', 'FM7', 'G7', 'Am7', 'E7'];
const CAS_PROG_B = ['Dm7', 'G7', 'CM7', 'FM7', 'Dm7', 'E7', 'Am7', 'Am7'];

// --- Grand Prix Rock: driving 8ths, power-chord stabs, E minor ---
const ROCK_A = [
  'E5 = = = G5 = A5 = B5 = = = = = A5 =',
  'G5 = = = = = E5 = G5 = A5 = G5 = E5 =',
  'D5 = = = = = = = G5 = = = B5 = = =',
  'A5 = = = = = = = = = = = F#5 = G5 =',
  'E5 = = = G5 = A5 = B5 = = = = = D6 =',
  'C6 = = = = = B5 = G5 = = = E5 = = =',
  'F#5 = = = A5 = = = D5 = = = F#5 = = =',
  'A5 = = = = = = = B5 = = = = = = =',
];
const ROCK_B = [
  'E6 = = = D6 = C6 = B5 = = = = = = =',
  'D6 = = = = = = = F#5 = = = A5 = = =',
  'B5 = = = = = = = G5 = = = E5 = = =',
  'E5 = = = = = = = - - - - B4 = D5 =',
  'E5 = = = G5 = = = C6 = = = B5 = = =',
  'A5 = = = = = F#5 = D5 = = = F#5 = A5 =',
  'B5 = = = = = = = = = = = D#5 = F#5 =',
  'B5 = = = = = = = = = = = - - - -',
];
const ROCK_PROG_A = ['E5', 'C5', 'G5', 'D5', 'E5', 'C5', 'D5', 'D5'];
const ROCK_PROG_B = ['C5', 'D5', 'E5', 'E5', 'C5', 'D5', 'B5', 'B5'];

// --- Tunnel Vision: synthwave, long lead notes over 16th arpeggios, A minor ---
const TUN_A = [
  'E5 = = = = = = = = = = = = = = =',
  'C5 = = = = = = = D5 = = = E5 = = =',
  'F5 = = = = = = = = = = = = = = =',
  'A5 = = = = = = = G5 = = = F5 = = =',
  'E5 = = = = = = = = = = = = = = =',
  'G5 = = = = = = = E5 = = = C5 = = =',
  'D5 = = = = = = = = = = = = = = =',
  'B4 = = = = = = = D5 = = = E5 = = =',
];
const TUN_B = [
  'A5 = = = = = = = = = = = F5 = = =',
  'D5 = = = = = = = F5 = = = A5 = = =',
  'C6 = = = = = = = = = = = A5 = = =',
  'F5 = = = = = = = = = = = G5 = = =',
  'E5 = = = = = = = = = = = = = = =',
  'C5 = = = E5 = = = A5 = = = = = = =',
  'G#5 = = = = = = = = = = = B5 = = =',
  'E5 = = = = = = = = = = = - - - -',
];
const TUN_PROG_A = ['Am', 'Am', 'F', 'F', 'C', 'C', 'G', 'G'];
const TUN_PROG_B = ['Dm', 'Dm', 'F', 'F', 'Am', 'Am', 'E', 'E'];

const STATIONS = [
  {
    id: 'riviera', name: 'RIVIERA FM', freq: '98.3', bpm: 132, swing: 0, bars: 32, sectionB: 16,
    chords: { F: [41, 'M'], C: [48, 'M'], Dm: [50, 'm'], Bb: [46, 'M'], Gm: [43, 'm'] },
    prog: RIV_PROG_A.concat(RIV_PROG_A, RIV_PROG_B, RIV_PROG_B),
    lead: RIV_A.concat(withLastBar(RIV_A, 'G5 = = = = = = = C6 = Bb5 = A5 = G5 ='), RIV_B, withLastBar(RIV_B, 'E6 = = = D6 = C6 = G5 = = = = = = =')),
    bass: [[0, null, 12, null, 0, null, null, 12, null, 0, null, 7, null, 12, null, null],
           [0, null, 0, null, 12, null, 0, null, 7, null, 7, null, 12, null, 0, 12]],
    arp: [[0, 2, 3, 2, 0, 2, 3, 2, 0, 2, 3, 2, 1, 2, 3, 2],
          [3, 2, 1, 2, 3, 2, 1, 2, 3, 2, 1, 2, 3, 1, 3, 2]],
    drums: ['khhoshkhkhhoshkh', 'khhoshkhkhhoshko', 'khhhshsskhkhssss'],
    inst: { lead: { wave: 'pulse25', vol: 0.16, vib: 0.006 }, bass: { type: 'classic' }, arp: { wave: 'pulse12', vol: 0.055 }, pump: false },
  },
  {
    id: 'casino', name: 'CASINO NIGHTS', freq: '104.7', bpm: 112, swing: 0.16, bars: 32, sectionB: 16,
    chords: { Am7: [45, 'm7'], Dm7: [50, 'm7'], FM7: [41, 'M7'], G7: [43, '7'], E7: [40, '7'], CM7: [48, 'M7'] },
    prog: CAS_PROG_A.concat(CAS_PROG_A, CAS_PROG_B, CAS_PROG_B),
    lead: CAS_A.concat(withLastBar(CAS_A, 'G#5 = = = B5 = = = E5 = G#5 = B5 = E6 ='), CAS_B, withLastBar(CAS_B, 'A5 = = = = = = = C6 = = = E6 = = =')),
    bass: [['r', null, null, 'r', null, 'R', null, 'r', null, null, '7', null, 'R', null, '7', '5'],
           ['r', null, 'r', null, '5', null, '7', null, 'R', null, null, '7', null, '5', null, '3']],
    arp: [[null, null, 0, null, null, null, 2, null, null, null, 3, null, null, 1, null, 2],
          [0, null, 2, null, 3, null, 2, null, 0, null, 2, null, 3, null, 1, null]],
    drums: ['khhhshhkhhkhshhh', 'khhoshhkkhhhshho', 'khhhshsskhkhssss'],
    inst: { lead: { wave: 'pulse12', vol: 0.15, vib: 0.004 }, bass: { type: 'funk' }, arp: { wave: 'square', vol: 0.05, decay: 0.5 }, pump: false },
  },
  {
    id: 'rock', name: 'GRAND PRIX ROCK', freq: '89.1', bpm: 168, swing: 0, bars: 32, sectionB: 16,
    chords: { E5: [40, 'p5'], C5: [36, 'p5'], G5: [43, 'p5'], D5: [38, 'p5'], A5: [45, 'p5'], B5: [47, 'p5'] },
    prog: ROCK_PROG_A.concat(ROCK_PROG_A, ROCK_PROG_B, ROCK_PROG_B),
    lead: ROCK_A.concat(withLastBar(ROCK_A, 'A5 = = = B5 = = = D6 = = = E6 = = ='), ROCK_B, withLastBar(ROCK_B, 'B5 = = = = = = = D6 = E6 = F#6 = = =')),
    bass: [[0, null, 0, null, 0, null, 0, null, 0, null, 0, null, 0, null, 12, null],
           [0, null, 0, null, 7, null, 0, null, 0, null, 0, null, 12, null, 7, null]],
    arp: [[0, null, null, 0, null, null, 0, null, null, 0, null, null, 0, null, null, null],
          [0, null, 0, null, 0, null, null, 0, null, null, 0, null, 0, null, null, null]],
    drums: ['k.h.s.h.k.k.s.h.', 'k.h.s.hkk.h.s.o.', 'k.h.s.s.k.s.ssss'],
    inst: { lead: { wave: 'square', vol: 0.13, vib: 0.008 }, bass: { type: 'rock' }, arp: { wave: 'stab', vol: 0.07 }, pump: false },
  },
  {
    id: 'tunnel', name: 'TUNNEL VISION', freq: '110.5', bpm: 140, swing: 0, bars: 32, sectionB: 16,
    chords: { Am: [45, 'm'], F: [41, 'M'], C: [48, 'M'], G: [43, 'M'], Dm: [50, 'm'], E: [40, 'M'] },
    prog: TUN_PROG_A.concat(TUN_PROG_A, TUN_PROG_B, TUN_PROG_B),
    lead: TUN_A.concat(withLastBar(TUN_A, 'B4 = = = = = = = D5 = = = G5 = = ='), TUN_B, withLastBar(TUN_B, 'E5 = = = = = = = = = = = = = = =')),
    bass: [[0, 12, 0, 12, 0, 12, 0, 12, 0, 12, 0, 12, 0, 12, 0, 12],
           [0, 12, 0, 12, 0, 12, 0, 12, 0, 12, 0, 12, 7, 12, 7, 12]],
    arp: [[0, 2, 3, 2, 0, 2, 3, 2, 1, 2, 3, 2, 1, 2, 3, 2],
          [3, 2, 1, 0, 3, 2, 1, 0, 3, 2, 1, 0, 3, 1, 2, 0]],
    drums: ['khhhshhhkhhhshhh', 'khhhshhokhhhshho', 'khhhshhhkhhhssss'],
    inst: { lead: { wave: 'saw', vol: 0.09, vib: 0.007, echo: true }, bass: { type: 'saw' }, arp: { wave: 'pulse25', vol: 0.05 }, pump: true },
  },
];
const STATION_OFF = STATIONS.length;

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ok = false;
    this.muted = false;
    this.paused = false;
    this.musicOn = false;
    this.pulse25 = null; this.pulse12 = null;
    this.noiseBuf = null;
    this._step = 0; this._nextTime = 0; this._timer = null; this._startTime = 0;
    this.seq = null;            // compiled song for the current station
    this.station = 0;           // index into STATIONS, STATION_OFF = radio off
    this.musicVol = 0.55;
    this.engineState = { rpm: 0, throttle: 0, tunnel: 0, on: false };
    try {
      this.muted = localStorage.getItem('monacogt.muted') === '1';
      const s = parseInt(localStorage.getItem('monacogt.station'), 10);
      if (s >= 0 && s <= STATION_OFF) this.station = s;
    } catch (e) { /* ignore */ }
  }

  // ---------- radio ----------
  get stationCount() { return STATIONS.length + 1; }
  stationInfo(i) {
    const idx = i === undefined ? this.station : i;
    if (idx >= STATION_OFF || idx < 0) return { id: 'off', name: 'RADIO OFF', freq: '---.-', off: true };
    return STATIONS[idx];
  }
  // 0..1 position within the current beat (drives the tuner's EQ animation)
  beatPhase() {
    if (!this.ok || !this.musicOn || !this.seq) return 0;
    const b = (this.ctx.currentTime - this._startTime) * this.seq.bpm / 60;
    return b - Math.floor(b);
  }
  // Switch station. Restarts the sequencer on the new song; a burst of static covers the seam.
  setStation(i, quiet) {
    const n = STATION_OFF + 1;
    i = ((i % n) + n) % n;
    if (i === this.station && (this.musicOn || i === STATION_OFF)) return;
    this.station = i;
    try { localStorage.setItem('monacogt.station', String(i)); } catch (e) { /* ignore */ }
    if (!this.ok) return;
    const wasOn = this.musicOn;
    this.stopMusic();
    if (!quiet && (wasOn || i !== STATION_OFF)) this.radioStatic();
    if (i !== STATION_OFF) this.startMusic(quiet ? 0.05 : 0.22);
  }
  nextStation() { this.setStation(this.station + 1); return this.station; }
  prevStation() { this.setStation(this.station - 1); return this.station; }

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
    this.ch.music.gain.value = this.musicVol;
    this.ch.engine.gain.value = 0.7;
    this.ch.sfx.gain.value = 0.9;
    this.ch.ambient.gain.value = 0.6;
    // music bus: instruments -> bus (side-chain pump lives here) -> music channel;
    // the kick bypasses the bus so it stays punchy while everything else ducks
    this.bus = c.createGain(); this.bus.gain.value = 1; this.bus.connect(this.ch.music);
    this.echo = c.createDelay(1.0); this.echo.delayTime.value = 0.3;
    this.echoFb = c.createGain(); this.echoFb.gain.value = 0.32;
    this.echoIn = c.createGain(); this.echoIn.gain.value = 0.45;
    this.echoIn.connect(this.echo); this.echo.connect(this.echoFb); this.echoFb.connect(this.echo); this.echo.connect(this.bus);
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
    this.ch.music.gain.setTargetAtTime(p ? 0.12 : this.musicVol, t, 0.05);
    this.ch.engine.gain.setTargetAtTime(p ? 0 : 0.7, t, 0.05);
    this.ch.ambient.gain.setTargetAtTime(p ? 0 : 0.6, t, 0.05);
  }
  suspend() { if (this.ok && this.ctx.state === 'running') this.ctx.suspend().catch(() => {}); }
  resume() { if (this.ok && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); }

  // ---------- music sequencer ----------
  startMusic(delay = 0.1) {
    if (!this.ok || this.musicOn || this.station === STATION_OFF) return;
    this.seq = this._compile(STATIONS[this.station]);
    this.musicOn = true;
    this._step = 0;
    this._startTime = this._nextTime = this.ctx.currentTime + delay;
    this.echo.delayTime.setValueAtTime(60 / this.seq.bpm * 0.75, this.ctx.currentTime);
    this.bus.gain.cancelScheduledValues(this.ctx.currentTime);
    this.bus.gain.setValueAtTime(1, this.ctx.currentTime);
    this._timer = setInterval(() => this._schedule(), 25);
  }
  stopMusic() {
    this.musicOn = false;
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  }
  // Pre-render a station into flat per-step arrays so the scheduler does no
  // string work: lead {freq,len} per step, bass/arp frequencies, drum chars.
  _compile(song) {
    const bars = song.bars, steps = bars * 16;
    const lead = new Array(steps).fill(null);
    const bass = new Float32Array(steps), arp = new Float32Array(steps), arpRoot = new Float32Array(steps);
    let drums = '';
    const toks = [];
    for (let b = 0; b < bars; b++) {
      const t = song.lead[b % song.lead.length].trim().split(/\s+/);
      for (let s = 0; s < 16; s++) toks.push(t[s] || '-');
    }
    for (let i = 0; i < steps; i++) {
      const tok = toks[i];
      if (tok === '=' || tok === '-') continue;
      const midi = noteToMidi(tok);
      if (midi === null) continue;
      let len = 1;
      for (let j = i + 1; j < steps && toks[j] === '='; j++) len++;
      lead[i] = { freq: midiToFreq(midi), len };
    }
    for (let b = 0; b < bars; b++) {
      const ch = song.chords[song.prog[b % song.prog.length]];
      const root = ch[0], tones = CHORD_TONES[ch[1]] || CHORD_TONES.M;
      const sectionB = b >= song.sectionB;
      const bp = song.bass[sectionB ? 1 : 0], ap = song.arp[sectionB ? 1 : 0];
      const fill = (b % 8 === 7);
      const dp = fill ? song.drums[2] : song.drums[sectionB ? 1 : 0];
      for (let s = 0; s < 16; s++) {
        const i = b * 16 + s;
        const bv = bp[s];
        if (bv !== null && bv !== undefined) {
          let off;
          if (typeof bv === 'number') off = bv;
          else off = bv === 'r' ? 0 : bv === '3' ? tones[1] : bv === '5' ? tones[2] : bv === '7' ? tones[3] : 12;
          bass[i] = midiToFreq(root + off);
        }
        const av = ap[s];
        // the arp drops out for the last beat of the phrase (the drum fill)
        if (av !== null && av !== undefined && !(fill && s >= 12)) {
          arp[i] = midiToFreq(root + 24 + tones[av]);
          arpRoot[i] = midiToFreq(root + 12);
        }
        drums += dp[s] || '.';
      }
    }
    return { bpm: song.bpm, swing: song.swing || 0, steps, lead, bass, arp, arpRoot, drums, inst: song.inst };
  }
  _schedule() {
    if (!this.ok || !this.musicOn || !this.seq) return;
    const seq = this.seq, stepLen = 60 / seq.bpm / 4;
    while (this._nextTime < this.ctx.currentTime + 0.2) {
      const step = this._step % seq.steps;
      const t = this._nextTime + ((step & 1) ? seq.swing * stepLen : 0);
      this._playStep(step, t, stepLen);
      this._nextTime += stepLen;
      this._step++;
    }
  }
  _playStep(step, t, stepLen) {
    const seq = this.seq, inst = seq.inst;
    const ln = seq.lead[step];
    if (ln) this._lead(ln.freq, t, ln.len * stepLen, inst.lead);
    if (seq.bass[step] > 0) this._bass(seq.bass[step], t, stepLen * (inst.bass.type === 'saw' ? 0.6 : 0.9), inst.bass.type);
    if (seq.arp[step] > 0) this._arp(seq.arp[step], t, stepLen * 0.8, inst.arp, seq.arpRoot[step]);
    const d = seq.drums[step];
    if (d === 'k') { this._kick(t); if (inst.pump) this._pump(t, stepLen * 4); }
    else if (d === 's') this._snare(t, 1, inst.pump ? 0.22 : 0.13);
    else if (d === 'h') this._hat(t, false);
    else if (d === 'o') this._hat(t, true);
    const fill = ((step >> 4) % 8 === 7), s = step & 15;
    if (fill && s >= 8 && s % 2 === 0) this._snare(t, 0.6);
  }
  // side-chain style ducking of the music bus on the kick
  _pump(t, beat) {
    const g = this.bus.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(1, t);
    g.linearRampToValueAtTime(0.4, t + 0.02);
    g.linearRampToValueAtTime(1, t + beat * 0.7);
  }
  // one-shot burst of static + a tuning sweep, used when changing station
  radioStatic() {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    const f = this._noiseHit(t, 0.28, 2200, 0.6, 0.28);
    f.frequency.setValueAtTime(600, t); f.frequency.exponentialRampToValueAtTime(5000, t + 0.25);
    const o = this._tone(t, 1200, 0.16, 0.05, 'sine');
    o.frequency.exponentialRampToValueAtTime(2400, t + 0.15);
    this._tone(t + 0.2, 1760, 0.05, 0.08, 'square');
  }

  _leadWave(o, wave) {
    if (wave === 'pulse25') o.setPeriodicWave(this.pulse25);
    else if (wave === 'pulse12') o.setPeriodicWave(this.pulse12);
    else if (wave === 'saw') o.type = 'sawtooth';
    else if (wave === 'tri') o.type = 'triangle';
    else o.type = 'square';
  }
  _lead(freq, t, dur, p) {
    const c = this.ctx;
    const o = c.createOscillator(); this._leadWave(o, p.wave);
    o.frequency.setValueAtTime(freq, t);
    const vib = p.vib || 0;
    if (vib > 0 && dur > 0.25) { // vibrato on long notes
      const start = t + 0.12, n = Math.min(40, Math.floor((dur - 0.12) / 0.08));
      for (let k = 0; k < n; k++) o.frequency.linearRampToValueAtTime(freq * (k % 2 ? 1 + vib : 1 - vib), start + k * 0.08);
    }
    const vol = p.vol || 0.15;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.005);
    g.gain.linearRampToValueAtTime(vol * 0.7, t + 0.08);
    g.gain.setValueAtTime(vol * 0.7, t + dur - 0.02);
    g.gain.linearRampToValueAtTime(0, t + dur + 0.02);
    o.connect(g); g.connect(this.bus);
    if (p.echo) g.connect(this.echoIn);
    o.start(t); o.stop(t + dur + 0.05);
  }
  _bass(freq, t, dur, type) {
    const c = this.ctx;
    if (type === 'funk') {
      // punchy square with a filter pluck
      const o = c.createOscillator(); o.type = 'square'; o.frequency.value = freq;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 6;
      f.frequency.setValueAtTime(1400, t); f.frequency.exponentialRampToValueAtTime(220, t + 0.12);
      const g = c.createGain(); g.gain.setValueAtTime(0.28, t); g.gain.exponentialRampToValueAtTime(0.01, t + dur);
      o.connect(f); f.connect(g); g.connect(this.bus); o.start(t); o.stop(t + dur + 0.01);
      return;
    }
    if (type === 'saw') {
      // synthwave: detuned saws through a lowpass, short and even
      const g = c.createGain(); g.gain.setValueAtTime(0.2, t); g.gain.exponentialRampToValueAtTime(0.01, t + dur);
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900; f.Q.value = 3;
      f.connect(g); g.connect(this.bus);
      for (const det of [-7, 7]) {
        const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq; o.detune.value = det;
        o.connect(f); o.start(t); o.stop(t + dur + 0.01);
      }
      return;
    }
    if (type === 'rock') {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 600;
      const g = c.createGain(); g.gain.setValueAtTime(0.3, t); g.gain.setValueAtTime(0.3, t + dur * 0.6); g.gain.linearRampToValueAtTime(0, t + dur);
      o.connect(f); f.connect(g); g.connect(this.bus); o.start(t); o.stop(t + dur + 0.01);
      return;
    }
    // classic: triangle + filtered square
    const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = freq;
    const o2 = c.createOscillator(); o2.type = 'square'; o2.frequency.value = freq;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
    const g = c.createGain(), g2 = c.createGain();
    g.gain.setValueAtTime(0.3, t); g.gain.linearRampToValueAtTime(0.0, t + dur);
    g2.gain.setValueAtTime(0.11, t); g2.gain.linearRampToValueAtTime(0.0, t + dur * 0.7);
    o.connect(g); g.connect(this.bus);
    o2.connect(f); f.connect(g2); g2.connect(this.bus);
    o.start(t); o.stop(t + dur + 0.01); o2.start(t); o2.stop(t + dur + 0.01);
  }
  _arp(freq, t, dur, p, rootFreq) {
    const c = this.ctx;
    const vol = p.vol || 0.05;
    if (p.wave === 'stab') {
      // power-chord stab: root + fifth + octave, detuned saws, fast decay
      const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur * 1.2);
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2400;
      f.connect(g); g.connect(this.bus);
      const base = rootFreq || freq;
      [[1, -6], [1.5, 5], [2, 0]].forEach(([m, det]) => {
        const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = base * m; o.detune.value = det;
        o.connect(f); o.start(t); o.stop(t + dur * 1.2 + 0.01);
      });
      return;
    }
    const o = c.createOscillator(); this._leadWave(o, p.wave || 'pulse12'); o.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur * (p.decay || 1));
    o.connect(g); g.connect(this.bus);
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
  _snare(t, vol = 1, decay = 0.13) {
    const c = this.ctx;
    const n = c.createBufferSource(); n.buffer = this.noiseBuf; n.loop = true;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 0.7;
    const g = c.createGain();
    g.gain.setValueAtTime(0.32 * vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + decay);
    n.connect(f); f.connect(g); g.connect(this.bus); n.start(t); n.stop(t + decay + 0.01);
    const o = c.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(110, t + 0.06);
    const g2 = c.createGain(); g2.gain.setValueAtTime(0.25 * vol, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    o.connect(g2); g2.connect(this.bus); o.start(t); o.stop(t + 0.08);
  }
  _hat(t, open) {
    const c = this.ctx;
    const n = c.createBufferSource(); n.buffer = this.noiseBuf; n.loop = true;
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7500;
    const g = c.createGain();
    const d = open ? 0.12 : 0.035;
    g.gain.setValueAtTime(open ? 0.1 : 0.08, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
    n.connect(f); f.connect(g); g.connect(this.bus); n.start(t); n.stop(t + d + 0.01);
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
