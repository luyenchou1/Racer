'use strict';
/* Monaco GT - pseudo-3D renderer.
   Everything is drawn into a low-resolution offscreen buffer (about 290 px
   wide on a phone) and blitted to the display canvas with image smoothing
   off, so every pixel is a crisp 4x4 block. The road is drawn one scanline at
   a time with integer fillRects: no anti-aliasing, hard stair-stepped edges,
   exactly like a 16-bit console. */

const DRAW_DIST = 200;      // segments
const FOG_LEVELS = 6;
const FOG_START = 0.45;     // fraction of draw distance where fog starts
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.dctx = canvas.getContext('2d', { alpha: false });
    this.buf = document.createElement('canvas');
    this.ctx = this.buf.getContext('2d', { alpha: false });
    this.fov = 100;
    this.cameraDepth = 1 / Math.tan((this.fov / 2) * Math.PI / 180);
    this.roadWidth = ROAD_WIDTH;
    this.fogCache = new Map();
    this.shake = 0; this.shakeX = 0; this.shakeY = 0;
    this.flash = 0;
    this.particles = [];
    for (let i = 0; i < 96; i++) this.particles.push({ life: 0, x: 0, y: 0, vx: 0, vy: 0, color: '#fff', size: 1, g: 0 });
    this.skyOffset = 0; this.hillOffset = 0; this.cityOffset = 0; this.cloudDrift = 0;
    this.visible = [];
    this.time = 0;
    this.fit();
  }

  // ---------- layout ----------
  fit() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const cssW = Math.max(200, window.innerWidth), cssH = Math.max(200, window.innerHeight);
    const devW = Math.round(cssW * dpr), devH = Math.round(cssH * dpr);
    // integer upscale factor so that the shorter axis is ~256-300 low-res pixels
    let scale = Math.max(1, Math.floor(Math.min(devW, devH) / 270));
    let W = Math.ceil(devW / scale), H = Math.ceil(devH / scale);
    while (W * H > 400000 && scale < 8) { scale++; W = Math.ceil(devW / scale); H = Math.ceil(devH / scale); }
    this.scale = scale; this.W = W; this.H = H; this.dpr = dpr;
    this.buf.width = W; this.buf.height = H;
    this.canvas.width = W * scale; this.canvas.height = H * scale;
    this.canvas.style.width = (W * scale / dpr) + 'px';
    this.canvas.style.height = (H * scale / dpr) + 'px';
    this.ctx.imageSmoothingEnabled = false;
    this.dctx.imageSmoothingEnabled = false;
    this.portrait = H > W;
    // Landscape is the primary layout: the scene fills the screen and the HUD /
    // controls float over it. Portrait keeps a dashboard under the scene.
    this.dashH = this.portrait ? Math.round(H * 0.40) : 0;
    this.sceneH = H - this.dashH;
    this.horizonY = Math.round(this.sceneH * (this.portrait ? 0.40 : 0.37));
    this.f = W / 2;
    // camera height so the road fills ~1.7 screen widths at the bottom of the
    // scene in portrait; a wide 19.5:9 screen wants a narrower road (about
    // 1.1 widths) so the corners ahead read properly
    this.roadBottom = this.portrait ? 0.85 : 0.56;
    this.cameraHeight = (this.sceneH - this.horizonY) * this.roadWidth / (this.roadBottom * W);
    this.playerY = this.sceneH - Math.round(this.sceneH * 0.035);
    this.playerZ = this.cameraDepth * this.cameraHeight * this.f / (this.playerY - this.horizonY);
    this.playerScale = this.cameraDepth / this.playerZ;
    this.buildSky();
    this.buildLayers();
  }

  // ---------- backgrounds (built once per fit) ----------
  buildSky() {
    const W = this.W, H = this.horizonY + 2;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    const img = g.createImageData(W, H);
    const keys = [PAL.SKY_TOP, PAL.SKY_MID, PAL.SKY_LOW, PAL.SKY_HOR];
    const steps = [];
    for (let i = 0; i < 12; i++) {
      const t = i / 11 * 3, k = Math.min(2, Math.floor(t)), fr = t - k;
      steps.push(hexToRgb(mixHex(keys[k], keys[k + 1], fr)));
    }
    const d = img.data;
    for (let y = 0; y < H; y++) {
      const t = Math.pow(y / (H - 1), 0.8) * (steps.length - 1);
      const b = Math.min(steps.length - 2, Math.floor(t)), fr = t - b;
      for (let x = 0; x < W; x++) {
        const th = BAYER4[(y & 3) * 4 + (x & 3)] / 16;
        const col = fr > th ? steps[b + 1] : steps[b];
        const i = (y * W + x) * 4;
        d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    // sun with dithered halo
    const sx = Math.round(W * 0.7), sy = Math.round(H * 0.34), r = Math.max(6, Math.round(W * 0.045));
    const s = { g, w: W, h: H };
    for (let ring = 3; ring >= 1; ring--) {
      const rr = r + ring * Math.max(2, Math.round(r * 0.35));
      for (let y = -rr; y <= rr; y++) for (let x = -rr; x <= rr; x++) {
        if (x * x + y * y <= rr * rr && ((x + y + ring) & 1) === 0 && BAYER4[((y & 3) * 4) + (x & 3)] < 6 + ring * 3) px(s, sx + x, sy + y, ring === 1 ? PAL.SUN_HALO : mixHex(PAL.SUN_HALO, PAL.SKY_MID, ring / 4));
      }
    }
    disc(s, sx, sy, r, PAL.SUN);
    disc(s, sx - 1, sy - 1, Math.max(1, r - 3), '#ffffff');
    this.skyImg = c;
    this.sunX = sx; this.sunY = sy;
  }

  buildLayers() {
    const W = this.W, LW = Math.max(512, W * 2), hor = this.horizonY;
    const R = mulberry32(99);
    // --- clouds ---
    {
      const h = Math.max(24, Math.round(hor * 0.5));
      const s = makeCanvas(LW, h);
      for (let i = 0; i < 9; i++) {
        const cx = Math.floor(R() * LW), cy = Math.floor(6 + R() * (h - 14)), n = 3 + Math.floor(R() * 4);
        for (let k = 0; k < n; k++) {
          const rx = Math.floor(3 + R() * 7), ox = Math.floor((k - n / 2) * 6), oy = Math.floor(R() * 3);
          disc(s, cx + ox, cy + oy, rx, PAL.CLOUD);
          disc(s, cx + ox, cy + oy + 2, rx, PAL.CLOUD);
          hline(s, cx + ox - rx, cy + oy + rx, rx * 2, PAL.CLOUD_SH);
        }
      }
      this.cloudLayer = s;
    }
    // --- far mountains (Alpes-Maritimes) ---
    {
      const h = Math.max(24, Math.round(hor * 0.5));
      const s = makeCanvas(LW, h);
      let y = h * 0.55;
      const pts = [];
      for (let x = 0; x <= LW; x += 8) { y += (R() - 0.5) * 10; y = Math.max(h * 0.2, Math.min(h * 0.85, y)); pts.push(y); }
      // wrap seam
      pts[pts.length - 1] = pts[0];
      for (let x = 0; x < LW; x++) {
        const i = Math.floor(x / 8), t = (x % 8) / 8;
        const yy = Math.round(pts[i] + (pts[i + 1] - pts[i]) * t);
        vline(s, x, yy, h - yy, PAL.HILL_FAR);
        if (((x + yy) & 3) === 0) px(s, x, yy, mixHex(PAL.HILL_FAR, '#ffffff', 0.35));
      }
      let y2 = h * 0.75; const pts2 = [];
      for (let x = 0; x <= LW; x += 6) { y2 += (R() - 0.5) * 8; y2 = Math.max(h * 0.45, Math.min(h * 0.95, y2)); pts2.push(y2); }
      pts2[pts2.length - 1] = pts2[0];
      for (let x = 0; x < LW; x++) {
        const i = Math.floor(x / 6), t = (x % 6) / 6;
        const yy = Math.round(pts2[i] + (pts2[i + 1] - pts2[i]) * t);
        vline(s, x, yy, h - yy, PAL.HILL_MID);
      }
      this.hillLayer = s;
    }
    // --- Monte Carlo hillside skyline + sea strip ---
    {
      const h = Math.max(24, Math.round(hor * 0.36));
      const s = makeCanvas(LW, h);
      const seaH = Math.max(4, Math.round(h * 0.22));
      // hillside greenery
      for (let x = 0; x < LW; x++) { const yy = Math.round(h * 0.45 + Math.sin(x * 0.02) * h * 0.08 + Math.sin(x * 0.11) * 2); vline(s, x, yy, h - seaH - yy, PAL.HILL_NEAR); }
      // buildings climbing the hill: two staggered rows so the skyline is
      // busy but low, with greenery and the mountains showing behind
      for (let row = 0; row < 2; row++) {
        let x = Math.floor(R() * 10);
        while (x < LW) {
          const bw = 5 + Math.floor(R() * 10), bh = 4 + Math.floor(R() * (h * (row ? 0.3 : 0.2)));
          const by = h - seaH - bh - (row ? Math.floor(R() * 3) : 4 + Math.floor(R() * (h * 0.22)));
          const col = [PAL.BLDG_L, PAL.BLDG_M, '#e8dcc8', '#f4ecd8', '#f0d8c0'][Math.floor(R() * 5)];
          rect(s, x, by, bw, bh, col);
          vline(s, x + bw - 1, by, bh, PAL.BLDG_D);
          hline(s, x, by, bw, R() < 0.3 ? '#c86030' : PAL.BLDG_ROOF);
          for (let wy = by + 2; wy < by + bh - 1; wy += 3) for (let wx = x + 1; wx < x + bw - 1; wx += 3) if (R() < 0.6) px(s, wx, wy, PAL.WINDOW);
          if (row && R() < 0.12) { vline(s, x + Math.floor(bw / 2), by - 4, 4, '#c0c0c8'); }
          x += bw + (row ? 1 + Math.floor(R() * 6) : 4 + Math.floor(R() * 14));
          if (R() < 0.25) { const t = x - 2, ty = h - seaH - 3 - Math.floor(R() * 5); disc(s, t, ty, 2, '#2c8c34'); vline(s, t, ty + 2, 3, '#5c3c20'); }
        }
      }
      // the Prince's palace on the Rock (a wider cream block with towers) - every LW/2
      for (const px0 of [Math.floor(LW * 0.15), Math.floor(LW * 0.65)]) {
        const bw = 36, bh = Math.round(h * 0.42), by = h - seaH - bh - 6;
        rect(s, px0, by, bw, bh, '#f8f0dc'); hline(s, px0, by, bw, PAL.BLDG_ROOF);
        rect(s, px0 + 2, by - 6, 6, 6, '#f0e4cc'); rect(s, px0 + bw - 8, by - 6, 6, 6, '#f0e4cc');
        hline(s, px0 + 2, by - 7, 6, '#c86030'); hline(s, px0 + bw - 8, by - 7, 6, '#c86030');
        for (let wy = by + 3; wy < by + bh - 2; wy += 4) for (let wx = px0 + 2; wx < px0 + bw - 2; wx += 4) px(s, wx, wy, PAL.WINDOW);
      }
      // sea strip with sparkle + a few distant yachts
      rect(s, 0, h - seaH, LW, seaH, PAL.SEA_FAR);
      for (let i = 0; i < LW / 3; i++) { const sx = Math.floor(R() * LW), sy = h - seaH + Math.floor(R() * seaH); if ((sx + sy) & 1) px(s, sx, sy, PAL.SEA_SPARK); }
      for (let i = 0; i < 6; i++) {
        const sx = Math.floor(R() * LW), sy = h - seaH + 1 + Math.floor(R() * (seaH - 3));
        hline(s, sx, sy, 5, '#ffffff'); hline(s, sx + 1, sy + 1, 3, '#d0d0d8'); px(s, sx + 2, sy - 1, '#ffffff');
      }
      this.cityLayer = s;
    }
  }

  // ---------- helpers ----------
  fog(hex, level) {
    if (level <= 0) return hex;
    const key = hex + level;
    let c = this.fogCache.get(key);
    if (!c) { c = mixHex(hex, PAL.FOG, level / FOG_LEVELS * 0.85); this.fogCache.set(key, c); }
    return c;
  }
  dark(hex, level) {
    if (level <= 0) return hex;
    const key = 'd' + hex + level;
    let c = this.fogCache.get(key);
    if (!c) { c = mixHex(hex, '#000000', level / FOG_LEVELS * 0.9); this.fogCache.set(key, c); }
    return c;
  }
  project(p, cameraX, cameraY, cameraZ) {
    p.camera.x = p.world.x - cameraX;
    p.camera.y = p.world.y - cameraY;
    p.camera.z = p.world.z - cameraZ;
    const s = this.cameraDepth / p.camera.z;
    p.screen.scale = s;
    p.screen.x = Math.round(this.f + s * p.camera.x * this.f);
    p.screen.y = Math.round(this.horizonY - s * p.camera.y * this.f);
    p.screen.w = Math.round(s * this.roadWidth * this.f);
  }
  spawn(x, y, vx, vy, life, color, size, g = 0) {
    for (const p of this.particles) {
      if (p.life > 0) continue;
      p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = life; p.maxLife = life; p.color = color; p.size = size; p.g = g;
      return;
    }
  }
  addShake(v) { this.shake = Math.min(12, this.shake + v); }

  // Draw a sprite scaled by projection scale, anchored bottom-centre, clipped at clipY.
  drawSprite(img, sw, sh, scale, cx, bottomY, clipY, alpha) {
    const k = scale * this.roadWidth * this.f * SPRITE_UNIT;
    const dw = Math.round(sw * k), dh = Math.round(sh * k);
    if (dw < 1 || dh < 1 || dw > this.W * 4) return;
    const x = Math.round(cx - dw / 2), y = bottomY - dh;
    if (x + dw < 0 || x > this.W) return;
    let h = dh;
    if (clipY !== undefined && clipY !== null) h = Math.min(dh, clipY - y);
    if (h <= 0) return;
    const ctx = this.ctx;
    if (alpha !== undefined && alpha < 1) ctx.globalAlpha = alpha;
    ctx.drawImage(img, 0, 0, sw, sh * (h / dh), x, y, dw, h);
    if (alpha !== undefined && alpha < 1) ctx.globalAlpha = 1;
  }

  // ---------- frame ----------
  render(game, dt) {
    this.time += dt;
    const ctx = this.ctx, W = this.W, H = this.H;
    // shake
    if (this.shake > 0) {
      this.shakeX = Math.round((Math.random() * 2 - 1) * this.shake);
      this.shakeY = Math.round((Math.random() * 2 - 1) * this.shake * 0.6);
      this.shake = Math.max(0, this.shake - dt * 22);
    } else { this.shakeX = 0; this.shakeY = 0; }

    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, W, this.sceneH); ctx.clip();
    ctx.translate(this.shakeX, this.shakeY);
    this.drawBackground(game);
    this.drawRoad(game, dt);
    this.drawSprites(game);
    this.drawPlayer(game, dt);
    this.drawEffects(game, dt);
    ctx.restore();

    if (this.dashH > 0) this.drawDash(game);
    game.drawOverlay(ctx, this, dt); // HUD, menus, banners

    if (this.flash > 0) {
      ctx.globalAlpha = Math.min(1, this.flash);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, this.sceneH);
      ctx.globalAlpha = 1;
      this.flash -= dt * 2.5;
    }
    // blit to display, nearest neighbour
    this.dctx.drawImage(this.buf, 0, 0, W, H, 0, 0, W * this.scale, H * this.scale);
  }

  drawBackground(game) {
    const ctx = this.ctx, W = this.W, hor = this.horizonY;
    const inTunnel = game.tunnelFactor;
    ctx.drawImage(this.skyImg, 0, 0);
    // parallax layers
    const layer = (img, offset, y) => {
      const lw = img.w;
      let ox = Math.round(-offset) % lw; if (ox > 0) ox -= lw;
      for (let x = ox; x < W; x += lw) ctx.drawImage(img.c, x, y);
    };
    layer(this.cloudLayer, this.skyOffset + this.cloudDrift, Math.round(hor * 0.06));
    layer(this.hillLayer, this.hillOffset, hor - this.hillLayer.h);
    layer(this.cityLayer, this.cityOffset, hor - this.cityLayer.h + 1);
    // sun glare (only when the sun is visible, outside the tunnel)
    if (inTunnel < 0.5 && game.state !== 'title') {
      const p = 0.8 + 0.2 * Math.sin(this.time * 3);
      ctx.globalAlpha = 0.1 * p;
      ctx.fillStyle = PAL.SUN_HALO;
      const r = Math.round(W * 0.06);
      ctx.fillRect(this.sunX - r, this.sunY - 2, r * 2, 4);
      ctx.fillRect(this.sunX - 2, this.sunY - r, 4, r * 2);
      ctx.globalAlpha = 1;
    }
    // horizon line
    ctx.fillStyle = PAL.HILL_NEAR;
    ctx.fillRect(0, hor, W, 1);
  }

  drawRoad(game, dt) {
    const ctx = this.ctx, W = this.W, f = this.f;
    const track = game.track, segs = track.segments, N = segs.length;
    const pos = game.position, playerX = game.playerX;
    const base = track.findSegment(pos);
    const basePercent = (pos % SEG_LENGTH) / SEG_LENGTH;
    const playerSeg = track.findSegment(pos + this.playerZ);
    const playerPercent = ((pos + this.playerZ) % SEG_LENGTH) / SEG_LENGTH;
    const cameraY = this.cameraHeight + playerSeg.p1.world.y + (playerSeg.p2.world.y - playerSeg.p1.world.y) * playerPercent;
    game.cameraY = cameraY;
    let x = 0, dx = -(base.curve * basePercent);
    let maxy = this.sceneH;
    const cameraInTunnel = base.tunnel;
    const vis = this.visible; vis.length = 0;
    const trackLen = track.length;

    // ---- pass 1: project ----
    for (let n = 0; n < DRAW_DIST; n++) {
      const seg = segs[(base.index + n) % N];
      const looped = seg.index < base.index;
      const camZ = pos - (looped ? trackLen : 0);
      this.project(seg.p1, playerX * this.roadWidth - x, cameraY, camZ);
      this.project(seg.p2, playerX * this.roadWidth - x - dx, cameraY, camZ);
      x += dx; dx += seg.curve;
      seg.clip = maxy;
      seg.visible = false;
      const fr = n / DRAW_DIST;
      seg.fog = fr < FOG_START ? 0 : Math.min(FOG_LEVELS, Math.floor((fr - FOG_START) / (1 - FOG_START) * (FOG_LEVELS + 1)));
      if (seg.p1.camera.z <= this.cameraDepth || seg.p2.screen.y >= seg.p1.screen.y || seg.p2.screen.y >= maxy) continue;
      seg.visible = true;
      vis.push(seg);
      maxy = seg.p2.screen.y;
    }

    // ---- pass 2: ground + road, far to near ----
    for (let i = vis.length - 1; i >= 0; i--) {
      const seg = vis[i];
      const p1 = seg.p1.screen, p2 = seg.p2.screen;
      const y1 = Math.min(p1.y, seg.clip), y2 = p2.y;
      if (y1 <= y2) continue;
      const tunnel = seg.tunnel;
      const fogFn = tunnel ? this.dark : this.fog;
      const L = seg.fog;
      const lit = seg.lit;
      // colours for this segment
      let roadCol, rumbleCol, laneCol;
      if (tunnel) {
        roadCol = fogFn.call(this, lit ? (seg.stripe ? PAL.TUN_LIT_D : PAL.TUN_LIT_L) : (seg.stripe ? PAL.TUN_ROAD_D : PAL.TUN_ROAD_L), L);
        rumbleCol = fogFn.call(this, seg.stripe ? '#606068' : '#8c8c94', L);
        laneCol = fogFn.call(this, '#a0a090', L);
      } else {
        roadCol = fogFn.call(this, seg.stripe ? PAL.ROAD_D : PAL.ROAD_L, L);
        rumbleCol = fogFn.call(this, seg.stripe ? PAL.RUMBLE_R : PAL.RUMBLE_W, L);
        laneCol = fogFn.call(this, PAL.LANE, L);
      }
      const sideL = seg.sideL, sideR = seg.sideR;
      const barrierCol = fogFn.call(this, seg.stripe ? '#9c9ca8' : '#b4b4c0', L);
      const barrierTop = fogFn.call(this, '#e8e8f0', L);

      // tunnel walls and ceiling drawn per segment, before the rows
      if (tunnel) {
        const w1 = p1.w, wallH = Math.max(2, Math.round(w1 * 0.75));
        const left = p1.x - w1, right = p1.x + w1;
        const wallCol = fogFn.call(this, lit ? PAL.TUN_WALL_LIT : PAL.TUN_WALL, L);
        const ceilCol = fogFn.call(this, lit ? '#2c2834' : PAL.TUN_CEIL, L);
        const top = p1.y - wallH;
        const fh = Math.round(w1 * 1.0);
        if (seg.tunnelStart && !cameraInTunnel) {
          // portal facade: the hotel the tunnel runs under, with a dark arch
          const ext = Math.round(w1 * 1.4), fx = left - ext, fw = right - left + ext * 2;
          const fy = top - fh, fhh = fh + Math.round(wallH * 0.3);
          ctx.fillStyle = this.fog('#e8dcc4', L);
          ctx.fillRect(fx, fy, fw, fhh);
          ctx.fillStyle = this.fog('#a89880', L);
          ctx.fillRect(fx, fy, fw, Math.max(1, Math.round(w1 * 0.06)));
          // window rows
          const step = Math.max(3, Math.round(w1 * 0.14)), wh = Math.max(1, Math.round(w1 * 0.08)), ww = Math.max(1, Math.round(w1 * 0.06));
          ctx.fillStyle = this.fog('#3c5080', L);
          for (let wy = fy + Math.round(w1 * 0.14); wy < top - Math.round(w1 * 0.1); wy += step) {
            for (let wx = fx + Math.round(step * 0.5); wx < fx + fw; wx += step) ctx.fillRect(wx, wy, ww, wh);
          }
          ctx.fillStyle = this.fog('#c8b8a0', L);
          for (let wy = fy + Math.round(w1 * 0.14) + wh + 1; wy < top - Math.round(w1 * 0.1); wy += step) ctx.fillRect(fx, wy, fw, 1);
          ctx.fillStyle = this.fog('#181820', L);
          const t = Math.max(1, Math.round(w1 * 0.08));
          ctx.fillRect(left - t, top - t, right - left + t * 2, t);
          ctx.fillRect(left - t, top, t, wallH); ctx.fillRect(right, top, t, wallH);
        }
        // ceiling: only reaches the top of the screen once the camera is inside;
        // from outside, the portal facade is the ceiling of the first segment
        const ceilTop = cameraInTunnel ? 0 : (seg.tunnelStart ? top : Math.max(0, top - Math.round(w1 * 0.8)));
        if (top > ceilTop) {
          const ext = Math.round(w1 * (cameraInTunnel ? 0.6 : 0.2));
          ctx.fillStyle = ceilCol;
          ctx.fillRect(left - ext, ceilTop, right - left + ext * 2, top - ceilTop);
        }
        ctx.fillStyle = wallCol;
        ctx.fillRect(0, top, Math.max(0, left), wallH);
        ctx.fillRect(right, top, Math.max(0, W - right), wallH);
        // wall trim line
        ctx.fillStyle = fogFn.call(this, '#585864', L);
        ctx.fillRect(0, top + Math.round(wallH * 0.5), Math.max(0, left), 1);
        ctx.fillRect(right, top + Math.round(wallH * 0.5), Math.max(0, W - right), 1);
        if (seg.lamp) {
          const lw = Math.max(2, Math.round(w1 * 0.16)), lh = Math.max(1, Math.round(w1 * 0.05));
          ctx.fillStyle = this.dark('#a08040', L); ctx.fillRect(p1.x - lw, top, lw * 2, lh * 2);
          ctx.fillStyle = PAL.TUN_LAMP; ctx.fillRect(p1.x - Math.round(lw / 2), top, lw, lh);
        }
      }

      const rows = y1 - y2;
      for (let y = y2; y < y1; y++) {
        const t = (y - y2) / rows;
        const cx = Math.round(p2.x + (p1.x - p2.x) * t);
        const w = Math.round(p2.w + (p1.w - p2.w) * t);
        const r = Math.max(1, Math.round(w * 0.075));
        const roadL = cx - w, roadR = cx + w;
        // ground bands, left
        let edge = roadL - r;
        for (let b = 0; b < sideL.length && edge > 0; b++) {
          const band = sideL[b];
          const bw = band[2] === Infinity ? edge : Math.round(band[2] * w);
          ctx.fillStyle = fogFn.call(this, seg.stripe ? band[1] : band[0], L);
          ctx.fillRect(Math.max(0, edge - bw), y, Math.min(edge, bw), 1);
          edge -= bw;
        }
        edge = roadR + r;
        for (let b = 0; b < sideR.length && edge < W; b++) {
          const band = sideR[b];
          const bw = band[2] === Infinity ? W - edge : Math.round(band[2] * w);
          ctx.fillStyle = fogFn.call(this, seg.stripe ? band[1] : band[0], L);
          ctx.fillRect(edge, y, bw, 1);
          edge += bw;
        }
        // curbs
        ctx.fillStyle = rumbleCol;
        ctx.fillRect(roadL - r, y, r, 1);
        ctx.fillRect(roadR, y, r, 1);
        // road
        if (seg.isFinish) {
          const cells = 10, cw = (2 * w) / cells;
          for (let c = 0; c < cells; c++) {
            ctx.fillStyle = ((c + (seg.index & 1)) & 1) ? '#f0f0f0' : '#181818';
            ctx.fillRect(Math.round(roadL + c * cw), y, Math.ceil(cw), 1);
          }
        } else {
          ctx.fillStyle = roadCol;
          ctx.fillRect(roadL, y, 2 * w, 1);
          if (!seg.stripe && w > 10) {
            const lw = Math.max(1, Math.round(w * 0.025));
            ctx.fillStyle = laneCol;
            ctx.fillRect(cx - (lw >> 1), y, lw, 1);
          }
        }
        // barriers (Armco) just outside the curbs
        if (seg.barrierL || seg.barrierR) {
          const bh = Math.max(2, Math.round(w * 0.06)), bw = Math.max(1, Math.round(w * 0.03));
          if (seg.barrierL) {
            ctx.fillStyle = barrierCol; ctx.fillRect(roadL - r - bw, y - bh, bw, bh);
            ctx.fillStyle = barrierTop; ctx.fillRect(roadL - r - bw, y - bh, bw, 1);
          }
          if (seg.barrierR) {
            ctx.fillStyle = barrierCol; ctx.fillRect(roadR + r, y - bh, bw, bh);
            ctx.fillStyle = barrierTop; ctx.fillRect(roadR + r, y - bh, bw, 1);
          }
        }
      }
    }
    // parallax movement
    const dz = game.speed * dt;
    const k = base.curve * (dz / SEG_LENGTH);
    this.skyOffset += k * 0.4;
    this.hillOffset += k * 1.0;
    this.cityOffset += k * 2.2;
    this.cloudDrift += dt * 2;
  }

  drawSprites(game) {
    const vis = this.visible, f = this.f;
    for (let i = vis.length - 1; i >= 0; i--) {
      const seg = vis[i];
      const p1 = seg.p1.screen, p2 = seg.p2.screen;
      const alpha = seg.fog >= FOG_LEVELS - 1 ? 0.55 : 1;
      for (let j = 0; j < seg.sprites.length; j++) {
        const s = seg.sprites[j];
        const cx = p1.x + p1.scale * s.x * this.roadWidth * f;
        this.drawSprite(s.img, s.w, s.h, p1.scale, cx, p1.y, seg.clip, alpha);
      }
      for (let j = 0; j < seg.cars.length; j++) {
        const car = seg.cars[j];
        const t = car.percent;
        const scale = p1.scale + (p2.scale - p1.scale) * t;
        const sx = p1.x + (p2.x - p1.x) * t + scale * car.x * this.roadWidth * f;
        const sy = p1.y + (p2.y - p1.y) * t;
        const img = Sprites.carVariant(car.colour, car.steerDir);
        this.drawSprite(img.c, img.w, img.h, scale, sx, sy, seg.clip, alpha);
      }
    }
  }

  drawPlayer(game, dt) {
    if (!game.showPlayer) return;
    const ctx = this.ctx;
    const k = this.playerScale * this.roadWidth * this.f * SPRITE_UNIT;
    const yaw = game.driftYaw || 0;
    const drift = Math.abs(yaw) > 0.4;
    const img = drift ? Sprites.carVariant(game.playerColour, yaw > 0 ? 1 : -1, true) : Sprites.carVariant(game.playerColour, game.steerDir);
    const dw = Math.round(img.w * k), dh = Math.round(img.h * k);
    const bounce = game.bounce;
    // a drifting car sits a little toward the inside of the slide
    const x = Math.round(this.W / 2 - dw / 2 + yaw * 3 * k), y = this.playerY - dh + bounce;
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(x + Math.round(dw * 0.05), this.playerY - Math.round(k * 2), Math.round(dw * 0.9), Math.round(k * 2));
    // turbo flame under the exhausts
    if (game.turboActive) {
      const fl = (Math.floor(this.time * 30) & 1);
      for (const ex of [16, 20]) {
        const fx = x + Math.round(ex * k), fy = y + Math.round(18 * k);
        ctx.fillStyle = fl ? '#ff9020' : '#ffd040';
        ctx.fillRect(fx - Math.round(k), fy, Math.round(k * 2), Math.round(k * (3 + fl * 2)));
        ctx.fillStyle = '#60c0ff';
        ctx.fillRect(fx, fy + Math.round(k * 2), Math.round(k), Math.round(k * 2));
      }
    }
    ctx.drawImage(img.c, x, y, dw, dh);
    // brake lights
    if (game.braking) {
      ctx.fillStyle = '#ff5050';
      ctx.fillRect(x + Math.round(6 * k), y + Math.round(12 * k), Math.round(2 * k), Math.round(2 * k));
      ctx.fillRect(x + Math.round(28 * k), y + Math.round(12 * k), Math.round(2 * k), Math.round(2 * k));
    }
    // drift / off-road smoke and sparks come from the particle system
    if (game.drifting || game.offroad) {
      const col = game.offroad ? '#a89878' : '#e8e8f0';
      // rear wheels; a drift throws thick smoke out of the outside of the slide
      const out = -yaw * 30, n = game.drifting ? 2 : 1;
      for (let i = 0; i < n; i++) {
        if (Math.random() < 0.75) this.spawn(x + Math.round(3 * k) + Math.random() * 3 * k, this.playerY - 2, -12 - Math.random() * 24 + out, -10 - Math.random() * 16, 0.45 + Math.random() * 0.25, col, Math.round(k * (1.5 + Math.random())), -14);
        if (Math.random() < 0.75) this.spawn(x + dw - Math.round(3 * k) - Math.random() * 3 * k, this.playerY - 2, 12 + Math.random() * 24 + out, -10 - Math.random() * 16, 0.45 + Math.random() * 0.25, col, Math.round(k * (1.5 + Math.random())), -14);
      }
    } else if (game.understeer > 0.04) {
      // front tyres scrubbing: a little smoke from the outside front wheel
      const side = game.understeerSide || 1;
      if (Math.random() < 0.5) this.spawn(x + (side > 0 ? dw - Math.round(4 * k) : Math.round(4 * k)), y + Math.round(dh * 0.55), side * (10 + Math.random() * 20), -6 - Math.random() * 8, 0.35, '#d8d8e0', Math.round(k), -10);
    }
  }

  drawEffects(game, dt) {
    const ctx = this.ctx, W = this.W;
    // particles
    for (const p of this.particles) {
      if (p.life <= 0) continue;
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt;
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.maxLife * 1.5));
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
    ctx.globalAlpha = 1;
    // speed lines
    const sp = game.speedPct;
    if (sp > 0.8 && game.state === 'racing') {
      const n = Math.round((sp - 0.8) * 40) + (game.turboActive ? 6 : 0);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      for (let i = 0; i < n; i++) {
        const y = Math.floor(Math.random() * this.sceneH);
        const len = 8 + Math.floor(Math.random() * 24);
        if (Math.random() < 0.5) ctx.fillRect(0, y, len, 1); else ctx.fillRect(W - len, y, len, 1);
      }
    }
    // tunnel darkening at the edges
    if (game.tunnelFactor > 0) {
      ctx.fillStyle = 'rgba(0,0,10,' + (0.35 * game.tunnelFactor).toFixed(2) + ')';
      ctx.fillRect(0, 0, W, Math.round(this.sceneH * 0.12));
    }
  }

  drawDash(game) {
    const ctx = this.ctx, W = this.W, y0 = this.sceneH, h = this.dashH;
    ctx.fillStyle = PAL.DARK;
    ctx.fillRect(0, y0, W, h);
    ctx.fillStyle = '#1c1c34';
    for (let y = y0 + 6; y < this.H; y += 6) ctx.fillRect(0, y, W, 1);
    for (let x = 0; x < W; x += 6) ctx.fillRect(x, y0, 1, h);
    ctx.fillStyle = '#3c3c60'; ctx.fillRect(0, y0, W, 2);
    ctx.fillStyle = PAL.RED; ctx.fillRect(0, y0 + 2, W, 1);
  }
}
