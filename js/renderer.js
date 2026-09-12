/**
 * Monaco GT Racer - Advanced Pseudo-3D Renderer
 * Smooth 16-bit style graphics with particle effects
 */

class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.width = 0;
        this.height = 0;

        // Camera
        this.cameraHeight = 1200;
        this.cameraDepth = 0.8;
        this.drawDistance = 250;

        // Particles
        this.particles = [];
        this.maxParticles = 50;

        // Sky gradient cache
        this.skyGradient = null;

        // Projected segments cache
        this.projected = [];
    }

    init() {
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const rect = this.canvas.parentElement.getBoundingClientRect();

        this.width = Math.floor(rect.width * dpr);
        this.height = Math.floor(rect.height * dpr);

        this.canvas.width = this.width;
        this.canvas.height = this.height;

        this.ctx.imageSmoothingEnabled = false;
        this.skyGradient = null;
    }

    render(state) {
        const ctx = this.ctx;

        // Clear
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, this.width, this.height);

        // Sky
        this.drawSky(state);

        // Horizon
        this.drawHorizon(state);

        // Road
        this.drawRoad(state);

        // Particles
        this.drawParticles(state);

        // Player car
        this.drawPlayerCar(state);

        // HUD elements drawn on canvas
        this.drawTurboMeter(state);

        // Retro effects
        this.drawRetroEffects();
    }

    drawSky(state) {
        const ctx = this.ctx;
        const horizonY = this.height * 0.38;

        // Create gradient if needed
        if (!this.skyGradient) {
            this.skyGradient = ctx.createLinearGradient(0, 0, 0, horizonY);
            this.skyGradient.addColorStop(0, '#0a0a2e');
            this.skyGradient.addColorStop(0.5, '#1a2a5e');
            this.skyGradient.addColorStop(1, '#2a4a7e');
        }

        ctx.fillStyle = this.skyGradient;
        ctx.fillRect(0, 0, this.width, horizonY);

        // Sun
        const sunX = this.width * 0.8;
        const sunY = this.height * 0.12;

        // Sun glow
        const glowGrad = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 60);
        glowGrad.addColorStop(0, 'rgba(255,220,100,0.8)');
        glowGrad.addColorStop(0.3, 'rgba(255,180,50,0.4)');
        glowGrad.addColorStop(1, 'rgba(255,100,0,0)');
        ctx.fillStyle = glowGrad;
        ctx.fillRect(sunX - 80, sunY - 80, 160, 160);

        // Sun disc
        ctx.fillStyle = '#FFD700';
        ctx.beginPath();
        ctx.arc(sunX, sunY, 25, 0, Math.PI * 2);
        ctx.fill();

        // Clouds
        this.drawClouds(state.playerZ);
    }

    drawClouds(offset) {
        const ctx = this.ctx;
        ctx.fillStyle = 'rgba(255,255,255,0.6)';

        const clouds = [
            { x: 0.1, y: 0.06, w: 80, h: 25 },
            { x: 0.35, y: 0.1, w: 100, h: 30 },
            { x: 0.6, y: 0.05, w: 70, h: 22 },
            { x: 0.85, y: 0.08, w: 90, h: 28 }
        ];

        clouds.forEach(c => {
            const parallax = (offset * 0.00005) % 1.3;
            let x = ((c.x + parallax) % 1.3) * this.width - 100;

            // Cloud shape
            ctx.fillRect(x, c.y * this.height, c.w, c.h);
            ctx.fillRect(x + c.w * 0.15, c.y * this.height - c.h * 0.4, c.w * 0.7, c.h * 0.6);
            ctx.fillRect(x - c.w * 0.1, c.y * this.height + c.h * 0.3, c.w * 0.8, c.h * 0.5);
        });
    }

    drawHorizon(state) {
        const ctx = this.ctx;
        const horizonY = this.height * 0.38;

        // Mountains
        ctx.fillStyle = '#1a3a5e';
        ctx.beginPath();
        ctx.moveTo(0, horizonY);

        const peaks = 15;
        for (let i = 0; i <= peaks; i++) {
            const x = (i / peaks) * this.width;
            const h = Math.sin(i * 1.7 + state.playerZ * 0.00008) * this.height * 0.08;
            const y = horizonY - this.height * 0.06 - Math.abs(h);

            if (i === 0) ctx.lineTo(x, y);
            else {
                const midX = x - this.width / peaks / 2;
                const midY = horizonY - this.height * 0.03;
                ctx.lineTo(midX, midY);
                ctx.lineTo(x, y);
            }
        }
        ctx.lineTo(this.width, horizonY);
        ctx.closePath();
        ctx.fill();

        // Sea
        const seaH = this.height * 0.04;
        ctx.fillStyle = '#0a3a5e';
        ctx.fillRect(0, horizonY, this.width, seaH);

        // Water shimmer
        ctx.fillStyle = 'rgba(100,180,255,0.3)';
        for (let x = 0; x < this.width; x += 30) {
            const shimmer = Math.sin(x * 0.05 + state.playerZ * 0.008) * 3;
            ctx.fillRect(x, horizonY + seaH / 2 + shimmer, 15, 2);
        }
    }

    drawRoad(state) {
        const ctx = this.ctx;
        const baseSegment = track.getSegment(state.playerZ);
        if (!baseSegment) return;

        const baseIdx = baseSegment.index;
        const horizonY = this.height * 0.42;
        let maxY = this.height;

        this.projected = [];
        let x = 0, dx = 0;

        // Project segments far to near
        for (let n = this.drawDistance; n > 0; n--) {
            const idx = (baseIdx + n) % track.totalSegments;
            const seg = track.getSegmentByIndex(idx);
            if (!seg) continue;

            const z = n * track.segmentLength - (state.playerZ % track.segmentLength);
            if (z <= 0) continue;

            const scale = this.cameraDepth / z;
            const projY = horizonY + (1 - scale) * (this.height - horizonY);

            if (projY >= maxY) continue;

            x += dx;
            dx += seg.curve * scale * 2.5;

            const playerOffset = -state.playerX * scale * this.width * 0.6;
            const projX = this.width / 2 + x + playerOffset;
            const roadW = track.roadWidth * scale;

            this.projected.push({
                idx, y: projY, x: projX, scale, width: roadW, seg, z
            });

            maxY = projY;
        }

        // Draw far to near
        for (let i = 0; i < this.projected.length - 1; i++) {
            const curr = this.projected[i];
            const next = this.projected[i + 1];
            this.drawRoadSegment(curr, next, state);
        }

        // Scenery
        for (let i = 0; i < this.projected.length; i++) {
            this.drawScenery(this.projected[i], state);
        }

        // Opponents
        this.drawOpponents(state);
    }

    drawRoadSegment(curr, next, state) {
        const ctx = this.ctx;
        const seg = curr.seg;
        const alt = seg.index % 2 === 0;

        // Grass
        ctx.fillStyle = alt ? '#3a6b3a' : '#2d5a2d';
        ctx.fillRect(0, next.y, this.width, curr.y - next.y + 1);

        // Rumble strips
        const rumbleW = 80 * curr.scale;
        ctx.fillStyle = alt ? '#cc0000' : '#ffffff';

        // Left rumble
        this.trapezoid(
            curr.x - curr.width / 2 - rumbleW, curr.y,
            next.x - next.width / 2 - rumbleW * (next.scale / curr.scale), next.y,
            rumbleW, rumbleW * (next.scale / curr.scale)
        );

        // Right rumble
        this.trapezoid(
            curr.x + curr.width / 2, curr.y,
            next.x + next.width / 2, next.y,
            rumbleW, rumbleW * (next.scale / curr.scale)
        );

        // Road
        ctx.fillStyle = alt ? '#505050' : '#454545';
        this.trapezoid(
            curr.x - curr.width / 2, curr.y,
            next.x - next.width / 2, next.y,
            curr.width, next.width
        );

        // Lane markings
        if (seg.index % 6 < 3) {
            ctx.fillStyle = '#cccccc';
            const laneW = curr.width * 0.015;
            this.trapezoid(
                curr.x - laneW / 2, curr.y,
                next.x - laneW / 2 * (next.scale / curr.scale), next.y,
                laneW, laneW * (next.scale / curr.scale)
            );
        }

        // Start line
        if (seg.startLine || seg.index === 0) {
            const stripeW = curr.width / 10;
            for (let i = 0; i < 10; i++) {
                ctx.fillStyle = i % 2 === 0 ? '#fff' : '#000';
                const sx = curr.x - curr.width / 2 + i * stripeW;
                const nx = next.x - next.width / 2 + i * stripeW * (next.scale / curr.scale);
                this.trapezoid(sx, curr.y, nx, next.y, stripeW, stripeW * (next.scale / curr.scale));
            }
        }

        // Tunnel
        if (seg.tunnel) {
            ctx.fillStyle = 'rgba(0,0,0,0.65)';
            ctx.fillRect(0, next.y, this.width, curr.y - next.y + 1);

            // Tunnel lights
            if (seg.index % 12 === 0) {
                const lightY = (curr.y + next.y) / 2 - 15 * curr.scale;
                ctx.fillStyle = '#ffcc00';
                ctx.fillRect(curr.x - 5 * curr.scale, lightY, 10 * curr.scale, 4 * curr.scale);

                ctx.fillStyle = 'rgba(255,200,0,0.2)';
                ctx.fillRect(curr.x - 30 * curr.scale, lightY - 10 * curr.scale, 60 * curr.scale, 40 * curr.scale);
            }
        }
    }

    trapezoid(x1, y1, x2, y2, w1, w2) {
        const ctx = this.ctx;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x1 + w1, y1);
        ctx.lineTo(x2 + w2, y2);
        ctx.lineTo(x2, y2);
        ctx.closePath();
        ctx.fill();
    }

    drawScenery(proj, state) {
        const seg = proj.seg;

        // Left scenery
        if (seg.sceneryLeft) {
            seg.sceneryLeft.forEach(s => {
                this.drawSprite(
                    proj.x - proj.width / 2 * (s.offset || 1.3),
                    proj.y, proj.scale, s.type
                );
            });
        }

        // Right scenery
        if (seg.sceneryRight) {
            seg.sceneryRight.forEach(s => {
                this.drawSprite(
                    proj.x + proj.width / 2 * (s.offset || 1.3),
                    proj.y, proj.scale, s.type
                );
            });
        }
    }

    drawSprite(x, y, scale, type) {
        const sprite = sprites.get(type);
        if (!sprite) return;

        const s = scale * 3.5;
        const w = sprite.width * s;
        const h = sprite.height * s;

        if (w < 3 || h < 3) return;
        if (x + w < 0 || x - w > this.width) return;
        if (y < 0 || y - h > this.height) return;

        this.ctx.drawImage(sprite, x - w / 2, y - h, w, h);
    }

    drawOpponents(state) {
        if (!state.opponents) return;

        state.opponents.forEach((opp, i) => {
            const relZ = opp.z - state.playerZ;
            if (relZ < 0 || relZ > this.drawDistance * track.segmentLength) return;

            // Find projection
            const segOff = Math.floor(relZ / track.segmentLength);
            const projIdx = this.projected.findIndex(p => {
                const dist = Math.abs(this.drawDistance - segOff - (this.projected.indexOf(p)));
                return dist < 3;
            });

            if (projIdx < 0) return;
            const proj = this.projected[projIdx];
            if (!proj) return;

            const sprite = opp.sprite;
            if (!sprite) return;

            const laneOff = opp.lane * proj.width * 0.35;
            const carX = proj.x + laneOff;
            const carY = proj.y;

            const s = proj.scale * 3;
            const w = sprite.width * s;
            const h = sprite.height * s;

            if (w < 5) return;

            this.ctx.drawImage(sprite, carX - w / 2, carY - h, w, h);
        });
    }

    drawPlayerCar(state) {
        let sprite;
        if (state.steering < -0.3) {
            sprite = sprites.get('playerCarLeft');
        } else if (state.steering > 0.3) {
            sprite = sprites.get('playerCarRight');
        } else {
            sprite = sprites.get('playerCar');
        }

        if (!sprite) sprite = sprites.get('playerCar');
        if (!sprite) return;

        const scale = 3;
        const w = sprite.width * scale;
        const h = sprite.height * scale;

        const carX = this.width / 2 - w / 2;
        const carY = this.height - h - 25;

        // Slight steering tilt
        const tilt = state.steering * 8;

        this.ctx.save();
        this.ctx.translate(carX + w / 2, carY + h / 2);
        this.ctx.rotate(tilt * Math.PI / 180);
        this.ctx.drawImage(sprite, -w / 2, -h / 2, w, h);
        this.ctx.restore();

        // Speed lines
        if (state.speed > state.maxSpeed * 0.75) {
            const intensity = (state.speed / state.maxSpeed - 0.75) / 0.25;
            this.ctx.strokeStyle = `rgba(255,255,255,${intensity * 0.4})`;
            this.ctx.lineWidth = 2;

            for (let i = 0; i < 6; i++) {
                const lx = carX + Math.random() * w;
                const ly = carY + h + 5;
                const len = 15 + Math.random() * 25;

                this.ctx.beginPath();
                this.ctx.moveTo(lx, ly);
                this.ctx.lineTo(lx, ly + len);
                this.ctx.stroke();
            }
        }

        // Turbo flames
        if (state.turboActive) {
            this.ctx.fillStyle = '#ff6600';
            this.ctx.fillRect(carX + w / 2 - 8, carY + h, 16, 12 + Math.random() * 8);
            this.ctx.fillStyle = '#ffff00';
            this.ctx.fillRect(carX + w / 2 - 5, carY + h, 10, 8 + Math.random() * 6);
        }
    }

    drawTurboMeter(state) {
        const ctx = this.ctx;
        const x = 20;
        const y = this.height - 100;
        const w = 25;
        const h = 80;

        // Background
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(x - 2, y - 2, w + 4, h + 4);

        // Border
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, w, h);

        // Fill
        const fillH = (state.turbo / 100) * h;
        const grad = ctx.createLinearGradient(x, y + h, x, y);
        grad.addColorStop(0, '#00ff00');
        grad.addColorStop(0.5, '#ffff00');
        grad.addColorStop(1, '#ff0000');
        ctx.fillStyle = grad;
        ctx.fillRect(x, y + h - fillH, w, fillH);

        // Label
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 10px monospace';
        ctx.fillText('TURBO', x - 3, y + h + 15);

        // Ready indicator
        if (state.turbo >= 100) {
            ctx.fillStyle = state.turboActive ? '#ff0' : (Date.now() % 500 < 250 ? '#0f0' : '#0a0');
            ctx.fillRect(x, y - 12, w, 8);
        }
    }

    // ================== PARTICLES ==================

    addParticle(x, y, type) {
        if (this.particles.length >= this.maxParticles) {
            this.particles.shift();
        }

        this.particles.push({
            x, y, type,
            vx: (Math.random() - 0.5) * 4,
            vy: -Math.random() * 3 - 1,
            life: 1,
            decay: 0.02 + Math.random() * 0.02
        });
    }

    updateParticles(dt) {
        this.particles = this.particles.filter(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.1; // gravity
            p.life -= p.decay;
            return p.life > 0;
        });
    }

    drawParticles(state) {
        const ctx = this.ctx;

        this.particles.forEach(p => {
            const alpha = p.life;
            const size = 4 + (1 - p.life) * 8;

            if (p.type === 'spark') {
                ctx.fillStyle = `rgba(255,255,0,${alpha})`;
            } else if (p.type === 'smoke') {
                ctx.fillStyle = `rgba(150,150,150,${alpha * 0.5})`;
            } else {
                ctx.fillStyle = `rgba(255,100,0,${alpha})`;
            }

            ctx.fillRect(p.x - size / 2, p.y - size / 2, size, size);
        });
    }

    // ================== RETRO EFFECTS ==================

    drawRetroEffects() {
        const ctx = this.ctx;

        // Scanlines
        ctx.fillStyle = 'rgba(0,0,0,0.08)';
        for (let y = 0; y < this.height; y += 4) {
            ctx.fillRect(0, y, this.width, 2);
        }

        // Vignette
        const vignette = ctx.createRadialGradient(
            this.width / 2, this.height / 2, this.height * 0.4,
            this.width / 2, this.height / 2, this.height
        );
        vignette.addColorStop(0, 'rgba(0,0,0,0)');
        vignette.addColorStop(1, 'rgba(0,0,0,0.5)');
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, this.width, this.height);
    }

    flash(color = 'white', alpha = 0.5) {
        this.ctx.fillStyle = color === 'white' ?
            `rgba(255,255,255,${alpha})` : `rgba(255,0,0,${alpha})`;
        this.ctx.fillRect(0, 0, this.width, this.height);
    }
}
