/**
 * Monaco GT Racer - Main Game Engine
 * 16-Bit Style Mobile Racing Game
 */

class Game {
    constructor() {
        // Game state
        this.state = 'title'; // title, countdown, racing, paused, finished
        this.paused = false;

        // Player state
        this.playerZ = 0;
        this.playerX = 0;
        this.speed = 0;
        this.steering = 0;

        // Physics constants
        this.maxSpeed = 300;
        this.acceleration = 0.8;
        this.braking = 1.5;
        this.deceleration = 0.3;
        this.steeringSpeed = 0.03;
        this.centrifugalForce = 0.3;
        this.offRoadDrag = 0.96;

        // Race state
        this.currentLap = 1;
        this.totalLaps = 3;
        this.position = 1;
        this.raceTime = 0;
        this.lapTimes = [];
        this.bestLapTime = Infinity;
        this.lastLapZ = 0;

        // Opponents
        this.opponents = [];
        this.numOpponents = 6;

        // Collision state
        this.collisionCooldown = 0;
        this.skidding = false;

        // Countdown
        this.countdownValue = 3;

        // Canvas and renderer
        this.canvas = null;
        this.renderer = null;

        // Frame timing
        this.lastTime = 0;
        this.deltaTime = 0;
        this.fps = 60;

        // DOM elements
        this.titleScreen = null;
        this.hud = null;
        this.pauseMenu = null;
        this.raceComplete = null;
        this.countdownOverlay = null;
        this.pauseBtn = null;
    }

    async init() {
        // Get canvas
        this.canvas = document.getElementById('game-canvas');
        if (!this.canvas) {
            console.error('Canvas not found');
            return;
        }

        // Initialize systems
        spriteSystem.init();
        track.init();
        controls.init();
        await audioSystem.init();

        // Create renderer
        this.renderer = new Renderer(this.canvas);
        this.renderer.init();

        // Get DOM elements
        this.titleScreen = document.getElementById('title-screen');
        this.hud = document.getElementById('hud');
        this.pauseMenu = document.getElementById('pause-menu');
        this.raceComplete = document.getElementById('race-complete');
        this.countdownOverlay = document.getElementById('countdown');
        this.pauseBtn = document.getElementById('pause-btn');

        // Setup event listeners
        this.setupEventListeners();

        // Start game loop
        this.lastTime = performance.now();
        requestAnimationFrame((time) => this.gameLoop(time));

        console.log('Monaco GT Racer initialized!');
    }

    setupEventListeners() {
        // Title screen tap
        this.titleScreen?.addEventListener('click', () => this.startGame());
        this.titleScreen?.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.startGame();
        }, { passive: false });

        // Pause button
        this.pauseBtn?.addEventListener('click', () => this.togglePause());

        // Pause menu buttons
        document.getElementById('resume-btn')?.addEventListener('click', () => this.resume());
        document.getElementById('restart-btn')?.addEventListener('click', () => this.restart());
        document.getElementById('quit-btn')?.addEventListener('click', () => this.quit());

        // Race complete buttons
        document.getElementById('race-again-btn')?.addEventListener('click', () => this.restart());
        document.getElementById('main-menu-btn')?.addEventListener('click', () => this.quit());

        // Keyboard pause
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' || e.key === 'p') {
                if (this.state === 'racing') {
                    this.togglePause();
                } else if (this.state === 'paused') {
                    this.resume();
                }
            }
        });

        // Visibility change - auto pause
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && this.state === 'racing') {
                this.pause();
            }
        });
    }

    startGame() {
        if (this.state !== 'title') return;

        // Resume audio context
        audioSystem.resume();

        // Hide title, show HUD
        this.titleScreen?.classList.add('hidden');
        this.hud?.classList.remove('hidden');
        this.pauseBtn?.classList.remove('hidden');

        // Start countdown
        this.state = 'countdown';
        this.startCountdown();
    }

    startCountdown() {
        this.countdownValue = 3;
        this.countdownOverlay?.classList.remove('hidden');

        const countdownText = document.getElementById('countdown-text');

        const tick = () => {
            if (countdownText) {
                countdownText.textContent = this.countdownValue > 0 ? this.countdownValue : 'GO!';
                countdownText.style.animation = 'none';
                void countdownText.offsetWidth; // Trigger reflow
                countdownText.style.animation = 'countdownPop 1s ease-out';
            }

            audioSystem.playCountdown(this.countdownValue === 0);

            if (this.countdownValue > 0) {
                this.countdownValue--;
                setTimeout(tick, 1000);
            } else {
                setTimeout(() => {
                    this.countdownOverlay?.classList.add('hidden');
                    this.startRace();
                }, 500);
            }
        };

        tick();
    }

    startRace() {
        this.state = 'racing';

        // Reset player
        this.playerZ = 0;
        this.playerX = 0;
        this.speed = 0;
        this.steering = 0;

        // Reset race state
        this.currentLap = 1;
        this.raceTime = 0;
        this.lapTimes = [];
        this.bestLapTime = Infinity;
        this.lastLapZ = 0;
        this.position = this.numOpponents + 1;

        // Create opponents
        this.createOpponents();

        // Show controls
        controls.show();
        controls.reset();

        // Start audio
        audioSystem.startEngine();
        audioSystem.startMusic();
        audioSystem.startAmbient();

        console.log('Race started!');
    }

    createOpponents() {
        this.opponents = [];
        const trackLength = track.getTotalLength();

        for (let i = 0; i < this.numOpponents; i++) {
            // Spread opponents ahead on the grid
            const startZ = (i + 1) * 500; // Staggered start

            this.opponents.push({
                z: startZ,
                x: 0,
                lane: (Math.random() - 0.5) * 2, // -1 to 1
                speed: this.maxSpeed * (0.7 + Math.random() * 0.25), // 70-95% of max speed
                sprite: spriteSystem.getRandomOpponentCar(),
                lap: 1,
                targetLane: 0,
                laneChangeTimer: 0
            });
        }
    }

    pause() {
        if (this.state !== 'racing') return;

        this.state = 'paused';
        this.paused = true;
        this.pauseMenu?.classList.remove('hidden');

        audioSystem.stopMusic();
        audioSystem.stopEngine();
    }

    resume() {
        if (this.state !== 'paused') return;

        this.pauseMenu?.classList.add('hidden');
        this.state = 'racing';
        this.paused = false;

        audioSystem.startEngine();
        audioSystem.startMusic();
    }

    togglePause() {
        if (this.state === 'racing') {
            this.pause();
        } else if (this.state === 'paused') {
            this.resume();
        }
    }

    restart() {
        this.pauseMenu?.classList.add('hidden');
        this.raceComplete?.classList.add('hidden');

        audioSystem.stopMusic();
        audioSystem.stopEngine();
        audioSystem.stopAmbient();

        this.state = 'countdown';
        this.startCountdown();
    }

    quit() {
        this.pauseMenu?.classList.add('hidden');
        this.raceComplete?.classList.add('hidden');
        this.hud?.classList.add('hidden');
        this.pauseBtn?.classList.add('hidden');
        controls.hide();

        audioSystem.stopMusic();
        audioSystem.stopEngine();
        audioSystem.stopAmbient();

        this.titleScreen?.classList.remove('hidden');
        this.state = 'title';
    }

    finishRace() {
        this.state = 'finished';

        controls.hide();
        audioSystem.stopMusic();
        audioSystem.stopEngine();

        // Determine if player won
        const won = this.position <= 3;
        audioSystem.playRaceFinish(won);

        // Show results
        const resultTitle = document.getElementById('result-title');
        const finalPosition = document.getElementById('final-position');
        const bestLapTime = document.getElementById('best-lap-time');
        const totalTime = document.getElementById('total-time');

        if (resultTitle) {
            resultTitle.textContent = won ? 'RACE COMPLETE!' : 'RACE OVER';
            resultTitle.style.color = won ? '#00ff00' : '#ff6600';
        }

        if (finalPosition) {
            const ordinals = ['ST', 'ND', 'RD', 'TH', 'TH', 'TH', 'TH'];
            finalPosition.textContent = `${this.position}${ordinals[this.position - 1] || 'TH'}`;
        }

        if (bestLapTime) {
            bestLapTime.textContent = this.bestLapTime < Infinity ?
                this.formatTime(this.bestLapTime) : '--:--.--';
        }

        if (totalTime) {
            totalTime.textContent = this.formatTime(this.raceTime);
        }

        this.raceComplete?.classList.remove('hidden');
    }

    gameLoop(time) {
        // Calculate delta time
        this.deltaTime = Math.min((time - this.lastTime) / 1000, 0.1);
        this.lastTime = time;

        // Update
        if (this.state === 'racing' && !this.paused) {
            this.update();
        }

        // Render
        this.render();

        // Continue loop
        requestAnimationFrame((t) => this.gameLoop(t));
    }

    update() {
        // Update controls
        controls.update();
        const input = controls.getState();

        // Store steering for visual effects
        this.steering = input.steering;

        // Update collision cooldown
        if (this.collisionCooldown > 0) {
            this.collisionCooldown -= this.deltaTime;
        }

        // Update race time
        this.raceTime += this.deltaTime;

        // Physics
        this.updatePhysics(input);

        // Update opponents
        this.updateOpponents();

        // Check collisions
        this.checkCollisions();

        // Check lap completion
        this.checkLapCompletion();

        // Update position
        this.updatePosition();

        // Update HUD
        this.updateHUD();

        // Update audio
        audioSystem.updateEngine(this.speed, this.maxSpeed, input.throttle);
    }

    updatePhysics(input) {
        const { throttle, brake, steering } = input;

        // Get current track segment
        const segment = track.getSegment(this.playerZ);
        const curve = segment ? segment.curve : 0;

        // Check if off road
        const roadHalfWidth = 0.8; // Normalized road width
        const isOffRoad = Math.abs(this.playerX) > roadHalfWidth;

        // Acceleration/braking
        if (throttle > 0) {
            // Accelerate
            let accel = this.acceleration * throttle;
            if (isOffRoad) accel *= 0.5; // Slower acceleration off-road
            this.speed = Math.min(this.maxSpeed, this.speed + accel);
        } else if (brake > 0) {
            // Brake
            this.speed = Math.max(0, this.speed - this.braking * brake);

            // Skid sound when braking at speed
            if (this.speed > this.maxSpeed * 0.5 && !this.skidding) {
                this.skidding = true;
                audioSystem.playSkid(0.5);
            }
        } else {
            // Natural deceleration
            this.speed = Math.max(0, this.speed - this.deceleration);
            this.skidding = false;
        }

        // Off-road drag
        if (isOffRoad) {
            this.speed *= this.offRoadDrag;

            // Skid sound when going off road at speed
            if (this.speed > this.maxSpeed * 0.3 && !this.skidding) {
                this.skidding = true;
                audioSystem.playSkid(0.3);
            }
        } else {
            this.skidding = false;
        }

        // Steering
        const speedFactor = this.speed / this.maxSpeed;
        const steerAmount = steering * this.steeringSpeed * (0.5 + speedFactor * 0.5);
        this.playerX += steerAmount;

        // Centrifugal force from curves
        this.playerX += curve * this.centrifugalForce * speedFactor;

        // Clamp player position
        const maxX = 1.5; // Allow going a bit off track
        this.playerX = Math.max(-maxX, Math.min(maxX, this.playerX));

        // Move forward
        this.playerZ += this.speed * this.deltaTime * 100;
    }

    updateOpponents() {
        const trackLength = track.getTotalLength();

        this.opponents.forEach(opponent => {
            // AI lane changing
            opponent.laneChangeTimer -= this.deltaTime;
            if (opponent.laneChangeTimer <= 0) {
                opponent.targetLane = (Math.random() - 0.5) * 1.5;
                opponent.laneChangeTimer = 2 + Math.random() * 3;
            }

            // Smoothly change lanes
            opponent.lane += (opponent.targetLane - opponent.lane) * 0.02;

            // Slow down in curves
            const segment = track.getSegment(opponent.z);
            const curve = segment ? Math.abs(segment.curve) : 0;
            const speedMod = 1 - curve * 0.2;

            // Move forward
            opponent.z += opponent.speed * speedMod * this.deltaTime * 100;

            // Lap tracking
            if (opponent.z >= trackLength) {
                opponent.z -= trackLength;
                opponent.lap++;
            }
        });
    }

    checkCollisions() {
        if (this.collisionCooldown > 0) return;

        const playerWidth = 0.15;
        const hitDistance = 300;

        this.opponents.forEach(opponent => {
            const relativeZ = opponent.z - this.playerZ;

            // Check if in collision range
            if (Math.abs(relativeZ) < hitDistance) {
                const laneDiff = Math.abs(opponent.lane - this.playerX * 2);

                if (laneDiff < playerWidth + 0.15) {
                    // Collision!
                    this.handleCollision(opponent, relativeZ);
                }
            }
        });
    }

    handleCollision(opponent, relativeZ) {
        this.collisionCooldown = 1; // 1 second cooldown

        // Play collision sound
        audioSystem.playCollision(0.8);

        // Reduce speed
        this.speed *= 0.5;

        // Push player sideways
        const pushDirection = this.playerX < opponent.lane / 2 ? -1 : 1;
        this.playerX += pushDirection * 0.2;

        // Push opponent
        opponent.lane += pushDirection * -0.5;

        // Flash effect
        if (this.renderer) {
            this.renderer.flash('red', 100);
        }
    }

    checkLapCompletion() {
        const trackLength = track.getTotalLength();

        // Check if crossed start/finish line
        if (this.playerZ >= trackLength) {
            // Record lap time
            const lapTime = this.raceTime - this.lapTimes.reduce((a, b) => a + b, 0);
            this.lapTimes.push(lapTime);

            if (lapTime < this.bestLapTime) {
                this.bestLapTime = lapTime;
            }

            audioSystem.playLapComplete();

            // Wrap position
            this.playerZ -= trackLength;
            this.lastLapZ = 0;

            // Increment lap
            this.currentLap++;

            // Check if race complete
            if (this.currentLap > this.totalLaps) {
                this.finishRace();
            }
        }
    }

    updatePosition() {
        let position = 1;
        const playerProgress = this.currentLap * track.getTotalLength() + this.playerZ;

        this.opponents.forEach(opponent => {
            const opponentProgress = opponent.lap * track.getTotalLength() + opponent.z;
            if (opponentProgress > playerProgress) {
                position++;
            }
        });

        this.position = position;
    }

    updateHUD() {
        // Lap counter
        const currentLapEl = document.getElementById('current-lap');
        const totalLapsEl = document.getElementById('total-laps');
        if (currentLapEl) currentLapEl.textContent = Math.min(this.currentLap, this.totalLaps);
        if (totalLapsEl) totalLapsEl.textContent = this.totalLaps;

        // Position
        const positionEl = document.getElementById('player-position');
        const ordinalEl = document.querySelector('.ordinal');
        if (positionEl) positionEl.textContent = this.position;
        if (ordinalEl) {
            const ordinals = ['ST', 'ND', 'RD', 'TH', 'TH', 'TH', 'TH'];
            ordinalEl.textContent = ordinals[this.position - 1] || 'TH';
        }

        // Time
        const timeEl = document.getElementById('race-time');
        if (timeEl) timeEl.textContent = this.formatTime(this.raceTime);

        // Speed
        const speedEl = document.getElementById('speed-value');
        const speedBarEl = document.getElementById('speed-bar');
        const displaySpeed = Math.floor(this.speed);
        if (speedEl) speedEl.textContent = displaySpeed;
        if (speedBarEl) speedBarEl.style.width = `${(this.speed / this.maxSpeed) * 100}%`;
    }

    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 100);
        return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
    }

    render() {
        // Create game state for renderer
        const gameState = {
            playerZ: this.playerZ,
            playerX: this.playerX,
            speed: this.speed,
            maxSpeed: this.maxSpeed,
            steering: this.steering,
            opponents: this.opponents
        };

        // Render
        if (this.renderer) {
            this.renderer.render(gameState);
        }
    }
}

// Initialize game when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const game = new Game();
    game.init();
});
