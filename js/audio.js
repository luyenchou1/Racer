/**
 * Monaco GT Racer - 4-Channel Arcade Audio System
 * Generates all sounds procedurally using Web Audio API
 */

class AudioSystem {
    constructor() {
        this.context = null;
        this.masterGain = null;
        this.channels = {
            music: null,      // Channel 1: Background music
            engine: null,     // Channel 2: Engine sounds
            sfx: null,        // Channel 3: Sound effects (skid, collision)
            ambient: null     // Channel 4: Ambient/crowd sounds
        };
        this.isInitialized = false;
        this.isMuted = false;

        // Music state
        this.musicPlaying = false;
        this.currentBeat = 0;
        this.bpm = 140;
        this.musicInterval = null;

        // Engine state
        this.engineOscillators = [];
        this.engineGain = null;
        this.currentRPM = 0;
        this.targetRPM = 0;
    }

    async init() {
        if (this.isInitialized) return;

        try {
            this.context = new (window.AudioContext || window.webkitAudioContext)();

            // Master gain
            this.masterGain = this.context.createGain();
            this.masterGain.gain.value = 0.7;
            this.masterGain.connect(this.context.destination);

            // Create 4 channels with individual gain control
            for (const channel in this.channels) {
                const gain = this.context.createGain();
                gain.connect(this.masterGain);
                this.channels[channel] = {
                    gain: gain,
                    volume: channel === 'music' ? 0.4 : channel === 'engine' ? 0.5 : 0.6
                };
                gain.gain.value = this.channels[channel].volume;
            }

            this.isInitialized = true;
            console.log('Audio system initialized with 4 channels');
        } catch (e) {
            console.warn('Web Audio not supported:', e);
        }
    }

    resume() {
        if (this.context && this.context.state === 'suspended') {
            this.context.resume();
        }
    }

    // ==================== MUSIC SYSTEM (Channel 1) ====================

    startMusic() {
        if (!this.isInitialized || this.musicPlaying) return;
        this.musicPlaying = true;
        this.currentBeat = 0;

        const beatDuration = 60 / this.bpm;

        // Monaco-inspired driving music - upbeat arcade style
        this.musicInterval = setInterval(() => {
            this.playMusicBeat();
            this.currentBeat = (this.currentBeat + 1) % 64;
        }, beatDuration * 1000 / 2); // 8th notes
    }

    stopMusic() {
        this.musicPlaying = false;
        if (this.musicInterval) {
            clearInterval(this.musicInterval);
            this.musicInterval = null;
        }
    }

    playMusicBeat() {
        const beat = this.currentBeat;
        const ctx = this.context;
        const channel = this.channels.music.gain;

        // Bass line pattern (every 4 beats)
        if (beat % 4 === 0) {
            const bassNotes = [110, 110, 146.83, 130.81, 110, 110, 164.81, 146.83];
            const noteIndex = Math.floor(beat / 8) % bassNotes.length;
            this.playNote(bassNotes[noteIndex], 0.15, 'square', channel, 0.3);
        }

        // Kick drum (every 4 beats)
        if (beat % 4 === 0) {
            this.playKick(channel);
        }

        // Snare (beats 2 and 6)
        if (beat % 8 === 4) {
            this.playSnare(channel);
        }

        // Hi-hat pattern
        if (beat % 2 === 0) {
            this.playHiHat(channel, beat % 4 === 0 ? 0.15 : 0.08);
        }

        // Melody line (arpeggiated)
        if (beat % 2 === 0) {
            const melodyPattern = [
                329.63, 392.00, 493.88, 392.00, // E4, G4, B4, G4
                349.23, 440.00, 523.25, 440.00, // F4, A4, C5, A4
                329.63, 392.00, 493.88, 587.33, // E4, G4, B4, D5
                392.00, 493.88, 587.33, 659.25  // G4, B4, D5, E5
            ];
            const patternIndex = Math.floor(beat / 2) % melodyPattern.length;

            if (Math.random() > 0.2) { // Add some variation
                this.playNote(melodyPattern[patternIndex], 0.1, 'triangle', channel, 0.2);
            }
        }

        // Lead synth (longer notes on certain beats)
        if (beat % 16 === 0 || beat % 16 === 8) {
            const leadNotes = [659.25, 587.33, 523.25, 493.88];
            const noteIndex = Math.floor(beat / 16) % leadNotes.length;
            this.playNote(leadNotes[noteIndex], 0.3, 'sawtooth', channel, 0.15);
        }
    }

    playNote(freq, duration, type, destination, volume = 0.2) {
        const ctx = this.context;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = type;
        osc.frequency.value = freq;

        gain.gain.setValueAtTime(volume, ctx.currentTime);
        gain.gain.exponentialDecayTo = (value, time) => {
            gain.gain.exponentialRampToValueAtTime(Math.max(value, 0.001), time);
        };
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

        osc.connect(gain);
        gain.connect(destination);

        osc.start();
        osc.stop(ctx.currentTime + duration);
    }

    playKick(destination) {
        const ctx = this.context;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.frequency.setValueAtTime(150, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 0.1);

        gain.gain.setValueAtTime(0.4, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);

        osc.connect(gain);
        gain.connect(destination);

        osc.start();
        osc.stop(ctx.currentTime + 0.15);
    }

    playSnare(destination) {
        const ctx = this.context;

        // Noise component
        const bufferSize = ctx.sampleRate * 0.1;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = ctx.createBufferSource();
        noise.buffer = buffer;

        const noiseFilter = ctx.createBiquadFilter();
        noiseFilter.type = 'highpass';
        noiseFilter.frequency.value = 1000;

        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(0.3, ctx.currentTime);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);

        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(destination);

        // Tone component
        const osc = ctx.createOscillator();
        const oscGain = ctx.createGain();
        osc.frequency.value = 180;
        oscGain.gain.setValueAtTime(0.2, ctx.currentTime);
        oscGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);

        osc.connect(oscGain);
        oscGain.connect(destination);

        noise.start();
        osc.start();
        noise.stop(ctx.currentTime + 0.1);
        osc.stop(ctx.currentTime + 0.05);
    }

    playHiHat(destination, volume = 0.1) {
        const ctx = this.context;

        const bufferSize = ctx.sampleRate * 0.05;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 7000;

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(volume, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(destination);

        noise.start();
        noise.stop(ctx.currentTime + 0.05);
    }

    // ==================== ENGINE SYSTEM (Channel 2) ====================

    startEngine() {
        if (!this.isInitialized) return;

        this.stopEngine(); // Clear any existing

        const ctx = this.context;
        const channel = this.channels.engine.gain;

        this.engineGain = ctx.createGain();
        this.engineGain.gain.value = 0.3;
        this.engineGain.connect(channel);

        // Create multiple oscillators for rich engine sound
        const frequencies = [80, 160, 240]; // Fundamental + harmonics

        frequencies.forEach((baseFreq, i) => {
            const osc = ctx.createOscillator();
            const oscGain = ctx.createGain();

            osc.type = i === 0 ? 'sawtooth' : 'square';
            osc.frequency.value = baseFreq;

            oscGain.gain.value = 0.3 / (i + 1); // Decreasing volume for harmonics

            osc.connect(oscGain);
            oscGain.connect(this.engineGain);

            osc.start();
            this.engineOscillators.push({ osc, gain: oscGain, baseFreq });
        });

        // Add some noise for texture
        const bufferSize = ctx.sampleRate * 2;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        noise.loop = true;

        const noiseFilter = ctx.createBiquadFilter();
        noiseFilter.type = 'bandpass';
        noiseFilter.frequency.value = 500;
        noiseFilter.Q.value = 2;

        const noiseGain = ctx.createGain();
        noiseGain.gain.value = 0.05;

        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(this.engineGain);

        noise.start();
        this.engineOscillators.push({ osc: noise, gain: noiseGain, filter: noiseFilter, isNoise: true });
    }

    updateEngine(speed, maxSpeed, throttle) {
        if (!this.engineOscillators.length) return;

        // Calculate RPM based on speed (0-1)
        const speedRatio = speed / maxSpeed;
        const rpm = 800 + (speedRatio * 6000); // 800-6800 RPM range

        // Smooth transition
        this.targetRPM = rpm;
        this.currentRPM += (this.targetRPM - this.currentRPM) * 0.1;

        const rpmRatio = this.currentRPM / 7000;

        this.engineOscillators.forEach(({ osc, gain, baseFreq, isNoise, filter }) => {
            if (isNoise) {
                // Adjust noise filter based on RPM
                if (filter) {
                    filter.frequency.value = 300 + (rpmRatio * 800);
                }
                gain.gain.value = 0.03 + (throttle * 0.04);
            } else {
                // Pitch shift based on RPM
                const freqMultiplier = 0.5 + (rpmRatio * 1.5);
                osc.frequency.setTargetAtTime(baseFreq * freqMultiplier, this.context.currentTime, 0.05);

                // Volume based on throttle
                const baseVol = 0.15 + (throttle * 0.15);
                gain.gain.setTargetAtTime(baseVol / (this.engineOscillators.indexOf(arguments[0]) + 1 || 1), this.context.currentTime, 0.05);
            }
        });

        // Overall engine volume
        if (this.engineGain) {
            const vol = 0.2 + (throttle * 0.2) + (rpmRatio * 0.1);
            this.engineGain.gain.setTargetAtTime(vol, this.context.currentTime, 0.05);
        }
    }

    stopEngine() {
        this.engineOscillators.forEach(({ osc }) => {
            try {
                osc.stop();
            } catch (e) { }
        });
        this.engineOscillators = [];
        this.engineGain = null;
    }

    // ==================== SFX SYSTEM (Channel 3) ====================

    playSkid(intensity = 1) {
        if (!this.isInitialized) return;

        const ctx = this.context;
        const channel = this.channels.sfx.gain;

        // White noise with filter for skid sound
        const bufferSize = ctx.sampleRate * 0.3;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
        }

        const noise = ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 2000;
        filter.Q.value = 1;

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.3 * intensity, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(channel);

        noise.start();
        noise.stop(ctx.currentTime + 0.3);
    }

    playCollision(intensity = 1) {
        if (!this.isInitialized) return;

        const ctx = this.context;
        const channel = this.channels.sfx.gain;

        // Impact sound - low frequency thump
        const osc = ctx.createOscillator();
        const oscGain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(100 * intensity, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 0.1);

        oscGain.gain.setValueAtTime(0.5 * intensity, ctx.currentTime);
        oscGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);

        osc.connect(oscGain);
        oscGain.connect(channel);

        // Noise burst
        const bufferSize = ctx.sampleRate * 0.15;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.2));
        }

        const noise = ctx.createBufferSource();
        noise.buffer = buffer;

        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(0.4 * intensity, ctx.currentTime);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);

        noise.connect(noiseGain);
        noiseGain.connect(channel);

        osc.start();
        noise.start();
        osc.stop(ctx.currentTime + 0.2);
        noise.stop(ctx.currentTime + 0.15);
    }

    playLapComplete() {
        if (!this.isInitialized) return;

        const ctx = this.context;
        const channel = this.channels.sfx.gain;

        // Triumphant arpeggio
        const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
        notes.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = 'square';
            osc.frequency.value = freq;

            const startTime = ctx.currentTime + (i * 0.08);
            gain.gain.setValueAtTime(0, startTime);
            gain.gain.linearRampToValueAtTime(0.2, startTime + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.3);

            osc.connect(gain);
            gain.connect(channel);

            osc.start(startTime);
            osc.stop(startTime + 0.3);
        });
    }

    playCountdown(final = false) {
        if (!this.isInitialized) return;

        const ctx = this.context;
        const channel = this.channels.sfx.gain;

        const freq = final ? 880 : 440;
        const duration = final ? 0.5 : 0.2;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'square';
        osc.frequency.value = freq;

        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

        osc.connect(gain);
        gain.connect(channel);

        osc.start();
        osc.stop(ctx.currentTime + duration);
    }

    playRaceFinish(won = true) {
        if (!this.isInitialized) return;

        const ctx = this.context;
        const channel = this.channels.sfx.gain;

        if (won) {
            // Victory fanfare
            const melody = [
                { freq: 523.25, time: 0, dur: 0.15 },
                { freq: 659.25, time: 0.15, dur: 0.15 },
                { freq: 783.99, time: 0.3, dur: 0.15 },
                { freq: 1046.50, time: 0.45, dur: 0.4 },
                { freq: 783.99, time: 0.65, dur: 0.15 },
                { freq: 1046.50, time: 0.8, dur: 0.6 }
            ];

            melody.forEach(({ freq, time, dur }) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();

                osc.type = 'square';
                osc.frequency.value = freq;

                const startTime = ctx.currentTime + time;
                gain.gain.setValueAtTime(0.25, startTime);
                gain.gain.setValueAtTime(0.25, startTime + dur - 0.05);
                gain.gain.exponentialRampToValueAtTime(0.001, startTime + dur);

                osc.connect(gain);
                gain.connect(channel);

                osc.start(startTime);
                osc.stop(startTime + dur);
            });
        } else {
            // Sad trombone
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(311.13, ctx.currentTime);
            osc.frequency.linearRampToValueAtTime(155.56, ctx.currentTime + 1);

            gain.gain.setValueAtTime(0.2, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1);

            osc.connect(gain);
            gain.connect(channel);

            osc.start();
            osc.stop(ctx.currentTime + 1);
        }
    }

    // ==================== AMBIENT SYSTEM (Channel 4) ====================

    startAmbient() {
        if (!this.isInitialized) return;

        const ctx = this.context;
        const channel = this.channels.ambient.gain;

        // Crowd noise
        const bufferSize = ctx.sampleRate * 4;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            // Modulated noise for crowd-like sound
            const mod = Math.sin(i / 1000) * 0.5 + 0.5;
            data[i] = (Math.random() * 2 - 1) * mod * 0.3;
        }

        this.crowdNoise = ctx.createBufferSource();
        this.crowdNoise.buffer = buffer;
        this.crowdNoise.loop = true;

        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 800;
        filter.Q.value = 0.5;

        const gain = ctx.createGain();
        gain.gain.value = 0.08;

        this.crowdNoise.connect(filter);
        filter.connect(gain);
        gain.connect(channel);

        this.crowdNoise.start();
    }

    stopAmbient() {
        if (this.crowdNoise) {
            try {
                this.crowdNoise.stop();
            } catch (e) { }
            this.crowdNoise = null;
        }
    }

    // ==================== CONTROL ====================

    setMasterVolume(volume) {
        if (this.masterGain) {
            this.masterGain.gain.value = Math.max(0, Math.min(1, volume));
        }
    }

    setChannelVolume(channel, volume) {
        if (this.channels[channel]) {
            this.channels[channel].gain.gain.value = Math.max(0, Math.min(1, volume));
            this.channels[channel].volume = volume;
        }
    }

    mute() {
        this.isMuted = true;
        if (this.masterGain) {
            this.masterGain.gain.value = 0;
        }
    }

    unmute() {
        this.isMuted = false;
        if (this.masterGain) {
            this.masterGain.gain.value = 0.7;
        }
    }

    toggleMute() {
        if (this.isMuted) {
            this.unmute();
        } else {
            this.mute();
        }
        return this.isMuted;
    }
}

// Export singleton
const audioSystem = new AudioSystem();
