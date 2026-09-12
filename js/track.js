'use strict';
/* Monaco GT - track builder: turns a track definition (js/tracks/*.js) into a
   flat array of road segments the renderer and physics work on. */

const SEG_LENGTH = 200;         // world units per segment
const ROAD_WIDTH = 2000;        // half width of the road in world units
const RUMBLE_EVERY = 3;         // segments per colour stripe
const SPRITE_UNIT = 0.01;       // sprite pixel -> road half-widths

// Ground band definitions per side type: [colours light, dark, width in half-widths (last = infinite)]
const SIDE_BANDS = {
  grass: [[PAL.GRASS_L, PAL.GRASS_D, Infinity]],
  pave:  [[PAL.PAVE_L, PAL.PAVE_D, Infinity]],
  sand:  [[PAL.SAND_L, PAL.SAND_D, Infinity]],
  sea:   [[PAL.PAVE_L, PAL.PAVE_D, 1.3], [PAL.SEA_L, PAL.SEA_D, Infinity]],
  tunnel: [[PAL.TUN_GROUND, PAL.TUN_GROUND, Infinity]],
};

const easeIn = (a, b, p) => a + (b - a) * Math.pow(p, 2);
const easeOut = (a, b, p) => a + (b - a) * (1 - Math.pow(1 - p, 2));
const easeInOut = (a, b, p) => a + (b - a) * ((-Math.cos(p * Math.PI) / 2) + 0.5);

class Track {
  constructor(def) {
    this.def = def;
    this.name = def.name;
    this.laps = def.laps;
    this.segments = [];
    this.sectionStarts = []; // {index, name, announce}
    this.build();
  }

  get length() { return this.segments.length * SEG_LENGTH; }

  lastY() { const s = this.segments; return s.length ? s[s.length - 1].p2.world.y : 0; }

  addSegment(curve, y, section, sectionIdx) {
    const n = this.segments.length;
    const tunnel = !!section.tunnel;
    this.segments.push({
      index: n,
      p1: { world: { x: 0, y: this.lastY(), z: n * SEG_LENGTH }, camera: { x: 0, y: 0, z: 0 }, screen: { x: 0, y: 0, w: 0, scale: 0 } },
      p2: { world: { x: 0, y: y, z: (n + 1) * SEG_LENGTH }, camera: { x: 0, y: 0, z: 0 }, screen: { x: 0, y: 0, w: 0, scale: 0 } },
      curve,
      stripe: Math.floor(n / RUMBLE_EVERY) % 2, // 0 light, 1 dark
      tunnel,
      tunnelStart: false, tunnelEnd: false,
      lit: tunnel && (n % 7 < 2),
      lamp: tunnel && (n % 7 === 0),
      sideL: SIDE_BANDS[tunnel ? 'tunnel' : (section.side ? section.side[0] : 'grass')],
      sideR: SIDE_BANDS[tunnel ? 'tunnel' : (section.side ? section.side[1] : 'grass')],
      barrierL: !tunnel && !!(section.barrier && section.barrier[0]),
      barrierR: !tunnel && !!(section.barrier && section.barrier[1]),
      section: sectionIdx,
      sprites: [],
      cars: [],
      clip: 0,
      visible: false,
    });
  }

  addRoad(enter, hold, leave, curve, y, section, sectionIdx) {
    const startY = this.lastY();
    const endY = startY + y * SEG_LENGTH;
    const total = enter + hold + leave;
    for (let n = 0; n < enter; n++) this.addSegment(easeIn(0, curve, n / enter), easeInOut(startY, endY, n / total), section, sectionIdx);
    for (let n = 0; n < hold; n++) this.addSegment(curve, easeInOut(startY, endY, (enter + n) / total), section, sectionIdx);
    for (let n = 0; n < leave; n++) this.addSegment(easeInOut(curve, 0, n / leave), easeInOut(startY, endY, (enter + hold + n) / total), section, sectionIdx);
  }

  build() {
    const def = this.def, k = def.lengthScale || 1;
    const S = Sprites.all;
    def.sections.forEach((sec, si) => {
      const start = this.segments.length;
      const enter = Math.round(sec.enter * k), hold = Math.round(sec.hold * k), leave = Math.round(sec.leave * k);
      this.addRoad(enter, hold, leave, sec.curve || 0, sec.hill || 0, sec, si);
      const end = this.segments.length;
      const len = end - start;
      this.sectionStarts.push({ index: start, end, name: sec.name, announce: !!sec.announce });
      if (sec.tunnel) { this.segments[start].tunnelStart = true; this.segments[end - 1].tunnelEnd = true; }
      // scenery rules
      let seed = si * 7919 + 17;
      const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
      for (const rule of (sec.scenery || [])) {
        const names = [rule.sprite].concat(rule.alt || []);
        const every = Math.max(2, Math.round(rule.every * k));
        const sides = rule.side === 0 ? [-1, 1] : [rule.side];
        for (const side of sides) {
          let i = Math.floor(rnd() * every * 0.5);
          let n = 0;
          for (; i < len; i += every, n++) {
            const name = names[n % names.length];
            const spr = S[name];
            if (!spr) continue;
            const jitter = (rule.jitter || 0) * rnd();
            this.addSprite(start + i, spr, side, rule.offset + jitter, name);
          }
        }
      }
      for (const lm of (sec.landmarks || [])) {
        const spr = S[lm.sprite];
        if (!spr) continue;
        const idx = start + Math.min(len - 1, Math.floor(lm.at * len));
        if (lm.side === 0) this.addSpriteAt(idx, spr, lm.x || 0, lm.sprite, false);
        else this.addSprite(idx, spr, lm.side, lm.offset, lm.sprite);
      }
    });
    // Close the loop vertically: bring the last segment back to y = 0.
    const segs = this.segments;
    const drift = this.lastY();
    if (Math.abs(drift) > 1) {
      const n = segs.length;
      for (let i = 0; i < n; i++) {
        segs[i].p1.world.y -= drift * (i / n);
        segs[i].p2.world.y -= drift * ((i + 1) / n);
      }
    }
    segs[segs.length - 1].p2.world.y = segs[0].p1.world.y;
    // start line + finish colours
    segs[0].isFinish = true;
    segs[1].isFinish = true;
    segs[2].isFinish = true;
  }

  // side: -1 / 1 ; offset beyond the road edge in half-widths.
  addSprite(index, spr, side, offset, name) {
    const hw = spr.w * SPRITE_UNIT / 2;
    const x = side * (1 + offset + hw);
    this.addSpriteAt(index, spr, x, name, true);
  }
  addSpriteAt(index, spr, x, name, collide) {
    const seg = this.segments[index];
    if (!seg) return;
    seg.sprites.push({ img: spr.c, w: spr.w, h: spr.h, x, hw: spr.w * SPRITE_UNIT / 2, collide, name });
  }

  findSegment(z) {
    const n = this.segments.length;
    let i = Math.floor(z / SEG_LENGTH) % n;
    if (i < 0) i += n;
    return this.segments[i];
  }

  sectionAt(index) {
    for (let i = this.sectionStarts.length - 1; i >= 0; i--) if (index >= this.sectionStarts[i].index) return this.sectionStarts[i];
    return this.sectionStarts[0];
  }
}
