/**
 * Click-only disclosure menus.
 *
 * Desktop dropdown:  [data-dropdown] > [data-dropdown-trigger] + [data-dropdown-menu]
 * Mobile accordion:  [data-accordion] > [data-accordion-trigger] + [data-accordion-panel]
 *
 * By design nothing opens on hover or focus. Menus open only on click
 * (Enter/Space on a <button> also fire click). Arrow keys move through items.
 */
TT.register('dropdown', function () {
  'use strict';

  function items(menu) {
    return Array.prototype.slice.call(menu.querySelectorAll('a[href], button:not([disabled])'));
  }

  function setup(container, trigger, menu, isDropdown) {
    var api = {
      isOpen: function () { return trigger.getAttribute('aria-expanded') === 'true'; },
      open: function () {
        menu.hidden = false;
        trigger.setAttribute('aria-expanded', 'true');
      },
      close: function (returnFocus) {
        if (!api.isOpen()) return;
        menu.hidden = true;
        trigger.setAttribute('aria-expanded', 'false');
        if (returnFocus) trigger.focus();
      },
      contains: function (node) { return container.contains(node); },
    };

    // Always start closed
    menu.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');

    trigger.addEventListener('click', function () {
      if (api.isOpen()) api.close(false);
      else api.open();
    });

    if (isDropdown) {
      trigger.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          api.open();
          var list = items(menu);
          if (list[0]) list[0].focus();
        }
      });

      // Close when keyboard focus leaves the dropdown
      container.addEventListener('focusout', function (e) {
        if (e.relatedTarget && !container.contains(e.relatedTarget)) api.close(false);
      });
    }

    menu.addEventListener('keydown', function (e) {
      var list = items(menu);
      if (!list.length) return;
      var i = list.indexOf(document.activeElement);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        var next = e.key === 'ArrowDown' ? (i + 1) % list.length : (i - 1 + list.length) % list.length;
        list[next].focus();
      } else if (e.key === 'Home') {
        e.preventDefault();
        list[0].focus();
      } else if (e.key === 'End') {
        e.preventDefault();
        list[list.length - 1].focus();
      }
    });

    return api;
  }

  var dropdowns = [];
  document.querySelectorAll('[data-dropdown]').forEach(function (c) {
    var t = c.querySelector('[data-dropdown-trigger]');
    var m = c.querySelector('[data-dropdown-menu]');
    if (t && m) dropdowns.push(setup(c, t, m, true));
  });

  var accordions = [];
  document.querySelectorAll('[data-accordion]').forEach(function (c) {
    var t = c.querySelector('[data-accordion-trigger]');
    var m = c.querySelector('[data-accordion-panel]');
    if (t && m) accordions.push(setup(c, t, m, false));
  });

  // Outside click closes desktop dropdowns
  document.addEventListener('click', function (e) {
    dropdowns.forEach(function (api) {
      if (api.isOpen() && !api.contains(e.target)) api.close(false);
    });
  });

  // Escape closes an open desktop dropdown and returns focus to its button
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    dropdowns.forEach(function (api) {
      if (api.isOpen()) api.close(true);
    });
  });

  // The mobile menu always reopens with its Home accordion collapsed
  document.addEventListener('tt:menuclose', function () {
    accordions.forEach(function (api) { api.close(false); });
  });
  document.addEventListener('tt:menuopen', function () {
    dropdowns.forEach(function (api) { api.close(false); });
  });
});
