#!/usr/bin/env node
'use strict';
/* Generates icon-192.png and icon-512.png (pixel-art car on a dark tile)
   with a minimal hand-rolled PNG encoder. Run: node tools/make-icons.js */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const CAR = [
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
const LEGEND = {
  K: [16, 16, 24], k: [60, 60, 70], w: [244, 244, 244], r: [224, 32, 32], R: [144, 16, 16], p: [255, 112, 112],
  b: [80, 136, 200], B: [44, 80, 136], x: [255, 48, 48], X: [160, 24, 24], t: [28, 28, 34], T: [58, 58, 66], e: [112, 112, 120],
};

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePNG(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

function makeIcon(size) {
  const img = Buffer.alloc(size * size * 4);
  const set = (x, y, c) => { if (x < 0 || y < 0 || x >= size || y >= size) return; const i = (y * size + x) * 4; img[i] = c[0]; img[i + 1] = c[1]; img[i + 2] = c[2]; img[i + 3] = 255; };
  // background: sky gradient bands + road
  const unit = size / 64;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const t = y / size;
    let c;
    if (t < 0.42) { const b = Math.floor(t / 0.42 * 4); c = [[28, 70, 184], [46, 100, 210], [58, 124, 224], [140, 196, 244]][b]; }
    else {
      // road trapezoid
      const yy = (t - 0.42) / 0.58;
      const half = 0.05 + yy * 0.5;
      const dx = Math.abs(x / size - 0.5);
      if (dx < half) c = ((Math.floor(yy * 8)) & 1) ? [112, 112, 122] : [124, 124, 132];
      else if (dx < half + 0.05) c = ((Math.floor(yy * 8)) & 1) ? [216, 48, 44] : [244, 244, 244];
      else c = ((Math.floor(yy * 8)) & 1) ? [62, 150, 64] : [74, 168, 72];
    }
    set(x, y, c);
  }
  // sun
  const sx = Math.round(size * 0.72), sy = Math.round(size * 0.2), r = size * 0.09;
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r) set(Math.round(sx + x), Math.round(sy + y), [255, 244, 160]);
  // car sprite scaled
  const scale = Math.max(1, Math.floor(size / 48));
  const cw = CAR[0].length * scale, ch = CAR.length * scale;
  const ox = Math.round((size - cw) / 2), oy = Math.round(size * 0.9 - ch);
  for (let y = 0; y < CAR.length; y++) for (let x = 0; x < CAR[y].length; x++) {
    const c = LEGEND[CAR[y][x]]; if (!c) continue;
    for (let yy = 0; yy < scale; yy++) for (let xx = 0; xx < scale; xx++) set(ox + x * scale + xx, oy + y * scale + yy, c);
  }
  // rounded dark frame
  const border = Math.max(2, Math.round(unit * 2));
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (x < border || y < border || x >= size - border || y >= size - border) set(x, y, [16, 16, 32]);
  }
  return encodePNG(size, size, img);
}

const root = path.join(__dirname, '..');
for (const s of [192, 512]) {
  fs.writeFileSync(path.join(root, `icon-${s}.png`), makeIcon(s));
  console.log('wrote icon-' + s + '.png');
}
