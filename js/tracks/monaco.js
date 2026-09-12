'use strict';
/* Monaco GT - Circuit de Monaco track definition.
   A track is pure data: a list of sections, each with an enter/hold/leave
   length (in segments, before lengthScale), a curve (+ right / - left),
   a hill delta (total rise over the section, in road-height units), what the
   roadsides look like, whether there are barriers, and scenery rules.

   Scenery rule: { sprite, side: -1 left | 1 right | 0 both, every: n segments,
                   offset: distance beyond the road edge (in road half-widths),
                   alt: [other sprite names to cycle through], jitter: 0..1 }
   Landmark:     { sprite, side, at: 0..1 fraction of the section, offset }

   Add another track by creating a file like this one and registering it in
   TRACKS (see js/track.js). */

const TRACK_MONACO = {
  id: 'monaco',
  name: 'MONACO',
  subtitle: 'CIRCUIT DE MONTE-CARLO',
  laps: 3,
  lengthScale: 1.55,
  sections: [
    // 1 --- Start / finish straight (Boulevard Albert 1er)
    { name: 'START / FINISH', announce: true, enter: 0, hold: 90, leave: 0, curve: 0, hill: 0,
      side: ['pave', 'pave'], barrier: [true, true],
      scenery: [
        { sprite: 'grandstand', side: -1, every: 34, offset: 0.55, alt: ['grandstand2'] },
        { sprite: 'bldg2', side: 1, every: 30, offset: 0.9, alt: ['bldg1', 'bldg4'] },
        { sprite: 'lamp', side: 1, every: 12, offset: 0.12 },
        { sprite: 'palm1', side: 1, every: 15, offset: 0.4, alt: ['palm2'] },
        { sprite: 'bill5', side: -1, every: 40, offset: 0.14, alt: ['bill1'] },
      ],
      landmarks: [{ sprite: 'gantry', side: 0, at: 0.02, offset: 0, x: 0 }],
    },
    // 2 --- approach and Sainte Dévote (tight right)
    { name: 'SAINTE DEVOTE', announce: true, enter: 16, hold: 30, leave: 16, curve: 5, hill: 4,
      side: ['pave', 'grass'], barrier: [true, true],
      scenery: [
        { sprite: 'tyres', side: 1, every: 5, offset: 0.06 },
        { sprite: 'tyres', side: -1, every: 7, offset: 0.06 },
        { sprite: 'grandstand2', side: 1, every: 30, offset: 0.7 },
        { sprite: 'bldg3', side: -1, every: 26, offset: 0.9, alt: ['bldg5'] },
      ],
      landmarks: [{ sprite: 'chapel', side: -1, at: 0.55, offset: 0.55 }],
    },
    // 3 --- Beau Rivage: long climb with kinks
    { name: 'BEAU RIVAGE', announce: true, enter: 20, hold: 40, leave: 20, curve: -1.5, hill: 26,
      side: ['pave', 'pave'], barrier: [true, true],
      scenery: [
        { sprite: 'bldg1', side: -1, every: 18, offset: 0.7, alt: ['bldg2', 'bldg3', 'bldg5'] },
        { sprite: 'bldg4', side: 1, every: 20, offset: 0.75, alt: ['bldg1', 'bldg5'] },
        { sprite: 'lamp', side: -1, every: 14, offset: 0.1 },
        { sprite: 'bill3', side: 1, every: 45, offset: 0.12 },
      ] },
    { name: 'BEAU RIVAGE 2', enter: 16, hold: 36, leave: 16, curve: 1.5, hill: 24,
      side: ['pave', 'pave'], barrier: [true, true],
      scenery: [
        { sprite: 'bldg5', side: -1, every: 18, offset: 0.7, alt: ['bldg4', 'bldg1'] },
        { sprite: 'bldg2', side: 1, every: 22, offset: 0.75, alt: ['bldg3'] },
        { sprite: 'palm2', side: 1, every: 12, offset: 0.25, alt: ['palm3', 'palm1'] },
      ] },
    { name: 'BEAU RIVAGE 3', enter: 14, hold: 20, leave: 14, curve: -1, hill: 16,
      side: ['pave', 'pave'], barrier: [true, true],
      scenery: [
        { sprite: 'bldg3', side: -1, every: 20, offset: 0.7, alt: ['bldg2'] },
        { sprite: 'bldg1', side: 1, every: 19, offset: 0.75, alt: ['bldg4'] },
        { sprite: 'lamp', side: -1, every: 14, offset: 0.1 },
      ] },
    // 4 --- Massenet (left, still climbing) - Hotel de Paris on the right
    { name: 'MASSENET', announce: true, enter: 18, hold: 44, leave: 18, curve: -4, hill: 12,
      side: ['pave', 'pave'], barrier: [true, true],
      scenery: [
        { sprite: 'bldg4', side: -1, every: 22, offset: 0.75, alt: ['bldg2'] },
        { sprite: 'tyres', side: 1, every: 6, offset: 0.06 },
        { sprite: 'palm1', side: 1, every: 12, offset: 0.3, alt: ['palm3'] },
      ],
      landmarks: [{ sprite: 'hotel', side: 1, at: 0.72, offset: 0.9 }],
    },
    // 5 --- Casino Square
    { name: 'CASINO SQUARE', announce: true, enter: 14, hold: 24, leave: 14, curve: 2, hill: 0,
      side: ['pave', 'pave'], barrier: [true, false],
      scenery: [
        { sprite: 'palm1', side: 1, every: 9, offset: 0.35, alt: ['palm2', 'palm3'] },
        { sprite: 'palm2', side: -1, every: 11, offset: 0.35, alt: ['palm1'] },
        { sprite: 'lamp', side: -1, every: 10, offset: 0.1 },
        { sprite: 'bldg2', side: -1, every: 24, offset: 0.8, alt: ['bldg4'] },
      ],
      landmarks: [{ sprite: 'casino', side: 1, at: 0.5, offset: 1.0 }],
    },
    { name: 'CASINO CREST', enter: 10, hold: 16, leave: 10, curve: -2, hill: -8,
      side: ['pave', 'pave'], barrier: [true, true],
      scenery: [
        { sprite: 'bldg5', side: 1, every: 22, offset: 0.75, alt: ['bldg1'] },
        { sprite: 'bldg3', side: -1, every: 20, offset: 0.7, alt: ['bldg2'] },
        { sprite: 'bill4', side: -1, every: 36, offset: 0.12 },
      ] },
    // 6 --- Mirabeau (right, downhill)
    { name: 'MIRABEAU', announce: true, enter: 14, hold: 36, leave: 14, curve: 5, hill: -30,
      side: ['pave', 'pave'], barrier: [true, true],
      scenery: [
        { sprite: 'tyres', side: -1, every: 5, offset: 0.06 },
        { sprite: 'bldg1', side: -1, every: 20, offset: 0.7, alt: ['bldg5', 'bldg2'] },
        { sprite: 'bldg4', side: 1, every: 24, offset: 0.8, alt: ['bldg3'] },
        { sprite: 'marshal', side: 1, every: 40, offset: 0.15 },
      ] },
    // 7 --- Fairmont hairpin (slowest corner in F1)
    { name: 'FAIRMONT HAIRPIN', announce: true, enter: 8, hold: 42, leave: 8, curve: 9, hill: -16,
      side: ['pave', 'pave'], barrier: [true, true],
      scenery: [
        { sprite: 'tyres', side: 1, every: 4, offset: 0.06 },
        { sprite: 'tyres', side: -1, every: 6, offset: 0.06 },
        { sprite: 'palm3', side: 1, every: 14, offset: 0.4 },
        { sprite: 'bill2', side: -1, every: 30, offset: 0.14, alt: ['bill1'] },
      ],
      landmarks: [{ sprite: 'hairpinhotel', side: -1, at: 0.5, offset: 0.95 }],
    },
    // 8 --- Portier (right) then the seafront
    { name: 'PORTIER', announce: true, enter: 10, hold: 30, leave: 10, curve: 4.5, hill: -10,
      side: ['pave', 'sea'], barrier: [true, true],
      scenery: [
        { sprite: 'tyres', side: -1, every: 6, offset: 0.06 },
        { sprite: 'bldg2', side: -1, every: 22, offset: 0.75, alt: ['bldg3'] },
        { sprite: 'yacht1', side: 1, every: 18, offset: 2.4, alt: ['yacht3'] },
        { sprite: 'lamp', side: 1, every: 12, offset: 0.1 },
      ] },
    { name: 'SEAFRONT', enter: 0, hold: 22, leave: 0, curve: 0.5, hill: -6,
      side: ['pave', 'sea'], barrier: [true, true],
      scenery: [
        { sprite: 'bldg4', side: -1, every: 20, offset: 0.75, alt: ['bldg1'] },
        { sprite: 'yacht2', side: 1, every: 16, offset: 2.6, alt: ['yacht1', 'yacht3'] },
        { sprite: 'palm1', side: 1, every: 10, offset: 0.3 },
      ] },
    // 9 --- The Tunnel (long sweeping right)
    { name: 'TUNNEL', announce: true, enter: 20, hold: 120, leave: 20, curve: 2.2, hill: -14,
      tunnel: true, side: ['pave', 'pave'], barrier: [false, false], scenery: [] },
    // 10 --- Nouvelle Chicane (harbour front)
    { name: 'NOUVELLE CHICANE', announce: true, enter: 0, hold: 16, leave: 0, curve: 0, hill: -6,
      side: ['pave', 'sea'], barrier: [true, true],
      scenery: [
        { sprite: 'grandstand2', side: -1, every: 30, offset: 0.6 },
        { sprite: 'yacht1', side: 1, every: 14, offset: 2.5, alt: ['yacht2', 'yacht3'] },
      ] },
    { name: 'CHICANE L', enter: 4, hold: 8, leave: 4, curve: -6.5, hill: -2,
      side: ['pave', 'sea'], barrier: [true, true],
      scenery: [{ sprite: 'tyres', side: 1, every: 4, offset: 0.06 }, { sprite: 'cone', side: -1, every: 3, offset: 0.02 }] },
    { name: 'CHICANE R', enter: 4, hold: 8, leave: 4, curve: 6.5, hill: 0,
      side: ['pave', 'sea'], barrier: [true, true],
      scenery: [{ sprite: 'tyres', side: -1, every: 4, offset: 0.06 }, { sprite: 'cone', side: 1, every: 3, offset: 0.02 }] },
    { name: 'HARBOUR', enter: 0, hold: 24, leave: 0, curve: 0, hill: 0,
      side: ['pave', 'sea'], barrier: [true, true],
      scenery: [
        { sprite: 'grandstand', side: -1, every: 32, offset: 0.55 },
        { sprite: 'yacht2', side: 1, every: 15, offset: 2.4, alt: ['yacht1', 'yacht3'] },
        { sprite: 'lamp', side: 1, every: 12, offset: 0.1 },
        { sprite: 'bill1', side: 1, every: 40, offset: 0.14, alt: ['bill4'] },
      ] },
    // 11 --- Tabac (fast left along the harbour)
    { name: 'TABAC', announce: true, enter: 14, hold: 34, leave: 14, curve: -4.5, hill: 0,
      side: ['pave', 'sea'], barrier: [true, true],
      scenery: [
        { sprite: 'grandstand2', side: -1, every: 28, offset: 0.55, alt: ['grandstand'] },
        { sprite: 'yacht3', side: 1, every: 14, offset: 2.5, alt: ['yacht1', 'yacht2'] },
        { sprite: 'tyres', side: 1, every: 6, offset: 0.06 },
      ] },
    // 12 --- Swimming Pool chicanes
    { name: 'SWIMMING POOL', announce: true, enter: 4, hold: 10, leave: 4, curve: -5, hill: 0,
      side: ['pave', 'sea'], barrier: [true, true],
      scenery: [{ sprite: 'tyres', side: 1, every: 4, offset: 0.06 }, { sprite: 'cone', side: -1, every: 3, offset: 0.02 }] },
    { name: 'PISCINE R', enter: 4, hold: 10, leave: 4, curve: 5, hill: 0,
      side: ['pave', 'sea'], barrier: [true, true],
      scenery: [{ sprite: 'tyres', side: -1, every: 4, offset: 0.06 }, { sprite: 'cone', side: 1, every: 3, offset: 0.02 }] },
    { name: 'PISCINE STRAIGHT', enter: 0, hold: 26, leave: 0, curve: 0, hill: 0,
      side: ['pave', 'sea'], barrier: [true, true],
      scenery: [
        { sprite: 'pool', side: -1, every: 28, offset: 0.5 },
        { sprite: 'yacht1', side: 1, every: 14, offset: 2.4, alt: ['yacht2'] },
        { sprite: 'bill6', side: 1, every: 30, offset: 0.14 },
      ] },
    { name: 'PISCINE R2', enter: 4, hold: 10, leave: 4, curve: 5, hill: 0,
      side: ['pave', 'sea'], barrier: [true, true],
      scenery: [{ sprite: 'tyres', side: -1, every: 4, offset: 0.06 }, { sprite: 'cone', side: 1, every: 3, offset: 0.02 }] },
    { name: 'PISCINE L2', enter: 4, hold: 10, leave: 4, curve: -5, hill: 2,
      side: ['pave', 'pave'], barrier: [true, true],
      scenery: [{ sprite: 'tyres', side: 1, every: 4, offset: 0.06 }, { sprite: 'grandstand2', side: -1, every: 26, offset: 0.55 }] },
    // 13 --- La Rascasse (tight right)
    { name: 'LA RASCASSE', announce: true, enter: 8, hold: 36, leave: 8, curve: 7.5, hill: 6,
      side: ['pave', 'pave'], barrier: [true, true],
      scenery: [
        { sprite: 'tyres', side: -1, every: 4, offset: 0.06 },
        { sprite: 'bldg3', side: 1, every: 18, offset: 0.7, alt: ['bldg5', 'bldg1'] },
        { sprite: 'bill3', side: -1, every: 26, offset: 0.14, alt: ['bill2'] },
        { sprite: 'marshal', side: 1, every: 40, offset: 0.15 },
      ] },
    // 14 --- Anthony Noghès and back onto the start straight
    { name: 'ANTHONY NOGHES', announce: true, enter: 8, hold: 24, leave: 8, curve: 3.5, hill: 2,
      side: ['pave', 'pave'], barrier: [true, true],
      scenery: [
        { sprite: 'tyres', side: -1, every: 5, offset: 0.06 },
        { sprite: 'grandstand', side: 1, every: 30, offset: 0.6, alt: ['grandstand2'] },
        { sprite: 'bldg2', side: -1, every: 22, offset: 0.8 },
      ] },
    { name: 'PIT STRAIGHT', enter: 8, hold: 12, leave: 8, curve: -1.5, hill: 0,
      side: ['pave', 'pave'], barrier: [true, true],
      scenery: [
        { sprite: 'grandstand', side: -1, every: 30, offset: 0.55 },
        { sprite: 'bldg1', side: 1, every: 24, offset: 0.85, alt: ['bldg4'] },
        { sprite: 'lamp', side: 1, every: 12, offset: 0.12 },
      ] },
    { name: 'FINAL STRAIGHT', enter: 0, hold: 40, leave: 0, curve: 0, hill: 0,
      side: ['pave', 'pave'], barrier: [true, true],
      scenery: [
        { sprite: 'grandstand', side: -1, every: 34, offset: 0.55, alt: ['grandstand2'] },
        { sprite: 'bldg4', side: 1, every: 26, offset: 0.9, alt: ['bldg2'] },
        { sprite: 'bill5', side: 1, every: 40, offset: 0.14, alt: ['bill4'] },
        { sprite: 'palm3', side: 1, every: 15, offset: 0.4, alt: ['palm1'] },
      ] },
  ],
};

const TRACKS = { monaco: TRACK_MONACO };
