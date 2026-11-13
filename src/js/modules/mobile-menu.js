/**
 * Full-screen mobile / tablet navigation (< 1024px).
 * Modal dialog behaviour: focus moves in, the background becomes inert,
 * Escape closes, and focus returns to the menu button on close.
 */
TT.register('mobile-menu', function () {
  'use strict';
  var menu = document.querySelector('[data-mobile-menu]');
  var openBtn = document.querySelector('[data-menu-open]');
  if (!menu || !openBtn) return;
  var closeBtn = menu.querySelector('[data-menu-close]');
  var desktop = window.matchMedia('(min-width: 64rem)');
  var hideTimer = null;
  var isOpen = false;

  function setBackgroundInert(state) {
    Array.prototype.forEach.call(document.body.children, function (el) {
      if (el === menu || el.tagName === 'SCRIPT') return;
      if (state) el.setAttribute('inert', '');
      else el.removeAttribute('inert');
    });
  }

  function open() {
    if (isOpen) return;
    isOpen = true;
    clearTimeout(hideTimer);
    TT.emit('menuopen');
    menu.hidden = false;
    // Wait two frames so the opening transition runs
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () { menu.classList.add('is-open'); });
    });
    openBtn.setAttribute('aria-expanded', 'true');
    document.body.classList.add('menu-open');
    setBackgroundInert(true);
    (closeBtn || menu).focus();
  }

  function close(returnFocus) {
    if (!isOpen) return;
    isOpen = false;
    menu.classList.remove('is-open');
    openBtn.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('menu-open');
    setBackgroundInert(false);
    var finish = function () {
      if (!isOpen) {
        menu.hidden = true;
        TT.emit('menuclose');
      }
    };
    if (TT.prefersReducedMotion()) finish();
    else hideTimer = setTimeout(finish, 320);
    if (returnFocus) openBtn.focus();
  }

  openBtn.addEventListener('click', open);
  if (closeBtn) closeBtn.addEventListener('click', function () { close(true); });

  menu.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
      return;
    }
    if (e.key !== 'Tab') return;
    // Focus trap (fallback for browsers without `inert`)
    var list = TT.focusables(menu);
    if (!list.length) return;
    var first = list[0];
    var last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });

  // Following a link closes the menu, including links to the current page
  menu.addEventListener('click', function (e) {
    if (e.target.closest('a[href]')) close(false);
  });

  // Switching to the desktop layout closes the overlay
  var onBreakpoint = function (e) {
    if (e.matches) close(false);
  };
  if (desktop.addEventListener) desktop.addEventListener('change', onBreakpoint);
});
