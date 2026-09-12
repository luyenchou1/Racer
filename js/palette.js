'use strict';
/* Monaco GT - limited 16-bit style palette.
   Every colour used by the renderer lives here so the whole game reads as one
   consistent palette (in the spirit of a 64-colour SNES/Genesis title). */

const PAL = {
  // Road surfaces (light / dark alternate per segment)
  ROAD_L:   '#7c7c84', ROAD_D:   '#70707a',
  RUMBLE_R: '#d8302c', RUMBLE_W: '#f4f4f4',
  LANE:     '#f0f0e8',
  EDGE:     '#585860',
  // Ground types
  GRASS_L:  '#4aa848', GRASS_D:  '#3e9640',
  PAVE_L:   '#c4b8a4', PAVE_D:   '#b8ac98',
  SEA_L:    '#2a62d0', SEA_D:    '#245ac4',
  SAND_L:   '#e0cc98', SAND_D:   '#d4c08c',
  // Tunnel
  TUN_ROAD_L: '#484850', TUN_ROAD_D: '#404048',
  TUN_LIT_L:  '#8c7850', TUN_LIT_D:  '#806c48',
  TUN_WALL:   '#30303c', TUN_WALL_LIT: '#5c5040',
  TUN_CEIL:   '#1c1c28',
  TUN_LAMP:   '#ffd858',
  TUN_GROUND: '#383840',
  // Sky
  SKY_TOP:  '#1c46b8', SKY_MID: '#3a7ce0', SKY_LOW: '#8cc4f4', SKY_HOR: '#c8e4fc',
  SUN:      '#fff4a0', SUN_HALO: '#ffd870',
  CLOUD:    '#f8f8ff', CLOUD_SH: '#d0dcf0',
  // Horizon layers
  HILL_FAR: '#7c88c8', HILL_MID: '#6874b4', HILL_NEAR: '#586898',
  SEA_FAR:  '#2c5cc8', SEA_SPARK: '#a0c8ff',
  BLDG_L:   '#f0e4cc', BLDG_M: '#d8c8a8', BLDG_D: '#b0a080', BLDG_ROOF: '#5c5878',
  WINDOW:   '#3c5080',
  // Fog blends toward this
  FOG:      '#b4cce8',
  // UI
  WHITE: '#ffffff', BLACK: '#000000', YELLOW: '#f8d820', RED: '#e02828',
  GREEN: '#38d048', ORANGE: '#f89020', CYAN: '#40e0f0', GRAY: '#a0a0a8',
  DARK: '#101020', PANEL: '#181830',
};

// Hex -> [r,g,b]
function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex(r, g, b) {
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}
// Blend two hex colours, t in [0,1]
function mixHex(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex(
    Math.round(A[0] + (B[0] - A[0]) * t),
    Math.round(A[1] + (B[1] - A[1]) * t),
    Math.round(A[2] + (B[2] - A[2]) * t));
}
function shadeHex(a, amt) { // amt -1..1
  const A = hexToRgb(a);
  const f = v => Math.max(0, Math.min(255, Math.round(v + (amt > 0 ? (255 - v) * amt : v * amt))));
  return rgbToHex(f(A[0]), f(A[1]), f(A[2]));
}
