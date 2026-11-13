/**
 * LTR / RTL layout direction. The content stays in English.
 * Toggles: any [data-dir-toggle] button.
 */
TT.register('direction', function () {
  'use strict';
  var KEY = 'tt-dir';
  var root = document.documentElement;
  var toggles = document.querySelectorAll('[data-dir-toggle]');

  function current() {
    return root.getAttribute('dir') === 'rtl' ? 'rtl' : 'ltr';
  }

  function sync() {
    var rtl = current() === 'rtl';
    toggles.forEach(function (btn) {
      btn.setAttribute('aria-pressed', String(rtl));
      var state = btn.querySelector('[data-state]');
      if (state) state.textContent = rtl ? 'On' : 'Off';
    });
  }

  toggles.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var next = current() === 'rtl' ? 'ltr' : 'rtl';
      root.setAttribute('dir', next);
      TT.store.set(KEY, next);
      sync();
      TT.emit('dirchange', { dir: next });
    });
  });

  sync();
});
