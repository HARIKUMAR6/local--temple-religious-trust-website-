/**
 * Light / dark theme.
 * The inline <head> script applies the initial theme, so there is no flash.
 * Toggles: any [data-theme-toggle] button (header and mobile menu stay in sync).
 */
TT.register('theme', function () {
  'use strict';
  var KEY = 'tt-theme';
  var root = document.documentElement;
  var meta = document.querySelector('meta[name="theme-color"]');
  var lightColor = meta ? meta.getAttribute('content') : '#6B1424';
  var toggles = document.querySelectorAll('[data-theme-toggle]');

  function current() {
    return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  function sync() {
    var dark = current() === 'dark';
    toggles.forEach(function (btn) {
      btn.setAttribute('aria-pressed', String(dark));
      var state = btn.querySelector('[data-state]');
      if (state) state.textContent = dark ? 'On' : 'Off';
    });
    if (meta) meta.setAttribute('content', dark ? '#1A0F0D' : lightColor);
  }

  function apply(theme, persist) {
    root.setAttribute('data-theme', theme);
    if (persist) TT.store.set(KEY, theme);
    sync();
    TT.emit('themechange', { theme: theme });
  }

  toggles.forEach(function (btn) {
    btn.addEventListener('click', function () {
      apply(current() === 'dark' ? 'light' : 'dark', true);
    });
  });

  // Follow the OS setting until the visitor makes an explicit choice
  var mq = window.matchMedia('(prefers-color-scheme: dark)');
  var onSystemChange = function (e) {
    var stored = TT.store.get(KEY);
    if (stored !== 'light' && stored !== 'dark') apply(e.matches ? 'dark' : 'light', false);
  };
  if (mq.addEventListener) mq.addEventListener('change', onSystemChange);

  sync();
});
