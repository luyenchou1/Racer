/**
 * Monaco GT Racer - 16-Bit Style Sprite System
 * Procedurally generated pixel art sprites
 */

class SpriteSystem {
    constructor() {
        this.sprites = {};
        this.cache = new Map();
    }

    init() {
        this.createCarSprites();
        this.createScenerySprites();
        this.createRoadSprites();
    }

    // Create offscreen canvas for sprite
    createCanvas(width, height) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        return canvas;
    }

    // ==================== CAR SPRITES ====================

    createCarSprites() {
        // Player car - sleek red GT car
        this.sprites.playerCar = this.createGTCar('#cc0000', '#ff3333', '#880000');

        // Opponent cars - various colors
        this.sprites.opponentCars = [
            this.createGTCar('#0066cc', '#3399ff', '#003366'),  // Blue
            this.createGTCar('#009933', '#33cc66', '#006622'),  // Green
            this.createGTCar('#ffcc00', '#ffdd44', '#cc9900'),  // Yellow
            this.createGTCar('#cc00cc', '#ff33ff', '#880088'),  // Magenta
            this.createGTCar('#ffffff', '#eeeeee', '#888888'),  // White
            this.createGTCar('#333333', '#555555', '#111111'),  // Black
            this.createGTCar('#ff6600', '#ff9944', '#cc4400'),  // Orange
        ];
    }

    createGTCar(mainColor, highlight, shadow) {
        const width = 64;
        const height = 40;
        const canvas = this.createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        // Car body - GT sports car shape (rear view)
        ctx.fillStyle = mainColor;

        // Main body
        ctx.fillRect(8, 15, 48, 20);

        // Curved top
        ctx.fillRect(12, 10, 40, 8);
        ctx.fillRect(16, 6, 32, 6);
        ctx.fillRect(20, 4, 24, 4);

        // Highlight strip on top
        ctx.fillStyle = highlight;
        ctx.fillRect(20, 6, 24, 2);
        ctx.fillRect(16, 10, 32, 2);

        // Shadow on sides
        ctx.fillStyle = shadow;
        ctx.fillRect(8, 30, 48, 5);
        ctx.fillRect(8, 15, 4, 20);
        ctx.fillRect(52, 15, 4, 20);

        // Windows (dark)
        ctx.fillStyle = '#111133';
        ctx.fillRect(18, 8, 28, 6);

        // Window highlight
        ctx.fillStyle = '#334466';
        ctx.fillRect(20, 9, 12, 3);

        // Rear lights
        ctx.fillStyle = '#ff0000';
        ctx.fillRect(10, 20, 6, 4);
        ctx.fillRect(48, 20, 6, 4);

        // Light glow
        ctx.fillStyle = '#ff6666';
        ctx.fillRect(11, 21, 4, 2);
        ctx.fillRect(49, 21, 4, 2);

        // Exhaust
        ctx.fillStyle = '#444444';
        ctx.fillRect(28, 34, 8, 3);

        // Wheels (visible at back)
        ctx.fillStyle = '#111111';
        ctx.fillRect(4, 28, 8, 10);
        ctx.fillRect(52, 28, 8, 10);

        // Wheel highlights
        ctx.fillStyle = '#333333';
        ctx.fillRect(5, 30, 6, 2);
        ctx.fillRect(53, 30, 6, 2);

        // Spoiler
        ctx.fillStyle = shadow;
        ctx.fillRect(6, 12, 52, 3);
        ctx.fillStyle = mainColor;
        ctx.fillRect(8, 13, 48, 2);

        return canvas;
    }

    // Create scaled version of car for distance
    getScaledCar(sprite, scale) {
        const key = `car_${scale.toFixed(2)}`;
        if (this.cache.has(key)) {
            return this.cache.get(key);
        }

        const width = Math.floor(sprite.width * scale);
        const height = Math.floor(sprite.height * scale);

        if (width < 4 || height < 4) return null;

        const canvas = this.createCanvas(width, height);
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(sprite, 0, 0, width, height);

        this.cache.set(key, canvas);
        return canvas;
    }

    // ==================== SCENERY SPRITES ====================

    createScenerySprites() {
        // Monaco-specific scenery

        // Palm tree
        this.sprites.palmTree = this.createPalmTree();

        // Building (Monaco high-rise)
        this.sprites.building = this.createBuilding();

        // Barrier
        this.sprites.barrier = this.createBarrier();

        // Grandstand
        this.sprites.grandstand = this.createGrandstand();

        // Yacht (Monaco harbor)
        this.sprites.yacht = this.createYacht();

        // Casino building
        this.sprites.casino = this.createCasino();

        // Tunnel entrance
        this.sprites.tunnel = this.createTunnel();

        // Billboard/Advertising
        this.sprites.billboard = this.createBillboard();

        // Light post
        this.sprites.lightPost = this.createLightPost();

        // Start/Finish banner
        this.sprites.startBanner = this.createStartBanner();

        // Tire barrier
        this.sprites.tireBarrier = this.createTireBarrier();
    }

    createPalmTree() {
        const canvas = this.createCanvas(48, 96);
        const ctx = canvas.getContext('2d');

        // Trunk
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(20, 40, 8, 56);
        ctx.fillStyle = '#654321';
        ctx.fillRect(22, 45, 4, 50);

        // Trunk texture
        ctx.fillStyle = '#5D3A1A';
        for (let y = 45; y < 95; y += 8) {
            ctx.fillRect(20, y, 8, 2);
        }

        // Fronds (palm leaves)
        ctx.fillStyle = '#228B22';
        // Center fronds
        ctx.fillRect(22, 8, 4, 35);
        ctx.fillRect(18, 4, 12, 8);

        // Left fronds
        ctx.fillRect(4, 20, 20, 6);
        ctx.fillRect(0, 18, 8, 4);
        ctx.fillRect(8, 24, 16, 4);

        // Right fronds
        ctx.fillRect(24, 20, 20, 6);
        ctx.fillRect(40, 18, 8, 4);
        ctx.fillRect(24, 24, 16, 4);

        // Lighter highlights
        ctx.fillStyle = '#32CD32';
        ctx.fillRect(6, 21, 16, 2);
        ctx.fillRect(26, 21, 16, 2);
        ctx.fillRect(20, 6, 8, 3);

        return canvas;
    }

    createBuilding() {
        const canvas = this.createCanvas(80, 160);
        const ctx = canvas.getContext('2d');

        // Main building
        ctx.fillStyle = '#D4C4A8';
        ctx.fillRect(0, 0, 80, 160);

        // Shadow side
        ctx.fillStyle = '#B8A888';
        ctx.fillRect(60, 0, 20, 160);

        // Windows
        ctx.fillStyle = '#4A6FA5';
        for (let y = 8; y < 150; y += 20) {
            for (let x = 8; x < 60; x += 16) {
                ctx.fillRect(x, y, 10, 14);
            }
        }

        // Window reflections
        ctx.fillStyle = '#7FB3D5';
        for (let y = 8; y < 150; y += 20) {
            for (let x = 8; x < 60; x += 16) {
                ctx.fillRect(x, y, 4, 6);
            }
        }

        // Balconies
        ctx.fillStyle = '#888888';
        for (let y = 22; y < 150; y += 40) {
            ctx.fillRect(4, y, 56, 4);
        }

        return canvas;
    }

    createBarrier() {
        const canvas = this.createCanvas(32, 24);
        const ctx = canvas.getContext('2d');

        // Red and white barrier
        ctx.fillStyle = '#ff0000';
        ctx.fillRect(0, 0, 32, 24);

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 16, 12);
        ctx.fillRect(16, 12, 16, 12);

        // Border
        ctx.fillStyle = '#cc0000';
        ctx.fillRect(0, 0, 32, 2);
        ctx.fillRect(0, 22, 32, 2);

        return canvas;
    }

    createGrandstand() {
        const canvas = this.createCanvas(128, 80);
        const ctx = canvas.getContext('2d');

        // Structure
        ctx.fillStyle = '#666666';
        ctx.fillRect(0, 20, 128, 60);

        // Roof
        ctx.fillStyle = '#444444';
        ctx.fillRect(0, 0, 128, 24);
        ctx.fillStyle = '#333333';
        ctx.fillRect(0, 0, 128, 4);

        // Seats (rows of colored dots for people)
        const colors = ['#ff0000', '#0000ff', '#ffff00', '#00ff00', '#ff00ff', '#ffffff'];
        for (let y = 28; y < 76; y += 8) {
            for (let x = 4; x < 124; x += 6) {
                ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)];
                ctx.fillRect(x, y, 4, 6);
            }
        }

        return canvas;
    }

    createYacht() {
        const canvas = this.createCanvas(96, 48);
        const ctx = canvas.getContext('2d');

        // Hull
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(8, 24, 80, 20);

        // Hull bottom curve
        ctx.fillStyle = '#1a1a4e';
        ctx.fillRect(4, 40, 88, 8);
        ctx.fillRect(12, 44, 72, 4);

        // Deck
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(12, 20, 72, 6);

        // Cabin
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(32, 8, 32, 14);

        // Windows
        ctx.fillStyle = '#4A6FA5';
        ctx.fillRect(36, 10, 8, 8);
        ctx.fillRect(52, 10, 8, 8);

        // Mast
        ctx.fillStyle = '#cccccc';
        ctx.fillRect(68, 0, 3, 24);

        // Flag
        ctx.fillStyle = '#ff0000';
        ctx.fillRect(71, 2, 12, 8);

        return canvas;
    }

    createCasino() {
        const canvas = this.createCanvas(120, 100);
        const ctx = canvas.getContext('2d');

        // Main building - cream/gold Monaco style
        ctx.fillStyle = '#F5E6C8';
        ctx.fillRect(0, 20, 120, 80);

        // Roof
        ctx.fillStyle = '#228B22';
        ctx.fillRect(0, 10, 120, 14);
        ctx.fillStyle = '#1a6b1a';
        ctx.fillRect(0, 10, 120, 4);

        // Dome
        ctx.fillStyle = '#228B22';
        ctx.fillRect(45, 0, 30, 14);
        ctx.fillRect(50, -4, 20, 8);

        // Columns
        ctx.fillStyle = '#ffffff';
        for (let x = 15; x < 110; x += 25) {
            ctx.fillRect(x, 30, 8, 50);
        }

        // Windows
        ctx.fillStyle = '#8B7355';
        for (let x = 10; x < 110; x += 25) {
            ctx.fillRect(x + 10, 35, 12, 20);
            ctx.fillRect(x + 10, 60, 12, 15);
        }

        // Entrance
        ctx.fillStyle = '#4a3728';
        ctx.fillRect(48, 55, 24, 45);

        // Gold trim
        ctx.fillStyle = '#FFD700';
        ctx.fillRect(0, 22, 120, 3);
        ctx.fillRect(0, 97, 120, 3);

        return canvas;
    }

    createTunnel() {
        const canvas = this.createCanvas(160, 100);
        const ctx = canvas.getContext('2d');

        // Tunnel entrance (dark)
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, 160, 100);

        // Arch shape (lighter frame)
        ctx.fillStyle = '#555555';
        ctx.fillRect(0, 0, 160, 10);
        ctx.fillRect(0, 0, 15, 100);
        ctx.fillRect(145, 0, 15, 100);

        // Arch top
        ctx.fillStyle = '#666666';
        ctx.fillRect(20, 0, 120, 15);

        // Lights inside
        ctx.fillStyle = '#ffcc00';
        for (let x = 30; x < 140; x += 30) {
            ctx.fillRect(x, 20, 8, 4);
            // Light glow
            ctx.fillStyle = '#ffff88';
            ctx.fillRect(x + 2, 21, 4, 2);
            ctx.fillStyle = '#ffcc00';
        }

        // Road visible inside
        ctx.fillStyle = '#333333';
        ctx.fillRect(20, 70, 120, 30);

        return canvas;
    }

    createBillboard() {
        const canvas = this.createCanvas(80, 48);
        const ctx = canvas.getContext('2d');

        // Posts
        ctx.fillStyle = '#888888';
        ctx.fillRect(8, 24, 6, 24);
        ctx.fillRect(66, 24, 6, 24);

        // Billboard frame
        ctx.fillStyle = '#333333';
        ctx.fillRect(0, 0, 80, 28);

        // Billboard content - MONACO
        ctx.fillStyle = '#003366';
        ctx.fillRect(2, 2, 76, 24);

        // Text "MONACO" (pixel art style)
        ctx.fillStyle = '#FFD700';
        // M
        ctx.fillRect(6, 6, 2, 14);
        ctx.fillRect(8, 8, 2, 2);
        ctx.fillRect(10, 10, 2, 2);
        ctx.fillRect(12, 8, 2, 2);
        ctx.fillRect(14, 6, 2, 14);

        // O
        ctx.fillRect(20, 6, 8, 2);
        ctx.fillRect(20, 18, 8, 2);
        ctx.fillRect(18, 8, 2, 10);
        ctx.fillRect(28, 8, 2, 10);

        // N
        ctx.fillRect(34, 6, 2, 14);
        ctx.fillRect(36, 8, 2, 2);
        ctx.fillRect(38, 10, 2, 4);
        ctx.fillRect(40, 14, 2, 2);
        ctx.fillRect(42, 6, 2, 14);

        // A
        ctx.fillRect(50, 6, 6, 2);
        ctx.fillRect(48, 8, 2, 12);
        ctx.fillRect(56, 8, 2, 12);
        ctx.fillRect(50, 14, 6, 2);

        // C
        ctx.fillRect(64, 6, 8, 2);
        ctx.fillRect(64, 18, 8, 2);
        ctx.fillRect(62, 8, 2, 10);

        // O
        ctx.fillRect(76, 6, -4, 2);

        return canvas;
    }

    createLightPost() {
        const canvas = this.createCanvas(24, 80);
        const ctx = canvas.getContext('2d');

        // Post
        ctx.fillStyle = '#444444';
        ctx.fillRect(10, 16, 4, 64);

        // Light fixture
        ctx.fillStyle = '#666666';
        ctx.fillRect(4, 8, 16, 12);

        // Light
        ctx.fillStyle = '#ffffcc';
        ctx.fillRect(6, 10, 12, 6);

        // Light glow
        ctx.fillStyle = '#ffff88';
        ctx.fillRect(8, 11, 8, 4);

        return canvas;
    }

    createStartBanner() {
        const canvas = this.createCanvas(200, 60);
        const ctx = canvas.getContext('2d');

        // Posts
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 12, 60);
        ctx.fillRect(188, 0, 12, 60);

        // Banner
        ctx.fillStyle = '#000000';
        ctx.fillRect(12, 8, 176, 30);

        // Checkered pattern
        ctx.fillStyle = '#ffffff';
        for (let x = 12; x < 188; x += 16) {
            for (let y = 8; y < 38; y += 15) {
                if ((x / 16 + y / 15) % 2 === 0) {
                    ctx.fillRect(x, y, 16, 15);
                }
            }
        }

        // "START" text area
        ctx.fillStyle = '#ff0000';
        ctx.fillRect(60, 14, 80, 20);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 14px monospace';
        // We'll just add simple pixel text indicators
        ctx.fillRect(70, 18, 6, 12);  // S
        ctx.fillRect(80, 18, 6, 12);  // T
        ctx.fillRect(90, 18, 6, 12);  // A
        ctx.fillRect(100, 18, 6, 12); // R
        ctx.fillRect(110, 18, 6, 12); // T

        return canvas;
    }

    createTireBarrier() {
        const canvas = this.createCanvas(48, 24);
        const ctx = canvas.getContext('2d');

        // Stack of tires
        for (let i = 0; i < 4; i++) {
            const x = i * 12;
            // Tire outer
            ctx.fillStyle = '#222222';
            ctx.fillRect(x, 4, 12, 16);

            // Tire inner
            ctx.fillStyle = '#111111';
            ctx.fillRect(x + 2, 8, 8, 8);

            // Highlight
            ctx.fillStyle = '#444444';
            ctx.fillRect(x + 1, 6, 3, 2);
        }

        return canvas;
    }

    // ==================== ROAD MARKERS ====================

    createRoadSprites() {
        // Rumble strip (red/white curbing)
        this.sprites.rumbleStrip = this.createRumbleStrip();

        // Starting grid positions
        this.sprites.gridPosition = this.createGridPosition();
    }

    createRumbleStrip() {
        const canvas = this.createCanvas(32, 16);
        const ctx = canvas.getContext('2d');

        // Alternating red and white
        ctx.fillStyle = '#ff0000';
        ctx.fillRect(0, 0, 16, 16);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(16, 0, 16, 16);

        return canvas;
    }

    createGridPosition() {
        const canvas = this.createCanvas(40, 20);
        const ctx = canvas.getContext('2d');

        // White box for grid position
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 40, 20);

        ctx.fillStyle = '#000000';
        ctx.fillRect(2, 2, 36, 16);

        return canvas;
    }

    // ==================== UTILITY ====================

    getSprite(name) {
        return this.sprites[name];
    }

    getRandomOpponentCar() {
        const cars = this.sprites.opponentCars;
        return cars[Math.floor(Math.random() * cars.length)];
    }

    clearCache() {
        this.cache.clear();
    }
}

// Export singleton
const spriteSystem = new SpriteSystem();
