'use strict';
/* Monaco GT - bootstrap: build sprites, wire up renderer/audio/input/game, run the loop. */

(function () {
  Sprites.build();
  const canvas = document.getElementById('screen');
  const renderer = new Renderer(canvas);
  const audio = new AudioEngine();
  const game = { renderer, userGesture() {}, onTap() {}, onConfirm() {}, onPause() {}, toggleMute() {}, toggleCrt() {}, nextStation() {} };
  const input = new Input(game);
  const real = new Game(renderer, audio, input);
  input.game = real;
  window.MonacoGT = { game: real, renderer, audio, input };

  // resize / rotate: refit the low-res buffer (iOS reports the new size a beat late)
  let fitTimer = null;
  const refit = () => {
    clearTimeout(fitTimer);
    renderer.fit();
    input.reset(); // the DOM zones move: never leave a thumb "held down"
    fitTimer = setTimeout(() => { renderer.fit(); input.reset(); }, 350);
  };
  window.addEventListener('resize', refit);
  window.addEventListener('orientationchange', refit);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', refit);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) real.onHidden(); else real.onVisible();
  });
  window.addEventListener('pagehide', () => real.onHidden());

  let last = performance.now();
  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.05) dt = 0.05;
    if (dt < 0) dt = 0;
    real.update(dt);
    renderer.render(real, dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
