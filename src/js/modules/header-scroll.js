/** Compact, shadowed state for the sticky header once the page scrolls. */
TT.register('header-scroll', function () {
  'use strict';
  var header = document.querySelector('[data-header]');
  if (!header) return;
  var ticking = false;

  function update() {
    header.classList.toggle('is-scrolled', window.scrollY > 8);
    ticking = false;
  }

  window.addEventListener('scroll', function () {
    if (!ticking) {
      ticking = true;
      window.requestAnimationFrame(update);
    }
  }, { passive: true });

  update();
});
