'use strict';
/* Monaco GT - input: two-thumb touch controls + keyboard.
   Left zone: drag horizontally to steer (relative to where the thumb landed).
   Right zone: GAS / BRAKE / TURBO pedals; a thumb can slide between them.
   Taps on the canvas are forwarded to the game (menus). */

class Input {
  constructor(game) {
    this.game = game;
    this.steer = 0;        // -1..1
    this.gas = false;
    this.brake = false;
    this.turbo = false;
    this.keys = {};
    this.touchSteer = null; // { id, startX }
    this.pedalTouches = {}; // touch id -> pedal name
    this.hasTouch = false;

    this.el = {
      stage: document.getElementById('stage'),
      canvas: document.getElementById('screen'),
      controls: document.getElementById('controls'),
      steerZone: document.getElementById('steer-zone'),
      knob: document.getElementById('steer-knob'),
      track: document.getElementById('steer-track'),
      gas: document.getElementById('btn-gas'),
      brake: document.getElementById('btn-brake'),
      turbo: document.getElementById('btn-turbo'),
      pedalZone: document.getElementById('pedal-zone'),
      pause: document.getElementById('btn-pause'),
      mute: document.getElementById('btn-mute'),
      radio: document.getElementById('btn-radio'),
    };
    this._bind();
  }

  _bind() {
    const el = this.el;
    const prevent = e => { if (e.cancelable) e.preventDefault(); };
    // Stop iOS bounce / zoom on everything inside the stage.
    document.addEventListener('touchmove', prevent, { passive: false });
    document.addEventListener('gesturestart', prevent, { passive: false });
    el.stage.addEventListener('touchstart', e => { this.hasTouch = true; this.game.userGesture(); }, { passive: true });
    el.stage.addEventListener('mousedown', () => this.game.userGesture());
    window.addEventListener('keydown', () => this.game.userGesture());

    // --- canvas taps (menus) ---
    el.canvas.addEventListener('touchstart', e => {
      prevent(e);
      const t = e.changedTouches[0];
      this._tap(t.clientX, t.clientY);
    }, { passive: false });
    el.canvas.addEventListener('mousedown', e => this._tap(e.clientX, e.clientY));

    // --- steering zone ---
    const sz = el.steerZone;
    sz.addEventListener('touchstart', e => {
      prevent(e);
      if (this.touchSteer) return;
      const t = e.changedTouches[0];
      this.touchSteer = { id: t.identifier, startX: t.clientX };
      this._setSteer(0);
    }, { passive: false });
    sz.addEventListener('touchmove', e => {
      prevent(e);
      if (!this.touchSteer) return;
      for (const t of e.changedTouches) {
        if (t.identifier !== this.touchSteer.id) continue;
        const range = Math.max(60, sz.clientWidth * 0.32);
        this._setSteer((t.clientX - this.touchSteer.startX) / range);
      }
    }, { passive: false });
    const steerEnd = e => {
      prevent(e);
      if (!this.touchSteer) return;
      for (const t of e.changedTouches) if (t.identifier === this.touchSteer.id) { this.touchSteer = null; this._setSteer(0); }
    };
    sz.addEventListener('touchend', steerEnd, { passive: false });
    sz.addEventListener('touchcancel', steerEnd, { passive: false });
    // mouse steering for desktop testing
    let mouseSteer = null;
    sz.addEventListener('mousedown', e => { mouseSteer = e.clientX; this._setSteer(0); });
    window.addEventListener('mousemove', e => { if (mouseSteer !== null) this._setSteer((e.clientX - mouseSteer) / Math.max(60, sz.clientWidth * 0.32)); });
    window.addEventListener('mouseup', () => { if (mouseSteer !== null) { mouseSteer = null; this._setSteer(0); } });

    // --- pedals ---
    const pz = el.pedalZone;
    const pedalAt = (x, y) => {
      const t = document.elementFromPoint(x, y);
      if (!t) return null;
      const p = t.closest ? t.closest('.pedal') : null;
      if (!p) return null;
      return p === el.gas ? 'gas' : (p === el.brake ? 'brake' : 'turbo');
    };
    const updatePedals = () => {
      const active = { gas: false, brake: false, turbo: false };
      for (const id in this.pedalTouches) active[this.pedalTouches[id]] = true;
      this.touchGas = active.gas; this.touchBrake = active.brake; this.touchTurbo = active.turbo;
      el.gas.classList.toggle('active', active.gas);
      el.brake.classList.toggle('active', active.brake);
      el.turbo.classList.toggle('active', active.turbo);
      this._recompute();
    };
    pz.addEventListener('touchstart', e => {
      prevent(e);
      for (const t of e.changedTouches) { const p = pedalAt(t.clientX, t.clientY); if (p) this.pedalTouches[t.identifier] = p; }
      updatePedals();
    }, { passive: false });
    pz.addEventListener('touchmove', e => {
      prevent(e);
      for (const t of e.changedTouches) {
        if (!(t.identifier in this.pedalTouches)) continue;
        const p = pedalAt(t.clientX, t.clientY);
        if (p) this.pedalTouches[t.identifier] = p;
      }
      updatePedals();
    }, { passive: false });
    const pedalEnd = e => {
      prevent(e);
      for (const t of e.changedTouches) delete this.pedalTouches[t.identifier];
      updatePedals();
    };
    pz.addEventListener('touchend', pedalEnd, { passive: false });
    pz.addEventListener('touchcancel', pedalEnd, { passive: false });
    // mouse pedals
    for (const name of ['gas', 'brake', 'turbo']) {
      el[name].addEventListener('mousedown', () => { this.pedalTouches['m' + name] = name; updatePedals(); });
      el[name].addEventListener('mouseup', () => { delete this.pedalTouches['m' + name]; updatePedals(); });
      el[name].addEventListener('mouseleave', () => { delete this.pedalTouches['m' + name]; updatePedals(); });
    }

    // --- keyboard ---
    window.addEventListener('keydown', e => {
      if (e.repeat) return;
      this.keys[e.code] = true;
      switch (e.code) {
        case 'Enter': case 'Space': case 'KeyX': this.game.onConfirm(); break;
        case 'Escape': case 'KeyP': this.game.onPause(); break;
        case 'KeyM': this.game.toggleMute(); break;
        case 'KeyC': this.game.toggleCrt(); break;
        case 'KeyR': this.game.nextStation(); break;
        default: break;
      }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      this._recompute();
    });
    window.addEventListener('keyup', e => { this.keys[e.code] = false; this._recompute(); });
    this._updatePedals = updatePedals;
    window.addEventListener('blur', () => this.reset());

    // --- small buttons ---
    el.pause.addEventListener('click', e => { e.stopPropagation(); this.game.onPause(); });
    el.mute.addEventListener('click', e => { e.stopPropagation(); this.game.toggleMute(); });
    el.radio.addEventListener('click', e => { e.stopPropagation(); this.game.nextStation(); });
    for (const b of [el.pause, el.mute, el.radio]) b.addEventListener('touchstart', e => { e.stopPropagation(); this.game.userGesture(); }, { passive: true });
  }

  // Drop every active touch/key (rotation, focus loss): nothing may stay stuck down.
  reset() {
    this.keys = {};
    this.pedalTouches = {};
    this.touchSteer = null;
    this._setSteer(0);
    this._updatePedals();
  }

  _tap(clientX, clientY) {
    const r = this.el.canvas.getBoundingClientRect();
    const g = this.game;
    const x = (clientX - r.left) / r.width * g.renderer.W;
    const y = (clientY - r.top) / r.height * g.renderer.H;
    g.onTap(x, y);
  }

  _setSteer(v) {
    this.touchSteerValue = Math.max(-1, Math.min(1, v));
    const half = (this.el.track.clientWidth / 2) - 4;
    this.el.knob.style.transform = 'translateX(' + Math.round(this.touchSteerValue * half) + 'px)';
    this._recompute();
  }

  _recompute() {
    const k = this.keys;
    let steer = this.touchSteerValue || 0;
    if (k.ArrowLeft || k.KeyA) steer -= 1;
    if (k.ArrowRight || k.KeyD) steer += 1;
    this.steer = Math.max(-1, Math.min(1, steer));
    this.gas = !!(this.touchGas || k.ArrowUp || k.KeyW);
    this.brake = !!(this.touchBrake || k.ArrowDown || k.KeyS);
    this.turbo = !!(this.touchTurbo || k.ShiftLeft || k.ShiftRight || k.KeyZ);
  }

  showControls(show) { this.el.controls.classList.toggle('hidden', !show); this.el.pause.classList.toggle('hidden', !show); }
  showPads(show) { this.el.controls.classList.toggle('hidden', !show); }
  setTurboEmpty(empty) { this.el.turbo.classList.toggle('empty', empty); }
  setMuteIcon(muted) { this.el.mute.classList.toggle('off', muted); }
  setRadioIcon(off) { this.el.radio.classList.toggle('off', off); }
}
