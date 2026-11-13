/** Back-to-top button: appears after 600px of scroll and respects reduced motion. */
TT.register('scroll-top', function () {
  'use strict';
  var btn = document.querySelector('[data-scroll-top]');
  if (!btn) return;
  var THRESHOLD = 600;
  var ticking = false;

  function update() {
    var show = window.scrollY > THRESHOLD;
    btn.classList.toggle('is-visible', show);
    // Keep it out of the tab order while hidden
    btn.tabIndex = show ? 0 : -1;
    ticking = false;
  }

  window.addEventListener('scroll', function () {
    if (!ticking) {
      ticking = true;
      window.requestAnimationFrame(update);
    }
  }, { passive: true });

  btn.addEventListener('click', function () {
    window.scrollTo({ top: 0, behavior: TT.prefersReducedMotion() ? 'auto' : 'smooth' });
    var target = document.querySelector('[data-header] .brand');
    if (target) target.focus({ preventScroll: true });
  });

  update();
});
