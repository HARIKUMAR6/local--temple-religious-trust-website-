/** Boot: run every registered module once the DOM is ready. */
(function () {
  'use strict';
  function boot() {
    TT.modules.forEach(function (m) {
      try {
        m.init();
      } catch (err) {
        // Report a failing module without stopping the others
        console.error('[TT] module "' + m.name + '" failed:', err);
      }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
