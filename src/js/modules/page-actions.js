/**
 * Inner-page interactions:
 *  • [data-tabs]            accessible tabs (arrow keys, Home/End, RTL-aware); without JS every panel stays visible
 *  • [data-tab-link="id"]   links (e.g. the Pooja hero dial) that also select that tab
 *  • [data-disclosure-group] single-open disclosure list (first item open); without JS everything is visible
 *  • [data-print]           print button
 */
TT.register('page-actions', function () {
  'use strict';

  // Print
  document.querySelectorAll('[data-print]').forEach(function (b) {
    b.addEventListener('click', function () { window.print(); });
  });

  // Tabs
  document.querySelectorAll('[data-tabs]').forEach(function (root) {
    var tabs = Array.prototype.slice.call(root.querySelectorAll('[role="tab"]'));
    var panels = Array.prototype.slice.call(root.querySelectorAll('[data-tabpanel]'));
    if (!tabs.length) return;

    function select(id, focus) {
      tabs.forEach(function (t) {
        var on = t.getAttribute('data-tab') === id;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        if (on && focus) t.focus();
      });
      panels.forEach(function (p) { p.hidden = p.getAttribute('data-tabpanel') !== id; });
    }
    root._select = select;

    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { select(t.getAttribute('data-tab')); });
      t.addEventListener('keydown', function (e) {
        var rtl = document.documentElement.dir === 'rtl';
        var next = null;
        var vertical = window.matchMedia('(min-width: 64rem)').matches;
        var fwd = vertical ? 'ArrowDown' : (rtl ? 'ArrowLeft' : 'ArrowRight');
        var back = vertical ? 'ArrowUp' : (rtl ? 'ArrowRight' : 'ArrowLeft');
        if (e.key === fwd || e.key === 'ArrowDown' && !vertical) next = (i + 1) % tabs.length;
        else if (e.key === back || e.key === 'ArrowUp' && !vertical) next = (i - 1 + tabs.length) % tabs.length;
        else if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = tabs.length - 1;
        if (next === null) return;
        e.preventDefault();
        select(tabs[next].getAttribute('data-tab'), true);
      });
    });
    select(tabs[0].getAttribute('data-tab'));
  });

  document.querySelectorAll('[data-tab-link]').forEach(function (a) {
    a.addEventListener('click', function () {
      var root = document.querySelector('[data-tabs]');
      if (root && root._select) root._select(a.getAttribute('data-tab-link'));
    });
  });

  // Single-open disclosure lists
  document.querySelectorAll('[data-disclosure-group]').forEach(function (group) {
    var items = Array.prototype.slice.call(group.querySelectorAll('[data-disclosure]'));
    function set(item, open) {
      item.classList.toggle('is-open', open);
      item.querySelector('[data-disclosure-trigger]').setAttribute('aria-expanded', String(open));
    }
    items.forEach(function (item) {
      item.querySelector('[data-disclosure-trigger]').addEventListener('click', function () {
        var open = !item.classList.contains('is-open');
        items.forEach(function (o) { set(o, false); });
        set(item, open);
      });
    });
    if (items[0]) set(items[0], true);
  });
});
