/**
 * TT core: a small shared namespace for the site's vanilla JS modules.
 * Each module calls TT.register(name, init); main.js runs them in order.
 */
(function (w, d) {
  'use strict';
  var TT = (w.TT = w.TT || {});
  TT.modules = [];

  TT.register = function (name, init) {
    TT.modules.push({ name: name, init: init });
  };

  /** localStorage wrapper that never throws (private mode, blocked storage) */
  TT.store = {
    get: function (k) {
      try { return w.localStorage.getItem(k); } catch (e) { return null; }
    },
    set: function (k, v) {
      try { w.localStorage.setItem(k, v); } catch (e) { /* ignore */ }
    },
  };

  TT.prefersReducedMotion = function () {
    return w.matchMedia('(prefers-reduced-motion: reduce)').matches;
  };

  /** Visible, focusable descendants of root */
  TT.focusables = function (root) {
    var sel = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    return Array.prototype.filter.call(root.querySelectorAll(sel), function (el) {
      return !el.closest('[hidden]') && el.getClientRects().length > 0;
    });
  };

  TT.emit = function (name, detail) {
    d.dispatchEvent(new CustomEvent('tt:' + name, { detail: detail }));
  };
})(window, document);
