/**
 * Reveal-on-scroll for [data-reveal] elements.
 * Optional per-element delay: style="--reveal-delay: 120ms".
 * Everything is shown at once under reduced motion or without IntersectionObserver.
 */
TT.register('reveal', function () {
  'use strict';
  var els = document.querySelectorAll('[data-reveal]');
  if (!els.length) return;

  if (TT.prefersReducedMotion() || !('IntersectionObserver' in window)) {
    els.forEach(function (el) { el.classList.add('is-visible'); });
    return;
  }

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      }
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });

  els.forEach(function (el) { io.observe(el); });
});
