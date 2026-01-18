/**
 * Monaco GT Racer - Track Definition
 * Monaco-inspired circuit with iconic features
 */

class Track {
    constructor() {
        // Track properties
        this.name = 'Monaco';
        this.length = 3337; // Monaco GP length in meters (simplified)
        this.totalSegments = 600;
        this.segmentLength = 200; // World units per segment
        this.roadWidth = 2000;
        this.rumbleWidth = 100;

        // Track segments
        this.segments = [];

        // Colors - Monaco themed
        this.colors = {
            sky: {
                top: '#1a1a4e',
                bottom: '#4a6fa5'
            },
            mountains: '#2d4a6f',
            sea: '#1a5f7a',
            road: {
                light: '#6B6B6B',
                dark: '#5B5B5B'
            },
            grass: {
                light: '#4a7c4e',
                dark: '#3d6640'
            },
            rumble: {
                light: '#ff0000',
                dark: '#ffffff'
            },
            lane: '#ffffff',
            startLine: '#ffffff'
        };

        // Scenery objects per segment
        this.sceneryTypes = [
            'palmTree', 'building', 'barrier', 'grandstand',
            'yacht', 'casino', 'tunnel', 'billboard',
            'lightPost', 'tireBarrier'
        ];
    }

    init() {
        this.buildTrack();
    }

    buildTrack() {
        this.segments = [];

        // Build each segment with curve and hill data
        for (let i = 0; i < this.totalSegments; i++) {
            const segment = this.createSegment(i);
            this.segments.push(segment);
        }

        // Add Monaco-specific features
        this.addMonacoFeatures();
    }

    createSegment(index) {
        return {
            index: index,
            p1: { world: { z: index * this.segmentLength }, camera: {}, screen: {} },
            p2: { world: { z: (index + 1) * this.segmentLength }, camera: {}, screen: {} },
            curve: 0,
            hill: 0,
            color: index % 2 === 0 ? 'light' : 'dark',
            sceneryLeft: [],
            sceneryRight: [],
            isStartLine: index === 0,
            isTunnel: false,
            tunnelProgress: 0
        };
    }

    addMonacoFeatures() {
        // Monaco-inspired track layout
        // The track is divided into sections mimicking the real Monaco circuit

        // Section 1: Start/Finish straight (Pit straight)
        // Segments 0-30
        this.addStraightSection(0, 30, {
            leftScenery: ['grandstand', 'lightPost'],
            rightScenery: ['barrier', 'billboard'],
            startLine: true
        });

        // Section 2: Sainte Devote (right hairpin)
        // Segments 30-60
        this.addCurveSection(30, 60, 0.8, 0, {
            leftScenery: ['barrier', 'lightPost'],
            rightScenery: ['tireBarrier', 'barrier']
        });

        // Section 3: Beau Rivage (uphill with slight curves)
        // Segments 60-120
        this.addHillSection(60, 120, 80, {
            curves: [0.2, -0.15, 0.1],
            leftScenery: ['building', 'palmTree'],
            rightScenery: ['building', 'lightPost']
        });

        // Section 4: Casino Square (sharp right then left)
        // Segments 120-170
        this.addCasinoSection(120, 170);

        // Section 5: Mirabeau (downhill right)
        // Segments 170-210
        this.addCurveSection(170, 210, 0.6, -40, {
            leftScenery: ['palmTree', 'barrier'],
            rightScenery: ['building', 'lightPost']
        });

        // Section 6: Grand Hotel Hairpin (tight hairpin)
        // Segments 210-250
        this.addHairpinSection(210, 250);

        // Section 7: Portier (approaching tunnel)
        // Segments 250-290
        this.addStraightSection(250, 290, {
            leftScenery: ['barrier', 'lightPost'],
            rightScenery: ['building'],
            hill: -20
        });

        // Section 8: Tunnel
        // Segments 290-360
        this.addTunnelSection(290, 360);

        // Section 9: Nouvelle Chicane (out of tunnel, S-curves)
        // Segments 360-420
        this.addChicaneSection(360, 420);

        // Section 10: Tabac (slight left, harbor view)
        // Segments 420-470
        this.addHarborSection(420, 470);

        // Section 11: Swimming Pool (fast chicane)
        // Segments 470-520
        this.addFastChicane(470, 520);

        // Section 12: La Rascasse (tight right)
        // Segments 520-560
        this.addCurveSection(520, 560, 0.7, 0, {
            leftScenery: ['barrier', 'tireBarrier'],
            rightScenery: ['grandstand', 'billboard']
        });

        // Section 13: Anthony Noghes (final corner)
        // Segments 560-590
        this.addCurveSection(560, 590, 0.5, 0, {
            leftScenery: ['barrier'],
            rightScenery: ['barrier', 'lightPost']
        });

        // Section 14: Return to start
        // Segments 590-600
        this.addStraightSection(590, 600, {
            leftScenery: ['grandstand'],
            rightScenery: ['barrier'],
            connectToStart: true
        });
    }

    addStraightSection(start, end, options = {}) {
        for (let i = start; i < end; i++) {
            if (this.segments[i]) {
                this.segments[i].curve = 0;
                this.segments[i].hill = options.hill || 0;

                if (options.startLine && i === start) {
                    this.segments[i].isStartLine = true;
                }

                this.addSceneryToSegment(i, options);
            }
        }
    }

    addCurveSection(start, end, intensity, hill = 0, options = {}) {
        const midpoint = (start + end) / 2;

        for (let i = start; i < end; i++) {
            if (this.segments[i]) {
                // Smooth curve entry and exit
                const progress = (i - start) / (end - start);
                const curveProgress = Math.sin(progress * Math.PI);
                this.segments[i].curve = intensity * curveProgress;
                this.segments[i].hill = hill * curveProgress;

                this.addSceneryToSegment(i, options);
            }
        }
    }

    addHillSection(start, end, height, options = {}) {
        const curves = options.curves || [0];
        const curveCount = curves.length;

        for (let i = start; i < end; i++) {
            if (this.segments[i]) {
                const progress = (i - start) / (end - start);
                // Hill profile
                this.segments[i].hill = height * Math.sin(progress * Math.PI);

                // Apply curves
                const curveIndex = Math.floor(progress * curveCount);
                const curveProgress = (progress * curveCount) % 1;
                this.segments[i].curve = curves[Math.min(curveIndex, curveCount - 1)] *
                    Math.sin(curveProgress * Math.PI);

                this.addSceneryToSegment(i, options);
            }
        }
    }

    addCasinoSection(start, end) {
        // Casino square - iconic Monaco location
        const mid = Math.floor((start + end) / 2);

        for (let i = start; i < end; i++) {
            if (this.segments[i]) {
                const progress = (i - start) / (end - start);

                // Right curve then left
                if (i < mid) {
                    this.segments[i].curve = 0.5 * Math.sin((progress * 2) * Math.PI);
                } else {
                    this.segments[i].curve = -0.4 * Math.sin(((progress - 0.5) * 2) * Math.PI);
                }

                // Slight uphill then flat
                this.segments[i].hill = 30 * Math.max(0, 1 - progress * 2);

                // Casino on the right at the apex
                if (i === mid) {
                    this.segments[i].sceneryRight.push({
                        type: 'casino',
                        offset: 1.5
                    });
                }

                // Palm trees and light posts
                if (i % 4 === 0) {
                    this.segments[i].sceneryLeft.push({
                        type: 'palmTree',
                        offset: 1.2
                    });
                }
                if (i % 6 === 0) {
                    this.segments[i].sceneryRight.push({
                        type: 'lightPost',
                        offset: 1.1
                    });
                }
            }
        }
    }

    addHairpinSection(start, end) {
        // Grand Hotel Hairpin - slowest corner
        for (let i = start; i < end; i++) {
            if (this.segments[i]) {
                const progress = (i - start) / (end - start);

                // Very tight right-hand turn
                this.segments[i].curve = 1.2 * Math.sin(progress * Math.PI);

                // Slight downhill
                this.segments[i].hill = -20 * (1 - Math.abs(progress - 0.5) * 2);

                // Barriers on both sides
                if (i % 3 === 0) {
                    this.segments[i].sceneryLeft.push({
                        type: 'barrier',
                        offset: 1.05
                    });
                    this.segments[i].sceneryRight.push({
                        type: 'tireBarrier',
                        offset: 1.05
                    });
                }
            }
        }
    }

    addTunnelSection(start, end) {
        // Monaco tunnel - unique covered section
        for (let i = start; i < end; i++) {
            if (this.segments[i]) {
                const progress = (i - start) / (end - start);

                // Gentle left curve through tunnel
                this.segments[i].curve = -0.3 * Math.sin(progress * Math.PI * 2);

                // Slight uphill then downhill
                this.segments[i].hill = 30 * Math.sin(progress * Math.PI);

                // Mark as tunnel
                this.segments[i].isTunnel = true;
                this.segments[i].tunnelProgress = progress;

                // Tunnel entrance/exit sprites
                if (i === start) {
                    this.segments[i].sceneryLeft.push({
                        type: 'tunnel',
                        offset: 0,
                        isEntrance: true
                    });
                }

                // Light posts inside
                if (i % 5 === 0) {
                    this.segments[i].sceneryLeft.push({
                        type: 'lightPost',
                        offset: 1.0
                    });
                    this.segments[i].sceneryRight.push({
                        type: 'lightPost',
                        offset: 1.0
                    });
                }
            }
        }
    }

    addChicaneSection(start, end) {
        // Nouvelle Chicane
        for (let i = start; i < end; i++) {
            if (this.segments[i]) {
                const progress = (i - start) / (end - start);

                // S-curve pattern
                this.segments[i].curve = 0.6 * Math.sin(progress * Math.PI * 3);

                // Coming out of tunnel is downhill
                this.segments[i].hill = -40 * (1 - progress);

                // Barriers
                if (i % 4 === 0) {
                    this.segments[i].sceneryLeft.push({
                        type: 'barrier',
                        offset: 1.1
                    });
                    this.segments[i].sceneryRight.push({
                        type: 'barrier',
                        offset: 1.1
                    });
                }
            }
        }
    }

    addHarborSection(start, end) {
        // Tabac corner with harbor/yacht view
        for (let i = start; i < end; i++) {
            if (this.segments[i]) {
                const progress = (i - start) / (end - start);

                // Gentle left curve
                this.segments[i].curve = -0.35 * Math.sin(progress * Math.PI);
                this.segments[i].hill = 0;

                // Yachts visible on left (harbor side)
                if (i % 8 === 0) {
                    this.segments[i].sceneryLeft.push({
                        type: 'yacht',
                        offset: 2.5
                    });
                }

                // Barriers on right
                if (i % 5 === 0) {
                    this.segments[i].sceneryRight.push({
                        type: 'barrier',
                        offset: 1.1
                    });
                }

                // Billboards
                if (i === start + 10) {
                    this.segments[i].sceneryRight.push({
                        type: 'billboard',
                        offset: 1.3
                    });
                }
            }
        }
    }

    addFastChicane(start, end) {
        // Swimming Pool complex - fast S-curves
        for (let i = start; i < end; i++) {
            if (this.segments[i]) {
                const progress = (i - start) / (end - start);

                // Fast S-curves
                this.segments[i].curve = 0.7 * Math.sin(progress * Math.PI * 4);
                this.segments[i].hill = 0;

                // Barriers close to track
                if (i % 3 === 0) {
                    this.segments[i].sceneryLeft.push({
                        type: 'tireBarrier',
                        offset: 1.05
                    });
                    this.segments[i].sceneryRight.push({
                        type: 'tireBarrier',
                        offset: 1.05
                    });
                }

                // Grandstand
                if (i === Math.floor((start + end) / 2)) {
                    this.segments[i].sceneryRight.push({
                        type: 'grandstand',
                        offset: 1.5
                    });
                }
            }
        }
    }

    addSceneryToSegment(index, options) {
        if (!this.segments[index]) return;

        const leftTypes = options.leftScenery || [];
        const rightTypes = options.rightScenery || [];

        // Add scenery based on segment index
        if (leftTypes.length > 0 && index % 5 === 0) {
            const type = leftTypes[Math.floor(Math.random() * leftTypes.length)];
            this.segments[index].sceneryLeft.push({
                type: type,
                offset: 1.2 + Math.random() * 0.3
            });
        }

        if (rightTypes.length > 0 && index % 5 === 2) {
            const type = rightTypes[Math.floor(Math.random() * rightTypes.length)];
            this.segments[index].sceneryRight.push({
                type: type,
                offset: 1.2 + Math.random() * 0.3
            });
        }
    }

    getSegment(z) {
        const index = Math.floor(z / this.segmentLength) % this.totalSegments;
        return this.segments[index];
    }

    getSegmentByIndex(index) {
        return this.segments[index % this.totalSegments];
    }

    getTotalLength() {
        return this.totalSegments * this.segmentLength;
    }

    // Get track position as percentage
    getProgress(z) {
        return (z % this.getTotalLength()) / this.getTotalLength();
    }

    // Find curve at position
    getCurveAt(z) {
        const segment = this.getSegment(z);
        return segment ? segment.curve : 0;
    }

    // Check if position is in tunnel
    isInTunnel(z) {
        const segment = this.getSegment(z);
        return segment ? segment.isTunnel : false;
    }
}

// Export singleton
const track = new Track();
