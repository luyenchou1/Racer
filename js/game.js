'use strict';
/* Monaco GT - game logic: state machine, physics, AI, lap timing, HUD/menus. */

const MAX_SPEED = 12000;          // world units / s (one segment per frame at 60 fps)
const TURBO_MULT = 1.22;
const CAR_HW = 0.17;              // car half width in road half-widths
const AI_COLOURS = ['blue', 'yellow', 'green', 'white', 'purple', 'orange'];
const GEARS = [0, 0.13, 0.27, 0.43, 0.61, 0.80];

// ----- handling model (tune here) -----
const GRIP_K = 0.065;             // grip speed = 1 - GRIP_K * |curve|  (hairpin 9 -> 0.415, Ste Devote 5 -> 0.675, Casino 2 -> 0.87)
const GRIP_MIN = 0.35;
const GRIP_LOOKAHEAD = 20;        // segments: the grip limit is announced this far ahead so braking is predictable
const CURVE_PUSH = 0.5;           // outward push per unit curve at full speed (below the grip limit)
const UNDERSTEER_PUSH = 3.0;      // extra push per unit of excess speed (linear)...
const UNDERSTEER_PUSH2 = 6.0;     // ...and squared: entering far too hot washes the car right out
const UNDERSTEER_STEER_LOSS = 1.5; // steering authority lost per unit of excess (floor 0.35)
const UNDERSTEER_SCRUB = 3000;    // speed scrubbed per second per unit of excess
const DRIFT_MIN_SPEED = 0.55;     // speedPct needed to start a drift
const DRIFT_MIN_STEER = 0.5;      // steer needed (with brake) to start a drift
const DRIFT_END_SPEED = 0.3;      // drift collapses below this
const DRIFT_LAT = 0.85;           // steer authority while drifting (the yaw itself carries the car inward, see DRIFT_YAW_PULL)
const DRIFT_YAW_PULL = 0.5;       // road half-widths per second the fully yawed car walks toward the inside
const DRIFT_CURVE_RELIEF = 0.55;  // curve push multiplier while drifting (grip penalty suspended)
const DRIFT_SCRUB = 2600;         // speed scrubbed per second while drifting, x (0.5 + speedPct): with gas held a drift settles at ~65%
const DRIFT_REWARD_MIN = 0.6;     // seconds of clean drift before turbo is awarded
const DRIFT_REWARD_RATE = 0.22;   // turbo per second of drift...
const DRIFT_REWARD_MAX = 0.5;     // ...capped
const AI_GRIP_BONUS = 0.10;       // AI may carry this much more speed than the player's grip limit
const AI_LOOKAHEAD = 16;          // extra segments the AI looks ahead (they brake more gently)

function fmtTime(t) {
  if (t === null || t === undefined || !isFinite(t)) return '-:--.--';
  const m = Math.floor(t / 60), s = Math.floor(t % 60), c = Math.floor((t * 100) % 100);
  return m + ':' + (s < 10 ? '0' : '') + s + '.' + (c < 10 ? '0' : '') + c;
}
function ordinal(n) { return n + (n === 1 ? 'ST' : n === 2 ? 'ND' : n === 3 ? 'RD' : 'TH'); }
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function vibrate(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* ignore */ } }

class Game {
  constructor(renderer, audio, input) {
    this.renderer = renderer;
    this.audio = audio;
    this.input = input;
    this.trackDef = TRACKS.monaco;
    this.track = new Track(this.trackDef);
    this.laps = this.trackDef.laps;
    this.state = 'title';
    this.playerColour = 'red';
    this.crt = true;
    this.best = null;
    try {
      const b = localStorage.getItem('monacogt.best.' + this.trackDef.id);
      if (b) this.best = parseFloat(b);
      const c = localStorage.getItem('monacogt.crt');
      if (c !== null) this.crt = c === '1';
    } catch (e) { /* ignore */ }
    document.getElementById('crt').classList.toggle('on', this.crt);
    this.input.setMuteIcon(this.audio.muted);
    this.input.setRadioIcon(this.audio.stationInfo().off);
    this.menuRects = [];
    this.tunerRects = [];
    this.buildGrip();
    this.time = 0;
    this.messages = [];
    this.cameraY = 0;
    this.tunnelFactor = 0;
    this.gearSmooth = 0;
    this.sectionCrowd = this.track.sectionStarts.map((s, i) => {
      const sec = this.trackDef.sections[i];
      return (sec.scenery || []).some(r => /grandstand|pool/.test(r.sprite)) ? 1 : 0;
    });
    this.resetRace(true);
  }

  // Grip speed per segment: the tightest curve in the next GRIP_LOOKAHEAD
  // segments sets the limit, so the limit drops before the corner arrives.
  buildGrip() {
    const segs = this.track.segments, N = segs.length;
    this.gripAt = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      let c = 0;
      for (let k = 0; k < GRIP_LOOKAHEAD; k++) c = Math.max(c, Math.abs(segs[(i + k) % N].curve));
      this.gripAt[i] = clamp(1 - GRIP_K * c, GRIP_MIN, 1);
    }
  }

  // ---------- setup ----------
  resetRace(attract) {
    this.attract = !!attract;
    this.position = 6 * SEG_LENGTH;
    this.playerX = 0;
    this.speed = attract ? MAX_SPEED * 0.6 : 0;
    this.lap = 1;
    this.lapStart = 0;
    this.raceTime = 0;
    this.lapTimes = [];
    this.turbo = 1;
    this.turboActive = false;
    this.steerDir = 0;
    this.braking = false;
    this.drifting = false;
    this.driftDir = 0; this.driftAngle = 0; this.driftYaw = 0; this.driftTime = 0; this.driftClean = true; this.driftCooldown = 0;
    this.understeer = 0; this.understeerSide = 0; this.gripPct = 1;
    this.offroad = false;
    this.bounce = 0;
    this.finishRank = 0;
    this.finishTimer = 0;
    this.newBest = false;
    this.countdown = 0;
    this.messages.length = 0;
    this.lastSection = -1;
    this.throttleSmooth = 0;
    this.showPlayer = true;
    this.speedPct = 0;
    this.seagullTimer = 4;
    // AI grid
    this.cars = [];
    for (const seg of this.track.segments) seg.cars.length = 0;
    for (let i = 0; i < AI_COLOURS.length; i++) {
      const car = {
        colour: AI_COLOURS[i],
        z: (9 + i * 3) * SEG_LENGTH,
        x: (i % 2 === 0) ? -0.45 : 0.45,
        lane: (i % 2 === 0) ? -0.4 : 0.4,
        speed: attract ? MAX_SPEED * 0.55 : 0,
        maxSpeed: MAX_SPEED * (0.86 + (i % 3) * 0.03 + (i >= 4 ? 0.02 : 0)),
        percent: 0, steerDir: 0, targetX: 0, lap: 1, laneTimer: 3 + i, seg: null, dist: 0,
      };
      this.cars.push(car);
    }
    if (attract) this.position = 40 * SEG_LENGTH; // start rolling mid-straight
    this.placeCars();
  }

  startRace() {
    this.resetRace(false);
    this.state = 'countdown';
    this.countdown = 2.999;
    this.lastBeep = 4;
    this.input.showControls(true);
    this.audio.blip();
  }

  // ---------- input events ----------
  userGesture() {
    this.audio.unlock();
    if (this.audio.ok && !this.audio.musicOn) this.audio.startMusic();
  }
  nextStation() { this.setStation(this.audio.station + 1); }
  prevStation() { this.setStation(this.audio.station - 1); }
  setStation(i) {
    this.audio.unlock();
    this.audio.setStation(i);
    const st = this.audio.stationInfo();
    this.input.setRadioIcon(!!st.off);
    if (this.state !== 'title') this.message(st.off ? 'RADIO OFF' : st.name, 1.6, PAL.CYAN, 'radio');
    else if (!this.audio.ok) this.audio.blip();
  }
  onTap(x, y) {
    this.userGesture();
    if (this.state === 'title') {
      for (const r of this.tunerRects) {
        if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) { r.action(); return; }
      }
      this.startRace(); return;
    }
    if (this.state === 'finished' && this.finishTimer > 1.2) { this.audio.blip(); this.toTitle(); return; }
    if (this.state === 'paused') {
      for (const r of this.menuRects) {
        if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) { this.audio.blip(); r.action(); return; }
      }
    }
  }
  onConfirm() {
    if (this.state === 'title') this.startRace();
    else if (this.state === 'finished' && this.finishTimer > 1.2) this.toTitle();
    else if (this.state === 'paused') this.resumeRace();
  }
  onPause() {
    if (this.state === 'racing' || this.state === 'countdown') this.pauseRace();
    else if (this.state === 'paused') this.resumeRace();
  }
  pauseRace() {
    if (this.state !== 'racing' && this.state !== 'countdown') return;
    this.stateBeforePause = this.state;
    this.state = 'paused';
    this.audio.setPaused(true);
    this.audio.setSqueal(0); this.audio.setOffroad(0);
    this.audio.blip();
    this.input.showPads(false); // the menu sits where the overlay pads are in landscape
    this.input.reset();
  }
  resumeRace() {
    if (this.state !== 'paused') return;
    this.state = this.stateBeforePause || 'racing';
    this.audio.setPaused(false);
    this.input.showPads(true);
  }
  toTitle() {
    this.state = 'title';
    this.input.showControls(false);
    this.audio.setPaused(false);
    this.audio.setSqueal(0); this.audio.setOffroad(0);
    this.resetRace(true);
  }
  toggleMute() { const m = this.audio.toggleMute(); this.input.setMuteIcon(m); }
  toggleCrt() {
    this.crt = !this.crt;
    document.getElementById('crt').classList.toggle('on', this.crt);
    try { localStorage.setItem('monacogt.crt', this.crt ? '1' : '0'); } catch (e) { /* ignore */ }
  }
  onHidden() { if (this.state === 'racing' || this.state === 'countdown') this.pauseRace(); this.audio.suspend(); }
  onVisible() { this.audio.resume(); }

  message(text, dur, color, kind) {
    if (kind) for (let i = this.messages.length - 1; i >= 0; i--) if (this.messages[i].kind === kind) this.messages.splice(i, 1);
    if (this.messages.length >= 3) this.messages.shift();
    this.messages.push({ text, t: dur, dur, color: color || PAL.YELLOW, kind });
  }

  // ---------- update ----------
  update(dt) {
    this.time += dt;
    const st = this.state;
    if (st === 'paused') return;
    if (st === 'countdown') {
      this.countdown -= dt;
      const n = Math.ceil(this.countdown);
      if (n < this.lastBeep) { this.lastBeep = n; this.audio.beep(n === 0); if (n === 0) vibrate(60); }
      if (this.countdown <= 0) { this.state = 'racing'; this.message('GO!', 0.8, PAL.GREEN); }
      // let the player rev the engine on the grid
      this.updateEngineAudio(dt, this.input.gas ? 0.75 : 0.12);
      this.placeCars();
      return;
    }
    const racing = st === 'racing';
    const inp = this.input;
    const track = this.track, N = track.segments.length;
    const playerSeg = track.findSegment(this.position + this.renderer.playerZ);
    const maxSpeed = this.turboActive ? MAX_SPEED * TURBO_MULT : MAX_SPEED;
    const speedPct = this.speed / MAX_SPEED;
    this.speedPct = speedPct;

    // ----- controls (autopilot in attract / after finish) -----
    let steer, gas, brake, wantTurbo;
    if (racing) { steer = inp.steer; gas = inp.gas; brake = inp.brake; wantTurbo = inp.turbo; }
    else {
      const ai = this.autopilot(playerSeg, speedPct);
      steer = ai.steer; gas = ai.gas; brake = ai.brake; wantTurbo = false;
    }
    this.braking = brake && this.speed > 0;
    this.steerDir = steer > 0.25 ? 1 : (steer < -0.25 ? -1 : 0);

    // ----- turbo -----
    if (wantTurbo && this.turbo > 0 && (this.turboActive || this.turbo > 0.12) && this.speed > MAX_SPEED * 0.2) {
      if (!this.turboActive) { this.turboActive = true; this.audio.turboWhoosh(); vibrate(30); }
      this.turbo = Math.max(0, this.turbo - dt * 0.42);
      if (this.turbo <= 0) this.turboActive = false;
    } else {
      this.turboActive = false;
      // slipstream refills faster
      const draft = this.cars.some(c => { const d = (c.z - this.position - this.renderer.playerZ); return d > 0 && d < 14 * SEG_LENGTH && Math.abs(c.x - this.playerX) < 0.35; });
      this.turbo = Math.min(1, this.turbo + dt * (0.045 + (draft ? 0.14 : 0)));
    }
    inp.setTurboEmpty(this.turbo < 0.12 && !this.turboActive);

    // ----- longitudinal -----
    const offroad = Math.abs(this.playerX) > 1.02;
    this.offroad = offroad && this.speed > MAX_SPEED * 0.1;
    if (gas) {
      const accel = (this.turboActive ? 7200 : 4300) * (1 - speedPct * 0.45);
      this.speed += accel * dt;
    } else if (brake) this.speed -= 7500 * dt;
    else this.speed -= 1300 * dt;
    if (offroad && this.speed > MAX_SPEED * 0.4) this.speed -= 6500 * dt;
    this.speed = clamp(this.speed, 0, maxSpeed);
    if (!this.turboActive && this.speed > MAX_SPEED) this.speed = Math.max(MAX_SPEED, this.speed - 3000 * dt);

    // ----- grip / understeer / drift -----
    const curve = playerSeg.curve;
    const grip = this.gripAt[playerSeg.index];
    this.gripPct = grip;
    const excess = Math.max(0, speedPct - grip);
    let steerAuth = 1, curvePush = CURVE_PUSH, latGain = 1;
    this.understeer = 0;
    this.driftCooldown = Math.max(0, this.driftCooldown - dt);
    if (racing && !this.drifting && brake && Math.abs(steer) >= DRIFT_MIN_STEER && speedPct > DRIFT_MIN_SPEED && !offroad && this.driftCooldown <= 0) {
      this.startDrift(steer > 0 ? 1 : -1);
    }
    if (this.drifting) {
      this.driftTime += dt;
      const hold = steer * this.driftDir >= 0.25;
      const target = hold && gas ? this.driftDir : 0;
      const rate = hold ? (gas ? 6 : 2.2) : 7;
      this.driftAngle += (target - this.driftAngle) * Math.min(1, dt * rate);
      latGain = DRIFT_LAT;
      curvePush = CURVE_PUSH * DRIFT_CURVE_RELIEF;
      this.playerX += this.driftAngle * dt * DRIFT_YAW_PULL; // the yawed car walks toward the inside
      if (this.speed > MAX_SPEED * DRIFT_END_SPEED) this.speed -= DRIFT_SCRUB * (0.5 + speedPct) * dt;
      if (speedPct < DRIFT_END_SPEED || offroad) this.endDrift(false);
      else if (!hold && Math.abs(this.driftAngle) < 0.2) this.endDrift(true);
      else if (hold && !gas && Math.abs(this.driftAngle) < 0.3) this.endDrift(true);
    } else if (excess > 0.01 && Math.abs(curve) > 0.3 && !offroad) {
      // understeer: too fast for the corner - the car washes wide, the wheel goes light
      this.understeer = excess;
      this.understeerSide = curve > 0 ? -1 : 1;
      curvePush += excess * (UNDERSTEER_PUSH + excess * UNDERSTEER_PUSH2);
      steerAuth = Math.max(0.35, 1 - excess * UNDERSTEER_STEER_LOSS);
      this.speed = Math.max(0, this.speed - UNDERSTEER_SCRUB * excess * dt);
    }
    // visual yaw eases in and out
    const yawTarget = this.drifting ? this.driftAngle : 0;
    this.driftYaw += (yawTarget - this.driftYaw) * Math.min(1, dt * 8);

    // ----- lateral -----
    const lat = dt * (0.5 + 1.9 * speedPct) * steerAuth * latGain;
    this.playerX += steer * lat;
    this.playerX -= dt * speedPct * speedPct * curve * curvePush;
    let squeal = 0;
    if (this.drifting) squeal = 0.7 + 0.3 * speedPct;
    else if (this.understeer > 0.03) squeal = Math.min(1, 0.3 + this.understeer * 2.5);
    else if (brake && speedPct > 0.45 && !offroad) squeal = 0.35;
    this.audio.setSqueal(racing ? squeal : 0);
    this.audio.setOffroad(this.offroad ? speedPct : 0);
    this.bounce = this.offroad ? Math.round((Math.random() * 2 - 1) * (1 + speedPct * 2)) : 0;
    if (this.offroad && Math.random() < speedPct * 0.3) this.renderer.addShake(0.6);

    // ----- barriers -----
    const limit = playerSeg.tunnel ? 1.12 : 1.55;
    const hasL = playerSeg.tunnel || playerSeg.barrierL, hasR = playerSeg.tunnel || playerSeg.barrierR;
    if (hasL && this.playerX < -limit) this.barrierHit(-limit, playerSeg.tunnel);
    if (hasR && this.playerX > limit) this.barrierHit(limit, playerSeg.tunnel);
    this.playerX = clamp(this.playerX, -3, 3);

    // ----- scenery collisions -----
    if (racing && Math.abs(this.playerX) > 1.0) {
      for (const s of playerSeg.sprites) {
        if (!s.collide) continue;
        if (Math.abs(this.playerX - s.x) < s.hw + CAR_HW) {
          const strength = clamp(speedPct, 0.3, 1);
          this.driftClean = false;
          if (this.drifting) this.endDrift(false);
          this.speed = Math.min(this.speed, MAX_SPEED * 0.12);
          this.playerX = s.x - Math.sign(s.x) * (s.hw + CAR_HW + 0.05);
          this.renderer.addShake(4 + strength * 5);
          this.audio.hit(strength);
          vibrate(80);
          this.sparks(Math.sign(s.x), strength);
          break;
        }
      }
    }

    // ----- move -----
    this.position += this.speed * dt;
    if (this.position >= track.length) {
      this.position -= track.length;
      if (racing) this.completeLap();
    }
    if (racing) this.raceTime += dt;

    // ----- AI + collisions -----
    this.updateCars(dt, playerSeg);
    if (racing) this.carCollisions(playerSeg);
    this.placeCars();

    // ----- sections / ambience -----
    const sec = track.sectionAt(playerSeg.index);
    const secIdx = track.sectionStarts.indexOf(sec);
    if (secIdx !== this.lastSection) {
      this.lastSection = secIdx;
      if (racing && sec.announce) this.message(sec.name, 2.2, PAL.WHITE, 'section');
    }
    this.tunnelFactor += clamp((playerSeg.tunnel ? 1 : 0) - this.tunnelFactor, -dt * 3, dt * 3);
    this.audio.setCrowd(st === 'title' ? 0.2 : 0.25 + 0.75 * this.sectionCrowd[secIdx] * (1 - this.tunnelFactor));
    if (playerSeg.sideR === SIDE_BANDS.sea && !playerSeg.tunnel) {
      this.seagullTimer -= dt;
      if (this.seagullTimer <= 0) { this.seagullTimer = 6 + Math.random() * 10; this.audio.seagull(); }
    }
    this.updateEngineAudio(dt, null, gas);

    // ----- finish -----
    if (st === 'finished') {
      this.finishTimer += dt;
      this.speed = Math.min(this.speed, MAX_SPEED * 0.45);
    }
    for (let i = this.messages.length - 1; i >= 0; i--) { this.messages[i].t -= dt; if (this.messages[i].t <= 0) this.messages.splice(i, 1); }
  }

  updateEngineAudio(dt, forcedRpm, gas) {
    const on = this.state !== 'title';
    let rpm;
    if (forcedRpm !== null && forcedRpm !== undefined) {
      this.gearSmooth += (forcedRpm - this.gearSmooth) * Math.min(1, dt * 6);
      rpm = this.gearSmooth;
    } else {
      const g = this.gearInfo();
      rpm = 0.15 + g.rpm * 0.85;
    }
    const thr = gas ? 1 : 0;
    this.throttleSmooth += (thr - this.throttleSmooth) * Math.min(1, dt * 8);
    this.audio.setEngine(rpm, this.throttleSmooth, this.tunnelFactor, this.turboActive ? 1 : 0, on);
  }

  gearInfo() {
    const pct = Math.min(this.speed / MAX_SPEED, TURBO_MULT);
    let g = 0;
    for (let i = 0; i < GEARS.length; i++) if (pct >= GEARS[i]) g = i;
    const lo = GEARS[g], hi = g + 1 < GEARS.length ? GEARS[g + 1] : 1.0;
    let rpm = (pct - lo) / (hi - lo);
    if (g === GEARS.length - 1) rpm = Math.min(1, rpm);
    return { gear: g + 1, rpm: clamp(rpm, 0, 1) };
  }

  autopilot(seg, speedPct) {
    // look a little ahead for the curve to cut inside, brake to the grip speed
    const segs = this.track.segments, N = segs.length;
    let ahead = 0;
    for (let k = 4; k < 24; k++) ahead += segs[(seg.index + k) % N].curve;
    ahead /= 20;
    const targetX = -Math.sign(ahead) * Math.min(0.45, Math.abs(ahead) * 0.12);
    const steer = clamp((targetX - this.playerX) * 3 + seg.curve * 0.35 * speedPct, -1, 1);
    const lim = Math.min(this.gripAt[seg.index], this.gripAt[(seg.index + 10) % N]) + 0.03;
    return { steer, gas: speedPct < lim, brake: speedPct > lim + 0.04 };
  }

  startDrift(dir) {
    this.drifting = true;
    this.driftDir = dir;
    this.driftAngle = dir * 0.3;
    this.driftTime = 0;
    this.driftClean = true;
    vibrate(20);
  }
  // clean: exited by easing off (not by running out of speed / road / into something)
  endDrift(clean) {
    if (!this.drifting) return;
    this.drifting = false;
    this.driftCooldown = 0.35;
    if (clean && this.driftClean && this.driftTime >= DRIFT_REWARD_MIN) {
      const gain = Math.min(DRIFT_REWARD_MAX, this.driftTime * DRIFT_REWARD_RATE);
      this.turbo = Math.min(1, this.turbo + gain);
      this.message('DRIFT +TURBO', 1.4, PAL.ORANGE, 'drift');
      this.audio.blip();
    }
  }

  barrierHit(limit, tunnel) {
    this.driftClean = false;
    if (this.drifting) this.endDrift(false);
    this.playerX = limit - Math.sign(limit) * 0.03;
    this.speed = Math.max(0, this.speed - 2600 * 0.016 * 4);
    if (Math.random() < 0.3) { this.audio.scrape(); this.renderer.addShake(1.5); }
    this.sparks(Math.sign(limit), 0.4);
  }

  sparks(side, strength) {
    const r = this.renderer;
    const k = r.playerScale * r.roadWidth * r.f * SPRITE_UNIT;
    const x = r.W / 2 + side * 18 * k, y = r.playerY - 6 * k;
    const n = Math.round(6 + strength * 14);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 30 + Math.random() * 90;
      r.spawn(x, y, Math.cos(a) * sp + side * 20, Math.sin(a) * sp - 40, 0.3 + Math.random() * 0.4, Math.random() < 0.5 ? '#ffd040' : '#ff7020', Math.random() < 0.3 ? 2 : 1, 200);
    }
  }

  completeLap() {
    const t = this.raceTime - this.lapStart;
    this.lapTimes.push(t);
    this.lapStart = this.raceTime;
    this.renderer.flash = 0.7;
    vibrate(40);
    let isBest = false;
    if (this.best === null || t < this.best) {
      this.best = t; isBest = true; this.newBest = true;
      try { localStorage.setItem('monacogt.best.' + this.trackDef.id, String(t)); } catch (e) { /* ignore */ }
    }
    if (this.lap >= this.laps) {
      this.finishRank = this.rank();
      this.state = 'finished';
      this.finishTimer = 0;
      this.audio.finishFanfare(this.finishRank === 1);
      this.audio.setSqueal(0); this.audio.setOffroad(0);
      this.input.showControls(false);
      return;
    }
    this.lap++;
    if (isBest) this.audio.bestLapJingle(); else this.audio.lapJingle();
    this.message(this.lap === this.laps ? 'FINAL LAP' : 'LAP ' + this.lap, 1.6, PAL.YELLOW);
    if (isBest && this.lapTimes.length > 1) this.message('BEST LAP!', 1.6, PAL.CYAN);
  }

  // total distance for ranking
  playerDist() { return (this.lap - 1) * this.track.length + this.position; }
  rank() {
    const pd = this.playerDist();
    let r = 1;
    for (const c of this.cars) if (c.dist > pd) r++;
    return r;
  }

  // ---------- AI ----------
  updateCars(dt, playerSeg) {
    const track = this.track, segs = track.segments, N = segs.length, L = track.length;
    const pd = this.playerDist();
    const racing = this.state === 'racing';
    for (const car of this.cars) {
      const seg = track.findSegment(car.z);
      // corner speed: brake to the grip speed (a little more tolerant than the player, and earlier)
      const grip = Math.min(this.gripAt[seg.index], this.gripAt[(seg.index + AI_LOOKAHEAD) % N]);
      let target = Math.min(car.maxSpeed, MAX_SPEED * Math.min(1.05, grip + AI_GRIP_BONUS));
      if (this.state === 'countdown') target = 0;
      // rubber band so the pack stays close
      const gap = (car.dist - pd) / SEG_LENGTH;
      if (racing) {
        if (gap < -40) target = Math.min(MAX_SPEED * 1.02, target * 1.16);
        else if (gap > 50) target *= 0.88;
      }
      if (car.speed < target) car.speed = Math.min(target, car.speed + 3200 * dt);
      else car.speed = Math.max(target, car.speed - 6000 * dt);
      // lane choice
      car.laneTimer -= dt;
      if (car.laneTimer <= 0) { car.laneTimer = 4 + Math.random() * 6; car.lane = [-0.5, -0.15, 0.15, 0.5][Math.floor(Math.random() * 4)]; }
      let targetX = car.lane - Math.sign(seg.curve) * Math.min(0.3, Math.abs(seg.curve) * 0.05);
      // avoid cars ahead
      let blocked = null, blockDist = Infinity;
      for (const o of this.cars) {
        if (o === car) continue;
        let d = o.z - car.z; if (d < -L / 2) d += L; if (d > L / 2) d -= L;
        if (d > 0 && d < 16 * SEG_LENGTH && Math.abs(o.x - car.x) < 0.42 && o.speed <= car.speed + 400 && d < blockDist) { blocked = o; blockDist = d; }
      }
      if (this.state !== 'title') {
        let d = (this.position + this.renderer.playerZ) - car.z; if (d < -L / 2) d += L; if (d > L / 2) d -= L;
        if (d > 0 && d < 16 * SEG_LENGTH && Math.abs(this.playerX - car.x) < 0.42 && this.speed <= car.speed + 400 && d < blockDist) { blocked = { x: this.playerX }; blockDist = d; }
      }
      if (blocked) {
        targetX = blocked.x > 0 ? blocked.x - 0.7 : blocked.x + 0.7;
        targetX = clamp(targetX, -0.75, 0.75);
        if (blockDist < 5 * SEG_LENGTH) car.speed = Math.max(0, car.speed - 4000 * dt);
      }
      const step = dt * 0.9;
      car.x += clamp(targetX - car.x, -step, step);
      car.x = clamp(car.x, -0.85, 0.85);
      car.steerDir = targetX - car.x > 0.06 ? 1 : (targetX - car.x < -0.06 ? -1 : 0);
      // move
      car.z += car.speed * dt;
      if (car.z >= L) { car.z -= L; car.lap++; }
      car.dist = (car.lap - 1) * L + car.z;
    }
  }

  placeCars() {
    const track = this.track;
    for (const car of this.cars) {
      if (car.seg) car.seg.cars.length = 0;
    }
    for (const car of this.cars) {
      const seg = track.findSegment(car.z);
      car.percent = (car.z % SEG_LENGTH) / SEG_LENGTH;
      car.seg = seg;
      seg.cars.push(car);
    }
  }

  carCollisions(playerSeg) {
    const pz = this.position + this.renderer.playerZ;
    const L = this.track.length;
    for (const car of this.cars) {
      let d = car.z - pz; if (d < -L / 2) d += L; if (d > L / 2) d -= L;
      if (Math.abs(d) > SEG_LENGTH * 0.9) continue;
      const dx = this.playerX - car.x;
      if (Math.abs(dx) >= CAR_HW * 2) continue;
      if (d > 0 && this.speed > car.speed) {
        // rear-ended them
        this.driftClean = false;
        const delta = (this.speed - car.speed) / MAX_SPEED;
        this.speed = Math.max(car.speed * 0.85 - 300, 0);
        car.speed = Math.min(MAX_SPEED, car.speed + 600);
        car.z += SEG_LENGTH * 0.4;
        this.playerX += Math.sign(dx || (Math.random() - 0.5)) * 0.12;
        car.x -= Math.sign(dx) * 0.08;
        this.renderer.addShake(2 + delta * 8);
        this.audio.hit(clamp(0.3 + delta * 1.5, 0.3, 1));
        vibrate(50);
        this.sparks(-Math.sign(dx || 1), delta + 0.3);
      } else if (d < 0 && car.speed > this.speed) {
        // they hit us from behind
        this.speed = Math.min(MAX_SPEED, this.speed + 500);
        car.speed = Math.max(0, this.speed * 0.8);
        this.renderer.addShake(2);
        this.audio.hit(0.4);
      } else {
        // side by side: nudge apart
        const push = Math.sign(dx || 1) * 0.6 * 0.016;
        this.playerX += push; car.x -= push;
        if (Math.random() < 0.1) this.audio.scrape();
      }
    }
  }

  // ---------- drawing (HUD, menus) ----------
  drawOverlay(ctx, r, dt) {
    const st = this.state;
    if (st === 'title') { this.drawTitle(ctx, r); return; }
    this.drawHUD(ctx, r);
    this.drawMessages(ctx, r);
    if (st === 'countdown') this.drawCountdown(ctx, r);
    else if (st === 'paused') this.drawPauseMenu(ctx, r);
    else if (st === 'finished' && this.finishTimer > 1.2) this.drawResults(ctx, r);
  }

  panel(ctx, x, y, w, h, alpha = 0.75) {
    ctx.fillStyle = 'rgba(8,8,24,' + alpha + ')';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = PAL.WHITE; ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y + h - 1, w, 1); ctx.fillRect(x, y, 1, h); ctx.fillRect(x + w - 1, y, 1, h);
    ctx.fillStyle = PAL.RED; ctx.fillRect(x + 2, y + 2, w - 4, 1);
  }

  drawHUD(ctx, r) {
    const W = r.W, H = r.H, sceneH = r.sceneH;
    const s = W >= 260 ? 2 : 1;
    const pad = 4, topY = 4;
    const landscape = r.dashH === 0;
    const rank = this.state === 'finished' ? this.finishRank : this.rank();
    const kmh = Math.round(this.speed / MAX_SPEED * 300);
    const g = this.gearInfo();
    const lapTxt = this.lap + '/' + this.laps, posTxt = ordinal(rank);
    const timeTxt = fmtTime(this.raceTime - this.lapStart), bestTxt = 'BEST ' + fmtTime(this.best);
    if (landscape) {
      // ---- corners: lap/pos top-left, time top-centre, speed cluster around the car at the bottom ----
      ctx.fillStyle = 'rgba(8,8,24,0.55)';
      ctx.fillRect(0, 0, 24 + Font.width('1/3', s) + 8, 16 * s + 12);
      const tw = Math.max(Font.width(timeTxt, s), Font.width(bestTxt, 1)) + 16;
      ctx.fillRect(Math.round(W / 2 - tw / 2), 0, tw, 16 * s + 12);
    } else {
      ctx.fillStyle = 'rgba(8,8,24,0.55)';
      ctx.fillRect(0, 0, W, 16 * s + 12);
    }
    // lap + position (left column; the top-right corner is reserved for the pause/radio/mute buttons)
    Font.draw(ctx, 'LAP', pad, topY + 2, { color: PAL.GRAY, scale: 1 });
    Font.draw(ctx, lapTxt, pad + 20, topY, { color: PAL.WHITE, scale: s, shadow: PAL.BLACK });
    Font.draw(ctx, 'POS', pad, topY + 8 * s + 5, { color: PAL.GRAY, scale: 1 });
    Font.draw(ctx, posTxt, pad + 20, topY + 8 * s + 3, { color: rank === 1 ? PAL.YELLOW : PAL.WHITE, scale: s, shadow: PAL.BLACK });
    // time (centre)
    const tcx = Math.round(W * 0.5);
    Font.draw(ctx, timeTxt, tcx, topY, { color: PAL.CYAN, scale: s, align: 'center', shadow: PAL.BLACK });
    Font.draw(ctx, bestTxt, tcx, topY + 8 * s + 5, { color: PAL.GRAY, scale: 1, align: 'center' });
    // ----- speed / gear / turbo -----
    let dashTop, sx, gx, tx, tw;
    if (landscape) {
      // either side of the player car, just above the bottom edge
      const carHW = Math.round(18 * r.playerScale * r.roadWidth * r.f * SPRITE_UNIT);
      dashTop = H - 38;
      sx = Math.round(W / 2 - carHW - 10);
      gx = Math.round(W / 2 + carHW + 10);
      tx = gx + 28; tw = 60;
      ctx.fillStyle = 'rgba(8,8,24,0.5)';
      ctx.fillRect(sx - 70, dashTop - 4, 74, 32);
      ctx.fillRect(gx - 4, dashTop - 4, tw + 36, 32);
    } else {
      dashTop = sceneH + 6;
      sx = Math.round(W / 2) - 8; gx = Math.round(W / 2);
      tx = gx + 28; tw = Math.min(70, W / 2 - 34);
    }
    const speedCol = this.turboActive ? PAL.ORANGE : (this.understeer > 0.03 ? PAL.RED : PAL.WHITE);
    Font.draw(ctx, String(kmh), sx, dashTop, { color: speedCol, scale: 3, align: 'right', shadow: PAL.BLACK });
    Font.draw(ctx, 'KM/H', sx, dashTop + 22, { color: PAL.GRAY, scale: 1, align: 'right' });
    // gear box
    ctx.fillStyle = PAL.PANEL; ctx.fillRect(gx, dashTop - 1, 22, 22);
    ctx.fillStyle = g.rpm > 0.9 ? PAL.RED : PAL.WHITE; ctx.fillRect(gx, dashTop - 1, 22, 1); ctx.fillRect(gx, dashTop + 20, 22, 1);
    Font.draw(ctx, String(g.gear), gx + 11, dashTop + 2, { color: g.rpm > 0.9 ? PAL.RED : PAL.YELLOW, scale: 2, align: 'center' });
    // rpm bar under gear
    ctx.fillStyle = '#303050'; ctx.fillRect(gx, dashTop + 23, 22, 3);
    ctx.fillStyle = g.rpm > 0.9 ? PAL.RED : PAL.GREEN; ctx.fillRect(gx, dashTop + 23, Math.round(22 * g.rpm), 3);
    // turbo meter
    Font.draw(ctx, this.drifting ? 'DRIFT' : 'TURBO', tx, dashTop - 1, { color: this.drifting ? PAL.ORANGE : (this.turboActive ? PAL.ORANGE : PAL.GRAY), scale: 1 });
    ctx.fillStyle = '#303050'; ctx.fillRect(tx, dashTop + 8, tw, 8);
    const fill = Math.round((tw - 2) * this.turbo);
    ctx.fillStyle = this.turboActive ? PAL.ORANGE : (this.turbo < 0.12 ? PAL.RED : PAL.CYAN);
    for (let i = 0; i < fill; i += 4) ctx.fillRect(tx + 1 + i, dashTop + 9, Math.min(3, fill - i), 6);
    ctx.fillStyle = PAL.WHITE; ctx.fillRect(tx, dashTop + 8, tw, 1); ctx.fillRect(tx, dashTop + 15, tw, 1);
    // lap times (portrait dash only)
    if (!landscape) {
      let y = dashTop + 34;
      for (let i = 0; i < this.lapTimes.length && i < 3; i++) {
        Font.draw(ctx, 'LAP ' + (i + 1) + '  ' + fmtTime(this.lapTimes[i]), 6, y, { color: this.lapTimes[i] === this.best ? PAL.CYAN : PAL.GRAY, scale: 1 });
        y += 9;
      }
    }
  }

  drawMessages(ctx, r) {
    let y = Math.round(r.sceneH * 0.24);
    for (const m of this.messages) {
      const a = Math.min(1, m.t * 4, (m.dur - m.t) * 6);
      ctx.globalAlpha = Math.max(0, a);
      const w = Font.width(m.text, 2) + 16;
      ctx.fillStyle = 'rgba(8,8,24,0.7)';
      ctx.fillRect(Math.round(r.W / 2 - w / 2), y - 4, w, 22);
      Font.draw(ctx, m.text, r.W / 2, y, { color: m.color, scale: 2, align: 'center', shadow: PAL.BLACK });
      ctx.globalAlpha = 1;
      y += 26;
    }
  }

  drawCountdown(ctx, r) {
    const n = Math.ceil(this.countdown);
    if (n <= 0 || n > 3) return;
    const frac = this.countdown - Math.floor(this.countdown);
    const scale = 6 + Math.round((1 - frac) * 3);
    Font.draw(ctx, String(n), r.W / 2, Math.round(r.sceneH * 0.45) - scale * 4, { color: n === 1 ? PAL.GREEN : (n === 2 ? PAL.YELLOW : PAL.RED), scale, align: 'center', outline: PAL.BLACK });
  }

  drawTitle(ctx, r) {
    const W = r.W, H = r.H, sceneH = r.sceneH;
    const blink = Math.floor(this.time * 2) % 2 === 0;
    const landscape = r.dashH === 0;
    const big = Math.max(3, Math.min(7, Math.floor(W / 46)));
    const ly = Math.round(sceneH * 0.08);
    // logo backing
    ctx.fillStyle = 'rgba(8,8,24,0.55)';
    ctx.fillRect(0, ly - 6, W, big * 7 + 40);
    // checkered strip
    for (let x = 0; x < W; x += 6) for (let k = 0; k < 2; k++) { ctx.fillStyle = ((x / 6 + k) & 1) ? '#f0f0f0' : '#181818'; ctx.fillRect(x, ly - 6 + k * 3, 6, 3); }
    Font.draw(ctx, 'MONACO', W / 2 + big, ly + 4 + big, { color: PAL.RED, scale: big, align: 'center' });
    Font.draw(ctx, 'MONACO', W / 2, ly + 4, { color: PAL.YELLOW, scale: big, align: 'center', outline: PAL.BLACK });
    Font.draw(ctx, 'G T', W / 2, ly + 8 + big * 7, { color: PAL.WHITE, scale: Math.max(2, big - 3), align: 'center', outline: PAL.BLACK });
    Font.draw(ctx, this.trackDef.subtitle, W / 2, ly + big * 7 + 12 + Math.max(2, big - 3) * 7, { color: PAL.CYAN, scale: 1, align: 'center', shadow: PAL.BLACK });
    this.tunerRects.length = 0;
    if (landscape) {
      // prompt on the left, radio tuner on the right, hints along the bottom
      const px = Math.round(W * 0.28), py = Math.round(sceneH * 0.5);
      if (blink) Font.draw(ctx, 'TAP TO START', px, py, { color: PAL.WHITE, scale: 2, align: 'center', outline: PAL.BLACK });
      Font.draw(ctx, 'BEST LAP ' + fmtTime(this.best), px, py + 22, { color: PAL.YELLOW, scale: 1, align: 'center', shadow: PAL.BLACK });
      Font.draw(ctx, this.laps + ' LAPS  -  ' + (this.cars.length + 1) + ' CARS', px, py + 33, { color: PAL.GRAY, scale: 1, align: 'center', shadow: PAL.BLACK });
      const rw = Math.min(200, Math.round(W * 0.36)), rh = 60;
      this.drawRadio(ctx, r, Math.round(W * 0.72 - rw / 2), py - 8, rw, rh);
      const hy = H - 24;
      Font.draw(ctx, 'LEFT: DRAG TO STEER   RIGHT: GAS BRAKE TURBO   BRAKE+STEER TO DRIFT', W / 2, hy, { color: PAL.GRAY, scale: 1, align: 'center', shadow: PAL.BLACK });
      Font.draw(ctx, 'KEYS: ARROWS/WASD  SHIFT=TURBO  R=RADIO  P=PAUSE  M=MUTE', W / 2, hy + 10, { color: PAL.GRAY, scale: 1, align: 'center', shadow: PAL.BLACK });
    } else {
      // portrait: everything lives in the dashboard under the scene
      const py = sceneH + Math.round(r.dashH * 0.14);
      if (blink) Font.draw(ctx, 'TAP TO START', W / 2, py, { color: PAL.WHITE, scale: 2, align: 'center', outline: PAL.BLACK });
      Font.draw(ctx, 'BEST LAP ' + fmtTime(this.best), W / 2, py + 22, { color: PAL.YELLOW, scale: 1, align: 'center', shadow: PAL.BLACK });
      Font.draw(ctx, this.laps + ' LAPS  -  ' + (this.cars.length + 1) + ' CARS', W / 2, py + 33, { color: PAL.GRAY, scale: 1, align: 'center', shadow: PAL.BLACK });
      const rw = Math.min(210, W - 24), rh = 60;
      this.drawRadio(ctx, r, Math.round(W / 2 - rw / 2), py + 50, rw, rh);
      // rotate hint (Safari can't lock orientation; the Home Screen app does)
      const ry = py + 50 + rh + 18, hint = 'ROTATE FOR BEST EXPERIENCE', hc = blink ? PAL.YELLOW : '#a08010';
      const hx = Math.round(W / 2 - Font.width(hint, 1) / 2 + 13);
      // tiny phone icon: upright -> sideways
      ctx.fillStyle = hc; ctx.fillRect(hx - 26, ry - 1, 7, 11); ctx.fillStyle = PAL.DARK; ctx.fillRect(hx - 25, ry + 1, 5, 7);
      ctx.fillStyle = hc; ctx.fillRect(hx - 16, ry + 1, 11, 7); ctx.fillStyle = PAL.DARK; ctx.fillRect(hx - 14, ry + 2, 7, 5);
      Font.draw(ctx, hint, hx, ry + 1, { color: hc, scale: 1 });
      const hy = H - 34;
      Font.draw(ctx, 'LEFT: DRAG TO STEER   RIGHT: GAS BRAKE TURBO', W / 2, hy, { color: PAL.GRAY, scale: 1, align: 'center', shadow: PAL.BLACK });
      Font.draw(ctx, 'BRAKE+STEER TO DRIFT   R=RADIO  P=PAUSE  M=MUTE', W / 2, hy + 10, { color: PAL.GRAY, scale: 1, align: 'center', shadow: PAL.BLACK });
      Font.draw(ctx, '16-BIT ARCADE RACING', W / 2, hy + 21, { color: '#6060a0', scale: 1, align: 'center' });
    }
  }

  // Pixel-art car radio: speaker grille, amber display with station name /
  // frequency and a bouncing EQ, < > buttons. Registers tap rects.
  drawRadio(ctx, r, x, y, w, h) {
    const a = this.audio, st = a.stationInfo();
    const off = !!st.off;
    // body
    ctx.fillStyle = '#1a1a26'; ctx.fillRect(x + 1, y + 1, w, h);
    ctx.fillStyle = '#3c3c50'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#20202c'; ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
    ctx.fillStyle = '#5c5c78'; ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y, 1, h);
    ctx.fillStyle = '#101018'; ctx.fillRect(x, y + h - 1, w, 1); ctx.fillRect(x + w - 1, y, 1, h);
    // speaker grille on the left
    ctx.fillStyle = '#0c0c14';
    for (let gy = y + 8; gy < y + h - 8; gy += 3) for (let gx = x + 7; gx < x + 27; gx += 3) ctx.fillRect(gx, gy, 2, 2);
    // buttons
    const bw = 16, bh = 22, by = y + Math.round(h / 2 - bh / 2);
    const lx = x + 32, rx = x + w - 6 - bw;
    for (const [bx, txt, act] of [[lx, '<', () => this.prevStation()], [rx, '>', () => this.nextStation()]]) {
      ctx.fillStyle = '#101018'; ctx.fillRect(bx + 1, by + 1, bw, bh);
      ctx.fillStyle = '#6a6a88'; ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = '#4a4a64'; ctx.fillRect(bx + 1, by + 1, bw - 2, bh - 2);
      ctx.fillStyle = '#7c7c9c'; ctx.fillRect(bx + 1, by + 1, bw - 2, 1);
      Font.draw(ctx, txt, bx + bw / 2, by + 7, { color: PAL.WHITE, scale: 1, align: 'center' });
      this.tunerRects.push({ x: bx - 8, y: y, w: bw + 16, h: h, action: act });
    }
    // display
    const dx = lx + bw + 5, dw = rx - 5 - dx, dy = y + 8, dh = h - 16;
    ctx.fillStyle = '#080808'; ctx.fillRect(dx - 1, dy - 1, dw + 2, dh + 2);
    ctx.fillStyle = off ? '#1a1410' : '#3a2408'; ctx.fillRect(dx, dy, dw, dh);
    if (!off) { ctx.fillStyle = '#4a3010'; for (let gy = dy; gy < dy + dh; gy += 2) ctx.fillRect(dx, gy, dw, 1); }
    const amber = off ? '#5a4020' : PAL.ORANGE, dim = off ? '#3a2c18' : '#c07020';
    Font.draw(ctx, off ? '---.-' : st.freq, dx + 4, dy + 4, { color: amber, scale: 2 });
    Font.draw(ctx, 'FM', dx + 4 + Font.width(st.freq, 2) + 6, dy + 11, { color: dim, scale: 1 });
    Font.draw(ctx, st.name, dx + 4, dy + dh - 10, { color: amber, scale: 1 });
    // EQ bars, right side of the display
    const bars = 7, ex = dx + dw - 4 - bars * 4, eh = dh - 8;
    const phase = a.beatPhase();
    const playing = !off && a.musicOn;
    for (let i = 0; i < bars; i++) {
      let lv = 0;
      if (playing) lv = clamp(0.25 + 0.45 * Math.abs(Math.sin(this.time * (2.2 + i * 0.57) + i * 1.9)) + 0.4 * (1 - phase) * (i % 2 ? 0.6 : 1), 0.08, 1);
      else if (!off) lv = 0.08;
      const hh = Math.max(1, Math.round(lv * eh));
      for (let k = 0; k < hh; k += 2) {
        ctx.fillStyle = k > eh * 0.7 ? PAL.RED : (k > eh * 0.4 ? PAL.YELLOW : PAL.GREEN);
        ctx.fillRect(ex + i * 4, dy + dh - 4 - k - 1, 3, 1);
      }
    }
    // the display itself cycles stations too
    this.tunerRects.push({ x: dx, y: dy, w: dw, h: dh, action: () => this.nextStation() });
    Font.draw(ctx, 'RADIO', x + w / 2, y + h + 4, { color: '#6060a0', scale: 1, align: 'center' });
  }

  drawPauseMenu(ctx, r) {
    const W = r.W, sceneH = r.sceneH;
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, W, sceneH);
    const items = [
      ['RESUME', () => this.resumeRace()],
      ['RESTART', () => { this.startRace(); }],
      ['SOUND: ' + (this.audio.muted ? 'OFF' : 'ON'), () => this.toggleMute()],
      ['RADIO: ' + (this.audio.stationInfo().off ? 'OFF' : this.audio.stationInfo().name), () => this.nextStation()],
      ['CRT: ' + (this.crt ? 'ON' : 'OFF'), () => this.toggleCrt()],
      ['QUIT TO TITLE', () => this.toTitle()],
    ];
    const pw = Math.min(W - 20, 200), ih = 26, ph = 40 + items.length * ih;
    const px0 = Math.round(W / 2 - pw / 2), py0 = Math.round(sceneH / 2 - ph / 2);
    this.panel(ctx, px0, py0, pw, ph);
    Font.draw(ctx, 'PAUSED', W / 2, py0 + 10, { color: PAL.YELLOW, scale: 2, align: 'center', shadow: PAL.BLACK });
    this.menuRects.length = 0;
    items.forEach((it, i) => {
      const y = py0 + 34 + i * ih;
      ctx.fillStyle = '#242448'; ctx.fillRect(px0 + 10, y, pw - 20, ih - 6);
      ctx.fillStyle = '#4c4c80'; ctx.fillRect(px0 + 10, y + ih - 7, pw - 20, 1);
      Font.draw(ctx, it[0], W / 2, y + 4, { color: PAL.WHITE, scale: Math.min(2, Math.floor((pw - 30) / Font.width(it[0], 1))), align: 'center' });
      this.menuRects.push({ x: px0 + 10, y, w: pw - 20, h: ih - 6, action: it[1] });
    });
  }

  drawResults(ctx, r) {
    const W = r.W, sceneH = r.sceneH;
    const pw = Math.min(W - 16, 240), ph = 150 + this.lapTimes.length * 10;
    const px0 = Math.round(W / 2 - pw / 2), py0 = Math.round(sceneH / 2 - ph / 2);
    this.panel(ctx, px0, py0, pw, ph);
    const win = this.finishRank === 1;
    Font.draw(ctx, win ? 'YOU WIN!' : 'FINISH!', W / 2, py0 + 10, { color: win ? PAL.YELLOW : PAL.WHITE, scale: 3, align: 'center', shadow: PAL.BLACK });
    let y = py0 + 40;
    Font.draw(ctx, 'POSITION', px0 + 12, y, { color: PAL.GRAY }); Font.draw(ctx, ordinal(this.finishRank), px0 + pw - 12, y - 2, { color: win ? PAL.YELLOW : PAL.WHITE, scale: 2, align: 'right' }); y += 18;
    Font.draw(ctx, 'TOTAL TIME', px0 + 12, y, { color: PAL.GRAY }); Font.draw(ctx, fmtTime(this.raceTime), px0 + pw - 12, y - 2, { color: PAL.CYAN, scale: 2, align: 'right' }); y += 18;
    Font.draw(ctx, 'BEST LAP', px0 + 12, y, { color: PAL.GRAY }); Font.draw(ctx, fmtTime(Math.min(...this.lapTimes)), px0 + pw - 12, y - 2, { color: this.newBest ? PAL.YELLOW : PAL.WHITE, scale: 2, align: 'right' }); y += 18;
    if (this.newBest) { Font.draw(ctx, 'NEW RECORD!', W / 2, y, { color: PAL.YELLOW, align: 'center', shadow: PAL.BLACK }); }
    y += 12;
    this.lapTimes.forEach((t, i) => { Font.draw(ctx, 'LAP ' + (i + 1), px0 + 12, y, { color: PAL.GRAY }); Font.draw(ctx, fmtTime(t), px0 + pw - 12, y, { color: PAL.WHITE, align: 'right' }); y += 10; });
    if (Math.floor(this.time * 2) % 2 === 0) Font.draw(ctx, 'TAP TO RACE AGAIN', W / 2, py0 + ph - 16, { color: PAL.GREEN, align: 'center', scale: 1 });
  }
}
