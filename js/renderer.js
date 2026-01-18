/**
 * Monaco GT Racer - 16-Bit Style Pseudo-3D Renderer
 * Classic OutRun-style road rendering
 */

class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');

        // Rendering settings
        this.width = 0;
        this.height = 0;
        this.resolution = 1; // Lower for more pixelated look

        // Camera settings
        this.cameraHeight = 1000;
        this.cameraDepth = 0.84; // Camera depth (affects FOV)
        this.drawDistance = 300; // Number of segments to draw

        // Player view position
        this.playerX = 0;
        this.playerZ = 0;

        // Road projection cache
        this.projectedSegments = [];
    }

    init() {
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        // Get container size
        const container = this.canvas.parentElement;
        const rect = container.getBoundingClientRect();

        // Set canvas size with resolution scaling
        this.width = Math.floor(rect.width * this.resolution);
        this.height = Math.floor(rect.height * this.resolution);

        this.canvas.width = this.width;
        this.canvas.height = this.height;

        // Pixelated rendering
        this.ctx.imageSmoothingEnabled = false;
    }

    render(gameState) {
        const { playerZ, playerX, speed } = gameState;

        this.playerZ = playerZ;
        this.playerX = playerX;

        // Clear canvas
        this.ctx.fillStyle = '#000';
        this.ctx.fillRect(0, 0, this.width, this.height);

        // Draw sky
        this.drawSky(gameState);

        // Draw mountains/horizon
        this.drawHorizon(gameState);

        // Draw road segments
        this.drawRoad(gameState);

        // Draw player car at the bottom
        this.drawPlayerCar(gameState);

        // Apply CRT/retro effect
        this.applyRetroEffect();
    }

    drawSky(gameState) {
        const colors = track.colors.sky;
        const horizonY = this.height * 0.4;

        // Gradient sky
        const gradient = this.ctx.createLinearGradient(0, 0, 0, horizonY);
        gradient.addColorStop(0, colors.top);
        gradient.addColorStop(1, colors.bottom);

        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, this.width, horizonY);

        // Sun
        const sunX = this.width * 0.75;
        const sunY = this.height * 0.15;
        const sunRadius = 30;

        this.ctx.fillStyle = '#FFD700';
        this.ctx.beginPath();
        this.ctx.arc(sunX, sunY, sunRadius, 0, Math.PI * 2);
        this.ctx.fill();

        // Sun glow
        this.ctx.fillStyle = 'rgba(255, 200, 0, 0.3)';
        this.ctx.beginPath();
        this.ctx.arc(sunX, sunY, sunRadius * 2, 0, Math.PI * 2);
        this.ctx.fill();

        // Clouds (simple pixel-style)
        this.drawClouds(gameState.playerZ);
    }

    drawClouds(offset) {
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';

        const cloudPositions = [
            { x: 0.1, y: 0.08, w: 60, h: 20 },
            { x: 0.3, y: 0.12, w: 80, h: 24 },
            { x: 0.5, y: 0.06, w: 50, h: 16 },
            { x: 0.8, y: 0.1, w: 70, h: 22 },
        ];

        cloudPositions.forEach(cloud => {
            // Slight parallax
            const parallaxOffset = (offset * 0.0001) % 1;
            let x = ((cloud.x + parallaxOffset) % 1.2) * this.width - 50;

            this.ctx.fillRect(x, cloud.y * this.height, cloud.w, cloud.h);
            this.ctx.fillRect(x + 10, cloud.y * this.height - 8, cloud.w - 20, 12);
            this.ctx.fillRect(x - 10, cloud.y * this.height + 8, cloud.w - 10, 10);
        });
    }

    drawHorizon(gameState) {
        const horizonY = this.height * 0.4;
        const mountainHeight = this.height * 0.15;

        // Mountains
        this.ctx.fillStyle = track.colors.mountains;

        // Draw jagged mountain silhouette
        this.ctx.beginPath();
        this.ctx.moveTo(0, horizonY);

        const peaks = 12;
        for (let i = 0; i <= peaks; i++) {
            const x = (i / peaks) * this.width;
            const peakHeight = Math.sin(i * 1.5 + gameState.playerZ * 0.0001) * mountainHeight * 0.5;
            const y = horizonY - mountainHeight * 0.5 - peakHeight;

            if (i === 0) {
                this.ctx.lineTo(x, y);
            } else {
                // Jagged peaks
                const midX = x - this.width / peaks / 2;
                const midY = horizonY - mountainHeight * 0.3;
                this.ctx.lineTo(midX, midY);
                this.ctx.lineTo(x, y);
            }
        }

        this.ctx.lineTo(this.width, horizonY);
        this.ctx.closePath();
        this.ctx.fill();

        // Sea/water between mountains and road
        const seaHeight = this.height * 0.05;
        this.ctx.fillStyle = track.colors.sea;
        this.ctx.fillRect(0, horizonY, this.width, seaHeight);

        // Water shimmer
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        for (let x = 0; x < this.width; x += 20) {
            const shimmerOffset = Math.sin(x * 0.1 + gameState.playerZ * 0.01) * 2;
            this.ctx.fillRect(x, horizonY + seaHeight / 2 + shimmerOffset, 10, 2);
        }
    }

    drawRoad(gameState) {
        const baseSegment = track.getSegment(gameState.playerZ);
        if (!baseSegment) return;

        const baseIndex = baseSegment.index;
        const horizonY = this.height * 0.4;
        const roadStartY = this.height * 0.45;

        // Calculate camera position
        let x = 0;
        let dx = 0;
        let maxY = this.height;

        // Store projected segments for sprite rendering
        this.projectedSegments = [];

        // Project road segments from far to near
        for (let n = this.drawDistance; n > 0; n--) {
            const segmentIndex = (baseIndex + n) % track.totalSegments;
            const segment = track.getSegmentByIndex(segmentIndex);
            if (!segment) continue;

            // Calculate segment world position
            const segmentZ = (n * track.segmentLength);

            // Camera projection
            const camZ = gameState.playerZ % track.segmentLength;
            const z = segmentZ - camZ;

            if (z <= 0) continue;

            // Project to screen
            const scale = this.cameraDepth / z;
            const projectedY = roadStartY + (1 - scale) * (this.height - roadStartY);

            if (projectedY >= maxY) continue;

            // Accumulate curve offset
            x += dx;
            dx += segment.curve * scale * 2;

            // Add player steering offset
            const playerOffset = -gameState.playerX * scale * this.width * 0.5;

            const projectedX = this.width / 2 + x + playerOffset;
            const roadWidth = track.roadWidth * scale;

            // Store for rendering
            this.projectedSegments.push({
                index: segmentIndex,
                y: projectedY,
                x: projectedX,
                scale: scale,
                width: roadWidth,
                segment: segment,
                z: z
            });

            maxY = projectedY;
        }

        // Render from far to near (reverse order for proper overlap)
        for (let i = 0; i < this.projectedSegments.length; i++) {
            const curr = this.projectedSegments[i];
            const next = this.projectedSegments[i + 1];

            if (!next) continue;

            // Draw segment
            this.drawRoadSegment(curr, next, gameState);
        }

        // Draw scenery sprites (far to near)
        for (let i = 0; i < this.projectedSegments.length; i++) {
            this.drawSegmentScenery(this.projectedSegments[i], gameState);
        }

        // Draw opponent cars
        this.drawOpponentCars(gameState);
    }

    drawRoadSegment(curr, next, gameState) {
        const segment = curr.segment;
        const isEven = segment.index % 2 === 0;

        // Grass
        const grassColor = isEven ? track.colors.grass.light : track.colors.grass.dark;
        this.ctx.fillStyle = grassColor;
        this.ctx.fillRect(0, next.y, this.width, curr.y - next.y + 1);

        // Rumble strips
        const rumbleColor = isEven ? track.colors.rumble.light : track.colors.rumble.dark;
        const rumbleWidth = track.rumbleWidth * curr.scale;

        this.ctx.fillStyle = rumbleColor;

        // Left rumble
        this.drawTrapezoid(
            curr.x - curr.width / 2 - rumbleWidth, curr.y,
            next.x - next.width / 2 - rumbleWidth * (next.scale / curr.scale), next.y,
            rumbleWidth, rumbleWidth * (next.scale / curr.scale)
        );

        // Right rumble
        this.drawTrapezoid(
            curr.x + curr.width / 2, curr.y,
            next.x + next.width / 2, next.y,
            rumbleWidth, rumbleWidth * (next.scale / curr.scale)
        );

        // Road surface
        const roadColor = isEven ? track.colors.road.light : track.colors.road.dark;
        this.ctx.fillStyle = roadColor;

        this.drawTrapezoid(
            curr.x - curr.width / 2, curr.y,
            next.x - next.width / 2, next.y,
            curr.width, next.width
        );

        // Lane markings
        if (segment.index % 4 < 2) {
            const laneWidth = curr.width * 0.02;

            this.ctx.fillStyle = track.colors.lane;

            // Center line
            this.drawTrapezoid(
                curr.x - laneWidth / 2, curr.y,
                next.x - laneWidth / 2 * (next.scale / curr.scale), next.y,
                laneWidth, laneWidth * (next.scale / curr.scale)
            );
        }

        // Start/finish line
        if (segment.isStartLine) {
            const stripeWidth = curr.width / 8;
            for (let i = 0; i < 8; i++) {
                this.ctx.fillStyle = i % 2 === 0 ? '#ffffff' : '#000000';
                const stripeX = curr.x - curr.width / 2 + i * stripeWidth;
                const nextStripeX = next.x - next.width / 2 + i * stripeWidth * (next.scale / curr.scale);

                this.drawTrapezoid(
                    stripeX, curr.y,
                    nextStripeX, next.y,
                    stripeWidth, stripeWidth * (next.scale / curr.scale)
                );
            }
        }

        // Tunnel effect (darken)
        if (segment.isTunnel) {
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
            this.ctx.fillRect(0, next.y, this.width, curr.y - next.y + 1);

            // Tunnel lights
            if (segment.index % 10 === 0) {
                this.ctx.fillStyle = '#ffcc00';
                const lightY = (curr.y + next.y) / 2 - 20;
                this.ctx.fillRect(curr.x - 4, lightY, 8, 4);

                // Light glow
                this.ctx.fillStyle = 'rgba(255, 200, 0, 0.3)';
                this.ctx.fillRect(curr.x - 20, lightY - 10, 40, 30);
            }
        }
    }

    drawTrapezoid(x1, y1, x2, y2, w1, w2) {
        this.ctx.beginPath();
        this.ctx.moveTo(x1, y1);
        this.ctx.lineTo(x1 + w1, y1);
        this.ctx.lineTo(x2 + w2, y2);
        this.ctx.lineTo(x2, y2);
        this.ctx.closePath();
        this.ctx.fill();
    }

    drawSegmentScenery(projected, gameState) {
        const segment = projected.segment;
        const scale = projected.scale;

        // Draw left scenery
        segment.sceneryLeft.forEach(scenery => {
            this.drawSprite(
                projected.x - projected.width / 2 * scenery.offset,
                projected.y,
                scale,
                scenery.type,
                gameState
            );
        });

        // Draw right scenery
        segment.sceneryRight.forEach(scenery => {
            this.drawSprite(
                projected.x + projected.width / 2 * scenery.offset,
                projected.y,
                scale,
                scenery.type,
                gameState
            );
        });
    }

    drawSprite(x, y, scale, spriteType, gameState) {
        const sprite = spriteSystem.getSprite(spriteType);
        if (!sprite) return;

        const spriteScale = scale * 3; // Base sprite scale
        const width = sprite.width * spriteScale;
        const height = sprite.height * spriteScale;

        if (width < 2 || height < 2) return;

        // Position sprite at bottom
        const spriteX = x - width / 2;
        const spriteY = y - height;

        // Skip if off screen
        if (spriteX + width < 0 || spriteX > this.width) return;
        if (spriteY + height < 0 || spriteY > this.height) return;

        // Draw sprite
        this.ctx.drawImage(sprite, spriteX, spriteY, width, height);
    }

    drawOpponentCars(gameState) {
        if (!gameState.opponents) return;

        gameState.opponents.forEach(opponent => {
            // Calculate relative position
            const relativeZ = opponent.z - gameState.playerZ;

            // Skip if behind or too far
            if (relativeZ < 0 || relativeZ > this.drawDistance * track.segmentLength) return;

            // Find matching projected segment
            const segmentOffset = Math.floor(relativeZ / track.segmentLength);
            const projectedIndex = this.projectedSegments.findIndex(p =>
                Math.abs(this.projectedSegments.indexOf(p) - (this.drawDistance - segmentOffset)) < 2
            );

            if (projectedIndex < 0 || projectedIndex >= this.projectedSegments.length - 1) return;

            const projected = this.projectedSegments[projectedIndex];

            if (!projected) return;

            const scale = projected.scale;
            const carSprite = opponent.sprite;

            if (!carSprite) return;

            // Calculate car position on road
            const laneOffset = opponent.lane * projected.width * 0.3;
            const carX = projected.x + laneOffset;
            const carY = projected.y;

            // Scale and draw
            const carWidth = carSprite.width * scale * 2.5;
            const carHeight = carSprite.height * scale * 2.5;

            if (carWidth < 4 || carHeight < 4) return;

            this.ctx.drawImage(
                carSprite,
                carX - carWidth / 2,
                carY - carHeight,
                carWidth,
                carHeight
            );
        });
    }

    drawPlayerCar(gameState) {
        const sprite = spriteSystem.getSprite('playerCar');
        if (!sprite) return;

        // Car position at bottom of screen
        const carWidth = sprite.width * 2.5;
        const carHeight = sprite.height * 2.5;

        const carX = this.width / 2 - carWidth / 2;
        const carY = this.height - carHeight - 20;

        // Steering tilt effect
        const steerOffset = gameState.steering * 15;

        this.ctx.save();
        this.ctx.translate(carX + carWidth / 2, carY + carHeight / 2);
        this.ctx.rotate(steerOffset * Math.PI / 180);
        this.ctx.translate(-carWidth / 2, -carHeight / 2);

        // Draw car
        this.ctx.drawImage(sprite, 0, 0, carWidth, carHeight);

        this.ctx.restore();

        // Speed lines effect when going fast
        if (gameState.speed > gameState.maxSpeed * 0.7) {
            const intensity = (gameState.speed / gameState.maxSpeed - 0.7) / 0.3;
            this.ctx.strokeStyle = `rgba(255, 255, 255, ${intensity * 0.3})`;
            this.ctx.lineWidth = 2;

            for (let i = 0; i < 5; i++) {
                const lineX = carX + Math.random() * carWidth;
                const lineY = carY + carHeight + 10;
                const lineLength = 20 + Math.random() * 30;

                this.ctx.beginPath();
                this.ctx.moveTo(lineX, lineY);
                this.ctx.lineTo(lineX, lineY + lineLength);
                this.ctx.stroke();
            }
        }
    }

    applyRetroEffect() {
        // Scanlines
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
        for (let y = 0; y < this.height; y += 3) {
            this.ctx.fillRect(0, y, this.width, 1);
        }

        // Vignette
        const gradient = this.ctx.createRadialGradient(
            this.width / 2, this.height / 2, this.height * 0.3,
            this.width / 2, this.height / 2, this.height
        );
        gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0.4)');
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, this.width, this.height);
    }

    // Flash effect for collisions etc.
    flash(color = 'white', duration = 100) {
        this.ctx.fillStyle = color;
        this.ctx.globalAlpha = 0.5;
        this.ctx.fillRect(0, 0, this.width, this.height);
        this.ctx.globalAlpha = 1;

        setTimeout(() => {
            // Effect ends naturally on next frame
        }, duration);
    }
}
