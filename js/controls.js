/**
 * Monaco GT Racer - Touch/Swipe Control System
 * Optimized for mobile devices
 */

class Controls {
    constructor() {
        // Control state
        this.steering = 0;      // -1 (left) to 1 (right)
        this.throttle = 0;      // 0 to 1
        this.brake = 0;         // 0 to 1

        // Touch tracking
        this.steeringTouch = null;
        this.steeringStartX = 0;
        this.steeringSensitivity = 0.005;

        // DOM elements
        this.steeringZone = null;
        this.steeringIndicator = null;
        this.gasBtn = null;
        this.brakeBtn = null;

        // Keyboard state (for testing on desktop)
        this.keys = {
            left: false,
            right: false,
            up: false,
            down: false
        };

        // Tilt controls (optional)
        this.useTilt = false;
        this.tiltCalibration = 0;
    }

    init() {
        this.steeringZone = document.getElementById('steering-zone');
        this.steeringIndicator = document.getElementById('steering-indicator');
        this.gasBtn = document.getElementById('gas-btn');
        this.brakeBtn = document.getElementById('brake-btn');

        this.setupTouchControls();
        this.setupKeyboardControls();
        this.setupTiltControls();
    }

    setupTouchControls() {
        // Steering zone - left side of screen
        if (this.steeringZone) {
            this.steeringZone.addEventListener('touchstart', (e) => this.onSteeringStart(e), { passive: false });
            this.steeringZone.addEventListener('touchmove', (e) => this.onSteeringMove(e), { passive: false });
            this.steeringZone.addEventListener('touchend', (e) => this.onSteeringEnd(e), { passive: false });
            this.steeringZone.addEventListener('touchcancel', (e) => this.onSteeringEnd(e), { passive: false });

            // Mouse support for testing
            this.steeringZone.addEventListener('mousedown', (e) => this.onMouseSteeringStart(e));
            document.addEventListener('mousemove', (e) => this.onMouseSteeringMove(e));
            document.addEventListener('mouseup', (e) => this.onMouseSteeringEnd(e));
        }

        // Gas button
        if (this.gasBtn) {
            this.gasBtn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.throttle = 1;
                this.gasBtn.classList.add('active');
            }, { passive: false });

            this.gasBtn.addEventListener('touchend', (e) => {
                e.preventDefault();
                this.throttle = 0;
                this.gasBtn.classList.remove('active');
            }, { passive: false });

            this.gasBtn.addEventListener('touchcancel', (e) => {
                this.throttle = 0;
                this.gasBtn.classList.remove('active');
            }, { passive: false });

            // Mouse support
            this.gasBtn.addEventListener('mousedown', (e) => {
                e.preventDefault();
                this.throttle = 1;
                this.gasBtn.classList.add('active');
            });

            this.gasBtn.addEventListener('mouseup', (e) => {
                this.throttle = 0;
                this.gasBtn.classList.remove('active');
            });

            this.gasBtn.addEventListener('mouseleave', (e) => {
                if (e.buttons === 1) {
                    this.throttle = 0;
                    this.gasBtn.classList.remove('active');
                }
            });
        }

        // Brake button
        if (this.brakeBtn) {
            this.brakeBtn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.brake = 1;
                this.brakeBtn.classList.add('active');
            }, { passive: false });

            this.brakeBtn.addEventListener('touchend', (e) => {
                e.preventDefault();
                this.brake = 0;
                this.brakeBtn.classList.remove('active');
            }, { passive: false });

            this.brakeBtn.addEventListener('touchcancel', (e) => {
                this.brake = 0;
                this.brakeBtn.classList.remove('active');
            }, { passive: false });

            // Mouse support
            this.brakeBtn.addEventListener('mousedown', (e) => {
                e.preventDefault();
                this.brake = 1;
                this.brakeBtn.classList.add('active');
            });

            this.brakeBtn.addEventListener('mouseup', (e) => {
                this.brake = 0;
                this.brakeBtn.classList.remove('active');
            });

            this.brakeBtn.addEventListener('mouseleave', (e) => {
                if (e.buttons === 1) {
                    this.brake = 0;
                    this.brakeBtn.classList.remove('active');
                }
            });
        }
    }

    onSteeringStart(e) {
        e.preventDefault();
        const touch = e.touches[0];
        this.steeringTouch = touch.identifier;
        this.steeringStartX = touch.clientX;
        this.updateSteeringIndicator(0);
    }

    onSteeringMove(e) {
        e.preventDefault();

        for (let touch of e.touches) {
            if (touch.identifier === this.steeringTouch) {
                const deltaX = touch.clientX - this.steeringStartX;
                this.steering = Math.max(-1, Math.min(1, deltaX * this.steeringSensitivity));
                this.updateSteeringIndicator(this.steering);
                break;
            }
        }
    }

    onSteeringEnd(e) {
        e.preventDefault();

        // Check if our tracking touch ended
        let touchEnded = true;
        for (let touch of e.touches) {
            if (touch.identifier === this.steeringTouch) {
                touchEnded = false;
                break;
            }
        }

        if (touchEnded) {
            this.steeringTouch = null;
            // Smooth return to center
            this.returnSteeringToCenter();
        }
    }

    // Mouse steering support
    onMouseSteeringStart(e) {
        if (e.button !== 0) return;
        this.steeringTouch = 'mouse';
        this.steeringStartX = e.clientX;
        this.updateSteeringIndicator(0);
    }

    onMouseSteeringMove(e) {
        if (this.steeringTouch !== 'mouse') return;

        const deltaX = e.clientX - this.steeringStartX;
        this.steering = Math.max(-1, Math.min(1, deltaX * this.steeringSensitivity));
        this.updateSteeringIndicator(this.steering);
    }

    onMouseSteeringEnd(e) {
        if (this.steeringTouch === 'mouse') {
            this.steeringTouch = null;
            this.returnSteeringToCenter();
        }
    }

    returnSteeringToCenter() {
        // Animate steering back to center
        const animate = () => {
            if (this.steeringTouch !== null) return; // New touch started

            this.steering *= 0.85;
            if (Math.abs(this.steering) < 0.01) {
                this.steering = 0;
            } else {
                requestAnimationFrame(animate);
            }
            this.updateSteeringIndicator(this.steering);
        };
        animate();
    }

    updateSteeringIndicator(value) {
        if (!this.steeringIndicator) return;

        const indicator = this.steeringIndicator.querySelector('::after') ||
            this.steeringIndicator;

        // Move the inner circle
        const maxOffset = 25;
        const offset = value * maxOffset;

        this.steeringIndicator.style.setProperty('--steer-offset', `${offset}px`);

        // Update pseudo-element via CSS variable workaround
        const inner = this.steeringIndicator.querySelector('.inner');
        if (!inner) {
            // Create inner indicator if not exists
            const innerDiv = document.createElement('div');
            innerDiv.className = 'inner';
            innerDiv.style.cssText = `
                position: absolute;
                top: 50%;
                left: 50%;
                width: 20px;
                height: 20px;
                background: rgba(255,255,255,0.5);
                border-radius: 50%;
                transform: translate(-50%, -50%);
                transition: transform 0.05s;
            `;
            this.steeringIndicator.appendChild(innerDiv);
        }

        const innerIndicator = this.steeringIndicator.querySelector('.inner');
        if (innerIndicator) {
            innerIndicator.style.transform = `translate(calc(-50% + ${offset}px), -50%)`;
        }
    }

    setupKeyboardControls() {
        document.addEventListener('keydown', (e) => {
            switch (e.key.toLowerCase()) {
                case 'arrowleft':
                case 'a':
                    this.keys.left = true;
                    break;
                case 'arrowright':
                case 'd':
                    this.keys.right = true;
                    break;
                case 'arrowup':
                case 'w':
                    this.keys.up = true;
                    if (this.gasBtn) this.gasBtn.classList.add('active');
                    break;
                case 'arrowdown':
                case 's':
                    this.keys.down = true;
                    if (this.brakeBtn) this.brakeBtn.classList.add('active');
                    break;
            }
        });

        document.addEventListener('keyup', (e) => {
            switch (e.key.toLowerCase()) {
                case 'arrowleft':
                case 'a':
                    this.keys.left = false;
                    break;
                case 'arrowright':
                case 'd':
                    this.keys.right = false;
                    break;
                case 'arrowup':
                case 'w':
                    this.keys.up = false;
                    if (this.gasBtn) this.gasBtn.classList.remove('active');
                    break;
                case 'arrowdown':
                case 's':
                    this.keys.down = false;
                    if (this.brakeBtn) this.brakeBtn.classList.remove('active');
                    break;
            }
        });
    }

    setupTiltControls() {
        // Check for device orientation support
        if (window.DeviceOrientationEvent) {
            // Request permission on iOS 13+
            if (typeof DeviceOrientationEvent.requestPermission === 'function') {
                // Will need user gesture to request
                document.addEventListener('click', () => {
                    DeviceOrientationEvent.requestPermission()
                        .then(permission => {
                            if (permission === 'granted') {
                                this.enableTiltControls();
                            }
                        })
                        .catch(console.error);
                }, { once: true });
            } else {
                // Non-iOS devices
                this.enableTiltControls();
            }
        }
    }

    enableTiltControls() {
        window.addEventListener('deviceorientation', (e) => {
            if (!this.useTilt) return;

            // gamma is left-right tilt (-90 to 90)
            const gamma = e.gamma || 0;

            // Apply calibration
            const adjustedGamma = gamma - this.tiltCalibration;

            // Map to steering (-1 to 1)
            // Typically ±30 degrees is comfortable range
            this.steering = Math.max(-1, Math.min(1, adjustedGamma / 30));
        });
    }

    calibrateTilt() {
        // Call this when player is holding device level
        window.addEventListener('deviceorientation', (e) => {
            this.tiltCalibration = e.gamma || 0;
        }, { once: true });
    }

    toggleTiltControls() {
        this.useTilt = !this.useTilt;
        if (this.useTilt) {
            this.calibrateTilt();
        }
        return this.useTilt;
    }

    update() {
        // Apply keyboard controls
        if (this.keys.left && !this.steeringTouch) {
            this.steering = Math.max(-1, this.steering - 0.08);
        } else if (this.keys.right && !this.steeringTouch) {
            this.steering = Math.min(1, this.steering + 0.08);
        } else if (!this.steeringTouch && !this.useTilt) {
            // Return to center when no input
            this.steering *= 0.92;
            if (Math.abs(this.steering) < 0.01) {
                this.steering = 0;
            }
        }

        if (this.keys.up) {
            this.throttle = 1;
        } else if (!this.gasBtn?.classList.contains('active')) {
            // Only reset if touch isn't active
            if (this.throttle > 0 && !this.keys.up) {
                this.throttle = 0;
            }
        }

        if (this.keys.down) {
            this.brake = 1;
        } else if (!this.brakeBtn?.classList.contains('active')) {
            if (this.brake > 0 && !this.keys.down) {
                this.brake = 0;
            }
        }

        this.updateSteeringIndicator(this.steering);
    }

    getState() {
        return {
            steering: this.steering,
            throttle: this.throttle,
            brake: this.brake
        };
    }

    reset() {
        this.steering = 0;
        this.throttle = 0;
        this.brake = 0;
        this.steeringTouch = null;
        this.updateSteeringIndicator(0);
    }

    show() {
        const controls = document.getElementById('touch-controls');
        if (controls) controls.classList.remove('hidden');
    }

    hide() {
        const controls = document.getElementById('touch-controls');
        if (controls) controls.classList.add('hidden');
    }
}

// Export singleton
const controls = new Controls();
