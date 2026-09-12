# Monaco GT

A 16-bit style arcade GT racer for your phone: three laps around the streets of
Monte-Carlo against six AI cars, rendered to a low-res pixel buffer with a
fully procedural 4-channel chiptune soundtrack. Plain static HTML/JS, no build
step, no dependencies. Made for iPhone Safari (add it to the Home Screen for
full screen) but runs on any modern browser.

## Controls

**Touch** (portrait or landscape)

| Zone | Action |
| --- | --- |
| Left pad | Drag left/right to steer (relative to where your thumb landed) |
| GAS / BRAKE | Right-hand pedals; a thumb can slide between them |
| TURBO | Burns the turbo meter for a burst of speed; the meter refills over time, faster while slipstreaming, and in a chunk after a clean drift |
| BRAKE + steer at speed | Starts a drift: hold gas and steer to slide through the corner, ease off the steer to exit |
| II / FM / ♫ | Pause / next radio station / mute |

Landscape is the primary layout (the scene fills the screen and the controls
float over it); portrait keeps a dashboard under the scene. The Home Screen app
locks to landscape.

Every corner has a grip speed set by its curvature: straights are flat out,
Casino Square and Massenet need a lift, Sainte Devote / Mirabeau / Rascasse need
real braking and the Fairmont hairpin needs heavy braking. Go in too hot and the
car understeers wide toward the outside barrier.

The car radio (title screen tuner, or the FM button in a race) has four stations
plus OFF: Riviera FM, Casino Nights, Grand Prix Rock and Tunnel Vision; each is
a different 4-part chiptune from the same sequencer. The selection is saved.

**Keyboard** (desktop testing)

Arrows or WASD to steer/gas/brake, Shift or Z for turbo, Enter/Space to
start, P or Esc to pause, R to change radio station, M to mute, C to toggle
the CRT scanline overlay.

## Running locally

```
python3 -m http.server 8080
# open http://localhost:8080/index.html
```

Everything uses relative paths, so it also works from a sub-path such as
GitHub Pages (`/Racer/`).

## Layout

```
index.html            page shell + touch controls
css/style.css         layout, safe-area padding, pedal styling
js/palette.js         the limited colour palette
js/font.js            5x7 bitmap font
js/sprites.js         pixel-art sprite generator (cars, palms, buildings, casino ...)
js/tracks/monaco.js   the Monaco circuit as data (sections, curves, hills, scenery)
js/track.js           track builder: sections -> road segments
js/audio.js           Web Audio engine: music sequencer, engine, SFX, ambient
js/input.js           touch + keyboard input
js/renderer.js        pseudo-3D scanline renderer, parallax, tunnel, effects
js/game.js            state machine, physics, AI, HUD and menus
js/main.js            bootstrap
tools/make-icons.js   regenerates icon-192.png / icon-512.png
```

To add a track, copy `js/tracks/monaco.js`, register it in `TRACKS`, and point
`Game` at it (`this.trackDef`).
