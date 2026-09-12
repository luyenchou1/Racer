'use strict';
/* Monaco GT - pixel-art sprite factory.
   All sprites are generated at boot into small offscreen canvases (no image
   files).  Cars are hand-drawn string art with palette recolouring; scenery is
   drawn procedurally with a tiny pixel API but seeded so it looks the same on
   every run. One sprite pixel = 1/100th of the road half-width in world units. */

// ---------- tiny pixel canvas API ----------
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  return { c, g, w, h };
}
function px(s, x, y, col) { s.g.fillStyle = col; s.g.fillRect(x, y, 1, 1); }
function rect(s, x, y, w, h, col) { s.g.fillStyle = col; s.g.fillRect(x, y, w, h); }
function hline(s, x, y, w, col) { rect(s, x, y, w, 1, col); }
function vline(s, x, y, h, col) { rect(s, x, y, 1, h, col); }
function outline(s, x, y, w, h, col) { hline(s, x, y, w, col); hline(s, x, y + h - 1, w, col); vline(s, x, y, h, col); vline(s, x + w - 1, y, h, col); }
function disc(s, cx, cy, r, col) {
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.5) px(s, cx + x, cy + y, col);
}
// Deterministic PRNG so scenery is identical every load.
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ---------- string-art sprites ----------
function fromStrings(rows, legend) {
  const w = Math.max(...rows.map(r => r.length)), h = rows.length;
  const s = makeCanvas(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < rows[y].length; x++) {
    const col = legend[rows[y][x]];
    if (col) px(s, x, y, col);
  }
  return s;
}

// Rear view of a GT car, 36x24. Letters map to a palette (body colours recoloured per car).
const CAR_ART = [
  '..............KKKKKKKK..............',
  '............KKrpppppprKK............',
  '...........KrrKKKKKKKKrrK...........',
  '..........KrKBbbbbbbbbBKrK..........',
  '..........KrKBbbbbbbbbBKrK..........',
  '.........KrrKBBbbbbbbBBKrrK.........',
  '........KrrrrKKKKKKKKKKrrrrK........',
  '.KKKKKKKKrpppppppppppppppprKKKKKKKK.',
  '.KkkkkkkKrrrrrrrrrrrrrrrrrrKkkkkkkK.',
  '..KK...KrrrrrrrrrrrrrrrrrrrrK...KK..',
  '......KrrrrrrrrrrrrrrrrrrrrrrK......',
  '.....KrrppppppppppppppppppppprrK.....',
  '....KrxxrrrrrrrrrrrrrrrrrrrrxxrK....',
  '....KrxXrrrrrKKKKKKKKKKrrrrrXxrK....',
  '....KrRRrrrrrKwwwwwwwwKrrrrrRRrK....',
  '....KRRRRRRRRKKKKKKKKKKRRRRRRRRK....',
  '...KKKKKKKKKKKKKKKKKKKKKKKKKKKKKK...',
  '.KKKKkkkkkkkkkkkkkkkkkkkkkkkkkkKKKK.',
  'KttttKkkkkkkkkkkeeKKeekkkkkkkkKttttK',
  'KtTTtKkkkkkkkkkkKKKKKKkkkkkkkkKtTTtK',
  'KtTTtKKKKKKKKKKKKKKKKKKKKKKKKKKtTTtK',
  'KttttK........................KttttK',
  'KttttK........................KttttK',
  '.KKKK..........................KKKK.',
];
function carLegend(body, dark, hi) {
  return {
    K: '#101018', k: '#3c3c46', g: '#808088', w: '#f4f4f4',
    r: body, R: dark, p: hi,
    b: '#5088c8', B: '#2c5088', x: '#ff3030', X: '#a01818', y: '#ffd040',
    t: '#1c1c22', T: '#3a3a42', e: '#707078',
  };
}
// Yawed variant: cabin slides toward the turn, a sliver of side panel shows on the outside.
function carVariant(dir, legend) {
  const rows = CAR_ART.map((r, y) => {
    if (y <= 6) {
      const shift = dir * (3 - Math.floor(y / 3)); // 3,3,3,2,2,2,1
      return shift > 0 ? '.'.repeat(shift) + r.slice(0, r.length - shift) : r.slice(-shift) + '.'.repeat(-shift);
    }
    if (y >= 10 && y <= 15) {
      // add a side strip on the outside of the turn
      const a = r.split('');
      if (dir < 0) { // turning left: right side visible
        const i = a.lastIndexOf('K', a.length - 3); if (i > 0) { a[i] = 'R'; a[i + 1] = 'K'; }
      } else {
        const i = a.indexOf('K'); if (i >= 0 && i < a.length - 1) { a[i] = 'K'; a[i + 1] = 'R'; }
      }
      return a.join('');
    }
    return r;
  });
  return fromStrings(rows, legend);
}

const CAR_COLOURS = {
  red:    ['#e02020', '#901010', '#ff7070'],
  blue:   ['#2858e0', '#182c88', '#7898ff'],
  yellow: ['#f0c800', '#a08000', '#fff080'],
  green:  ['#20b040', '#106020', '#70e880'],
  white:  ['#e8e8f0', '#9898a8', '#ffffff'],
  purple: ['#9030d0', '#501078', '#c880ff'],
  orange: ['#f07818', '#984408', '#ffb870'],
  black:  ['#383840', '#181820', '#686878'],
};

const Sprites = {
  all: {},
  cars: {},

  build() {
    // ----- cars -----
    for (const name in CAR_COLOURS) {
      const [body, dark, hi] = CAR_COLOURS[name];
      const legend = carLegend(body, dark, hi);
      this.cars[name] = {
        straight: fromStrings(CAR_ART, legend),
        left: carVariant(-1, legend),
        right: carVariant(1, legend),
      };
    }
    const A = this.all;
    const R = mulberry32(1234);
    // ----- scenery -----
    A.palm1 = this.palm(R, 0);
    A.palm2 = this.palm(R, 1);
    A.palm3 = this.palm(R, 2);
    A.pine1 = this.pine(R, 0);
    A.pine2 = this.pine(R, 1);
    A.bldg1 = this.building(R, 84, 120, '#f0e4cc', '#c8b898');
    A.bldg2 = this.building(R, 100, 140, '#f4e8d8', '#d0b8a0');
    A.bldg3 = this.building(R, 76, 105, '#e8dcc8', '#c0a888');
    A.bldg4 = this.building(R, 110, 150, '#f8f0e0', '#d8c4a4');
    A.bldg5 = this.building(R, 90, 128, '#f0d8c0', '#c89c80');
    A.hotel = this.hotel(R);
    A.casino = this.casino(R);
    A.chapel = this.chapel(R);
    A.grandstand = this.grandstand(R, 150, 76);
    A.grandstand2 = this.grandstand(R, 110, 64);
    A.bill1 = this.billboard('PIXEL OIL', '#f0f0f0', '#d02020', '#181818');
    A.bill2 = this.billboard('TURBO', '#1838a0', '#f8d820', '#f8d820');
    A.bill3 = this.billboard('GT TYRES', '#181818', '#f8f8f8', '#e03020');
    A.bill4 = this.billboard('RIVIERA', '#20a0c0', '#ffffff', '#ffffff');
    A.bill5 = this.billboard('MONACO GP', '#e02020', '#ffffff', '#ffffff');
    A.bill6 = this.billboard('PISCINE', '#40b8e0', '#ffffff', '#104060');
    A.tyres = this.tyrewall(R);
    A.lamp = this.streetlamp();
    A.gantry = this.gantry();
    A.yacht1 = this.yacht(R, 70, '#f8f8f8', '#2040a0');
    A.yacht2 = this.yacht(R, 96, '#f8f8f8', '#c02020');
    A.yacht3 = this.yacht(R, 56, '#f0f0e0', '#208040');
    A.pool = this.poolstand(R);
    A.hairpinhotel = this.hairpinHotel(R);
    A.marshal = this.marshalPost(R);
    A.cone = this.cone();
    return this;
  },

  // ---------- individual generators ----------
  palm(R, v) {
    const s = makeCanvas(64, 96);
    const cx = 32, base = 95, top = 34 + v * 4;
    // trunk with a slight lean
    const lean = v === 1 ? -1 : (v === 2 ? 1 : 0);
    for (let y = base; y >= top; y--) {
      const t = (base - y) / (base - top);
      const x = Math.round(cx + lean * t * 6);
      rect(s, x - 2, y, 5, 1, '#8c6034');
      px(s, x - 2, y, '#5c3c20'); px(s, x + 2, y, '#5c3c20');
      if (y % 4 === 0) hline(s, x - 2, y, 5, '#6c4828');
    }
    const tx = cx + lean * 6, ty = top;
    // fronds
    const fronds = [[-1, -0.5], [1, -0.5], [-1, -0.05], [1, -0.05], [-0.7, 0.4], [0.7, 0.4], [0, -0.9]];
    for (const [dx, dy] of fronds) {
      for (let i = 0; i < 26; i++) {
        const t = i / 26;
        const x = Math.round(tx + dx * i), y = Math.round(ty + dy * i * 0.6 + t * t * 14);
        rect(s, x - 1, y, 3, 2, i < 18 ? '#2c8c34' : '#1c6424');
        if (i % 3 === 0) { px(s, x, y - 1, '#48b848'); px(s, x, y + 2, '#1c5c20'); }
      }
    }
    disc(s, tx, ty + 3, 4, '#2c8c34');
    px(s, tx - 2, ty + 5, '#8c5820'); px(s, tx + 1, ty + 6, '#8c5820'); px(s, tx, ty + 4, '#a06828');
    return s;
  },

  pine(R, v) {
    const w = 40, h = 70 + v * 10;
    const s = makeCanvas(w, h);
    rect(s, 18, h - 14, 4, 14, '#5c3c20');
    for (let y = 4; y < h - 12; y++) {
      const t = (y - 4) / (h - 16);
      const hw = Math.round(2 + t * 17 + Math.sin(y * 1.7 + v) * 2);
      hline(s, 20 - hw, y, hw * 2, y % 6 < 3 ? '#1c6428' : '#247830');
      px(s, 20 - hw + 1, y, '#30904c');
    }
    return s;
  },

  building(R, w, h, wall, trim) {
    const s = makeCanvas(w, h);
    const roofH = 14;
    // mansard roof
    for (let y = 0; y < roofH; y++) {
      const inset = Math.round((roofH - y) * 0.6);
      hline(s, inset, y, w - inset * 2, y % 2 ? '#4c4868' : '#5c5878');
    }
    hline(s, 0, roofH, w, '#f8f0e0');
    hline(s, 0, roofH + 1, w, trim);
    rect(s, 0, roofH + 2, w, h - roofH - 2, wall);
    // dormer windows
    for (let x = 6; x < w - 8; x += 16) rect(s, x, 5, 5, 7, '#3c5080');
    // floors
    const floors = Math.floor((h - roofH - 20) / 18);
    for (let f = 0; f < floors; f++) {
      const fy = roofH + 6 + f * 18;
      hline(s, 0, fy + 13, w, trim); // cornice / balcony line
      hline(s, 0, fy + 14, w, '#8c8070');
      for (let x = 4; x < w - 6; x += 12) {
        rect(s, x, fy, 6, 10, '#3c5080');
        px(s, x + 1, fy + 1, '#8cb0e0');
        vline(s, x + 3, fy, 10, '#e8e0d0');
        // wrought-iron balcony
        for (let bx = x - 1; bx < x + 8; bx += 2) px(s, bx, fy + 12, '#404040');
        hline(s, x - 1, fy + 11, 9, '#303030');
      }
    }
    // ground floor: arches + striped awnings
    const gy = h - 18;
    for (let x = 3; x < w - 8; x += 14) {
      rect(s, x, gy + 4, 8, 14, '#2c3c60');
      hline(s, x + 1, gy + 3, 6, '#2c3c60');
      const red = (Math.floor(x / 14) % 2) === 0;
      for (let ax = -1; ax < 11; ax++) px(s, x + ax, gy + 1, ax % 2 ? '#f8f8f8' : (red ? '#d03030' : '#3060c0'));
      hline(s, x - 1, gy + 2, 11, red ? '#a02020' : '#204090');
    }
    outline(s, 0, roofH + 2, w, h - roofH - 2, '#9c9080');
    return s;
  },

  hotel(R) {
    const w = 160, h = 130;
    const s = makeCanvas(w, h);
    // grand Belle Époque hotel: central dome + two wings
    rect(s, 0, 30, w, h - 30, '#f6ecd8');
    for (let y = 0; y < 20; y++) { const hw = Math.round(Math.sqrt(1 - Math.pow(1 - y / 20, 2)) * 26); hline(s, 80 - hw, 10 + y, hw * 2, y % 2 ? '#3c8878' : '#4c9c88'); }
    rect(s, 54, 30, 52, 6, '#d8c8a8');
    for (let y = 22; y < 30; y++) hline(s, 0, y, 50, y % 2 ? '#4c4868' : '#5c5878');
    for (let y = 22; y < 30; y++) hline(s, 110, y, 50, y % 2 ? '#4c4868' : '#5c5878');
    px(s, 80, 8, '#f8d820'); px(s, 80, 9, '#f8d820');
    for (let f = 0; f < 5; f++) {
      const fy = 38 + f * 17;
      hline(s, 0, fy + 13, w, '#c8b898');
      for (let x = 5; x < w - 6; x += 11) {
        rect(s, x, fy, 5, 10, '#3c5080'); px(s, x + 1, fy + 1, '#8cb0e0');
        hline(s, x - 1, fy + 11, 7, '#303030');
      }
    }
    // canopy + entrance
    rect(s, 60, h - 20, 40, 3, '#c02020');
    rect(s, 66, h - 17, 28, 17, '#2c3c60');
    rect(s, 78, h - 12, 4, 12, '#f8d820');
    // flags
    for (let x = 20; x < w; x += 40) { vline(s, x, 0, 24, '#c0c0c0'); rect(s, x + 1, 2, 7, 4, x % 80 ? '#e02020' : '#f8f8f8'); }
    outline(s, 0, 30, w, h - 30, '#a89880');
    Font.draw(s.g, 'HOTEL DE PARIS', 80, 31, { color: '#8c6820', align: 'center' });
    return s;
  },

  casino(R) {
    const w = 200, h = 140;
    const s = makeCanvas(w, h);
    const wall = '#f4e8d0', trim = '#d0b888';
    // two towers with green copper caps
    for (const tx of [10, 150]) {
      rect(s, tx, 30, 40, h - 30, wall);
      for (let y = 0; y < 22; y++) { const inset = Math.round((22 - y) * 0.8); hline(s, tx + inset, 8 + y, 40 - inset * 2, y % 2 ? '#3c8878' : '#4c9c88'); }
      vline(s, tx + 20, 0, 8, '#c0c0c0'); rect(s, tx + 21, 1, 6, 4, '#e02020');
      for (let f = 0; f < 5; f++) { const fy = 36 + f * 20; rect(s, tx + 8, fy, 8, 12, '#3c5080'); rect(s, tx + 24, fy, 8, 12, '#3c5080'); hline(s, tx + 6, fy + 13, 28, trim); }
    }
    // central block
    rect(s, 50, 44, 100, h - 44, wall);
    for (let y = 0; y < 14; y++) { const inset = Math.round((14 - y) * 0.5); hline(s, 50 + inset, 30 + y, 100 - inset * 2, y % 2 ? '#4c4868' : '#5c5878'); }
    // clock
    disc(s, 100, 37, 5, '#f8f8f8'); outline(s, 95, 32, 11, 11, '#404040'); vline(s, 100, 34, 3, '#202020'); hline(s, 100, 37, 3, '#202020');
    hline(s, 50, 44, 100, '#f8f8f8'); hline(s, 50, 45, 100, trim);
    // grand arched windows
    for (let f = 0; f < 2; f++) {
      const fy = 52 + f * 30;
      for (let x = 56; x < 146; x += 15) {
        rect(s, x, fy, 9, 20, '#3c5080'); hline(s, x + 1, fy - 1, 7, '#3c5080'); hline(s, x + 2, fy - 2, 5, '#3c5080');
        px(s, x + 2, fy + 2, '#8cb0e0'); hline(s, x - 1, fy + 21, 11, '#8c7850');
      }
    }
    // entrance canopy with lights
    rect(s, 70, h - 26, 60, 4, '#3c8878');
    for (let x = 72; x < 130; x += 6) px(s, x, h - 27, '#fff0a0');
    rect(s, 85, h - 22, 30, 22, '#2c3c60');
    rect(s, 97, h - 16, 6, 16, '#f8d820');
    outline(s, 50, 44, 100, h - 44, '#b8a480');
    Font.draw(s.g, 'CASINO', 100, 112, { color: '#c89020', align: 'center', scale: 1 });
    Font.draw(s.g, 'MONTE-CARLO', 100, 121, { color: '#8c6820', align: 'center', scale: 1 });
    // palms out front
    return s;
  },

  chapel(R) {
    const w = 60, h = 90;
    const s = makeCanvas(w, h);
    // bell tower
    rect(s, 40, 20, 16, 70, '#f0e4c8');
    for (let y = 0; y < 14; y++) { const i = Math.round((14 - y) * 0.55); hline(s, 40 + i, 6 + y, 16 - i * 2, '#c86030'); }
    vline(s, 48, 0, 6, '#c0c0c0'); hline(s, 46, 2, 5, '#c0c0c0');
    rect(s, 45, 26, 6, 10, '#2c3c60'); hline(s, 46, 25, 4, '#2c3c60');
    // nave
    rect(s, 2, 44, 42, 46, '#f4e8d0');
    for (let y = 0; y < 12; y++) hline(s, 2 + Math.round((12 - y) * 0.3), 32 + y, 42 - Math.round((12 - y) * 0.6), y % 2 ? '#c86030' : '#d87040');
    rect(s, 18, 62, 10, 28, '#5c3c20'); hline(s, 19, 61, 8, '#5c3c20');
    disc(s, 23, 52, 4, '#3c5080'); px(s, 23, 52, '#f8d820');
    vline(s, 23, 22, 8, '#8c7850'); hline(s, 21, 24, 5, '#8c7850');
    outline(s, 2, 44, 42, 46, '#b0a080');
    return s;
  },

  grandstand(R, w, h) {
    const s = makeCanvas(w, h);
    const rows = 6, rowH = Math.floor((h - 18) / rows);
    const skins = ['#f0c8a0', '#c89060', '#8c5830'];
    const shirts = ['#e02020', '#f8f8f8', '#2050e0', '#f8d820', '#20a040', '#ff80c0', '#101010', '#ff8020'];
    // roof
    rect(s, 0, 0, w, 6, '#e8e8f0'); hline(s, 0, 6, w, '#9898a8');
    for (let x = 6; x < w; x += 24) vline(s, x, 6, h - 6, '#a0a0a8');
    for (let r = 0; r < rows; r++) {
      const y = 10 + r * rowH;
      rect(s, 0, y, w, rowH, r % 2 ? '#7c7c8c' : '#8c8c9c');
      for (let x = 1; x < w - 1; x += 3) {
        if (R() < 0.88) {
          const sc = shirts[Math.floor(R() * shirts.length)];
          rect(s, x, y + 2, 2, rowH - 2, sc);
          px(s, x, y + 1, skins[Math.floor(R() * skins.length)]);
          if (R() < 0.15) rect(s, x, y - 1, 2, 2, '#e02020'); // flag / banner
        }
      }
    }
    // front barrier with sponsor stripe
    rect(s, 0, h - 8, w, 8, '#f8f8f8');
    rect(s, 0, h - 6, w, 4, '#d02020');
    Font.draw(s.g, 'MONACO', w / 2, h - 8, { color: '#f8f8f8', align: 'center' });
    return s;
  },

  poolstand(R) {
    const w = 130, h = 60;
    const s = makeCanvas(w, h);
    // modern stand around the swimming pool: blue glass + white steel
    rect(s, 0, 8, w, h - 8, '#48a8d8');
    for (let y = 8; y < h; y += 4) hline(s, 0, y, w, '#3890c0');
    for (let x = 0; x < w; x += 10) vline(s, x, 8, h - 8, '#e8f0f8');
    rect(s, 0, 0, w, 8, '#f0f0f8'); hline(s, 0, 8, w, '#8090a0');
    // crowd on top
    for (let x = 2; x < w; x += 3) if (R() < 0.8) { rect(s, x, 2, 2, 5, ['#e02020', '#f8f8f8', '#2050e0', '#f8d820'][Math.floor(R() * 4)]); px(s, x, 1, '#f0c8a0'); }
    Font.draw(s.g, 'PISCINE', w / 2, h - 12, { color: '#ffffff', align: 'center' });
    return s;
  },

  hairpinHotel(R) {
    const w = 180, h = 110;
    const s = makeCanvas(w, h);
    rect(s, 0, 16, w, h - 16, '#f0e8dc');
    hline(s, 0, 16, w, '#c0c0c8');
    for (let f = 0; f < 5; f++) {
      const fy = 20 + f * 18;
      rect(s, 0, fy + 12, w, 4, '#e0d8cc'); hline(s, 0, fy + 16, w, '#a8a098');
      for (let x = 4; x < w - 4; x += 9) { rect(s, x, fy, 6, 11, '#2c4c80'); px(s, x + 1, fy + 1, '#8cb0e0'); }
    }
    rect(s, 0, 0, w, 16, '#d8d0c4');
    Font.draw(s.g, 'FAIRMONT', w / 2, 1, { color: '#204080', align: 'center', scale: 2 });
    for (let x = 2; x < w; x += 6) px(s, x, 0, '#f8d820');
    return s;
  },

  billboard(text, bg, fg, border) {
    const w = Math.max(96, Font.width(text, 2) + 24), h = 70;
    const s = makeCanvas(w, h);
    rect(s, 0, 0, w, 44, bg);
    outline(s, 0, 0, w, 44, border);
    outline(s, 2, 2, w - 4, 40, '#f8f8f8');
    Font.draw(s.g, text, w / 2, 15, { color: fg, align: 'center', scale: 2 });
    // legs
    rect(s, 10, 44, 5, 26, '#585860'); rect(s, w - 15, 44, 5, 26, '#585860');
    hline(s, 10, 54, w - 20, '#585860');
    return s;
  },

  tyrewall(R) {
    const w = 44, h = 30;
    const s = makeCanvas(w, h);
    for (let row = 0; row < 3; row++) {
      const y = h - 5 - row * 9;
      const off = row % 2 ? 5 : 0;
      for (let x = 5 + off; x < w - 4; x += 10) {
        const painted = ((x + row) % 3) === 0;
        disc(s, x, y, 4, painted ? (row % 2 ? '#f0f0f0' : '#e03030') : '#282830');
        disc(s, x, y, 2, '#404048');
        px(s, x - 2, y - 2, '#606068');
      }
    }
    return s;
  },

  streetlamp() {
    const s = makeCanvas(14, 80);
    rect(s, 6, 8, 3, 72, '#585868'); px(s, 6, 20, '#787888');
    for (let i = 0; i < 6; i++) px(s, 8 + i, 7 - Math.floor(i / 2), '#585868');
    rect(s, 10, 3, 4, 4, '#fff0a0'); px(s, 11, 4, '#ffffff');
    return s;
  },

  marshalPost(R) {
    const s = makeCanvas(24, 40);
    rect(s, 2, 14, 20, 26, '#e8e8e8'); outline(s, 2, 14, 20, 26, '#606060');
    rect(s, 6, 20, 12, 8, '#3c5080');
    vline(s, 12, 0, 14, '#404040'); rect(s, 13, 2, 8, 5, '#f8d820');
    rect(s, 2, 34, 20, 6, '#e03030');
    return s;
  },

  cone() {
    const s = makeCanvas(8, 12);
    for (let y = 0; y < 10; y++) hline(s, 4 - Math.floor(y / 3), y, 1 + Math.floor(y / 3) * 2, y > 3 && y < 6 ? '#f8f8f8' : '#ff7010');
    rect(s, 0, 10, 8, 2, '#c05010');
    return s;
  },

  yacht(R, w, hull, stripe) {
    const h = Math.round(w * 0.55);
    const s = makeCanvas(w, h);
    const hy = h - 10;
    for (let y = 0; y < 10; y++) hline(s, Math.round(y * 0.6), hy + y, w - Math.round(y * 1.4), y < 2 ? '#ffffff' : hull);
    hline(s, 2, hy + 4, w - 8, stripe);
    for (let x = 6; x < w - 8; x += 5) px(s, x, hy + 2, '#3c5080');
    // cabin
    rect(s, Math.round(w * 0.3), hy - 8, Math.round(w * 0.42), 8, '#f0f0f0');
    for (let x = Math.round(w * 0.32); x < w * 0.7; x += 4) rect(s, x, hy - 6, 2, 3, '#2c4c80');
    rect(s, Math.round(w * 0.35), hy - 12, Math.round(w * 0.25), 4, '#e8e8f0');
    // mast + radar
    vline(s, Math.round(w * 0.5), 0, hy - 12, '#c0c0c8');
    px(s, Math.round(w * 0.5) + 1, 1, '#e02020');
    return s;
  },

  gantry() {
    const w = 320, h = 96;
    const s = makeCanvas(w, h);
    // lattice pillars
    for (const x of [0, w - 14]) {
      rect(s, x, 30, 14, h - 30, '#c8c8d0'); outline(s, x, 30, 14, h - 30, '#606068');
      for (let y = 34; y < h - 4; y += 6) { hline(s, x + 1, y, 12, '#8c8c98'); px(s, x + 4, y + 3, '#8c8c98'); px(s, x + 9, y + 3, '#8c8c98'); }
    }
    // cross beam
    rect(s, 0, 0, w, 32, '#f0f0f4'); outline(s, 0, 0, w, 32, '#505058');
    rect(s, 2, 2, w - 4, 6, '#e02020');
    for (let x = 4; x < w - 4; x += 8) rect(s, x, 3, 4, 4, '#ffffff');
    Font.draw(s.g, 'MONACO GRAND PRIX', w / 2, 12, { color: '#181830', align: 'center', scale: 2 });
    // start light rig under beam
    rect(s, w / 2 - 26, 32, 52, 12, '#202028');
    for (let i = 0; i < 5; i++) disc(s, w / 2 - 20 + i * 10, 38, 3, '#601010');
    return s;
  },
};

// Colour helpers for cars to draw their turbo flames / brake lights on top.
Sprites.carVariant = function (colour, dir) {
  const c = this.cars[colour] || this.cars.red;
  return dir < 0 ? c.left : (dir > 0 ? c.right : c.straight);
};
