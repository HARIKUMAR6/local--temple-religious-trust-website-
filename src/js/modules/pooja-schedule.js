/**
 * Pooja schedule: time-of-day filter chips, expandable ritual notes and an
 * optional live "Now / Next" highlight.
 *
 * "Now / Next" only runs when the Trust has configured BOTH a time zone
 * (data-tz on the section) and start/end times (HH:MM) on the slots.
 * Otherwise nothing is guessed from the visitor's own clock.
 */
TT.register('pooja-schedule', function () {
  'use strict';
  var root = document.querySelector('[data-pooja]');
  if (!root) return;
  var slots = Array.prototype.slice.call(root.querySelectorAll('[data-slot]'));
  var chips = Array.prototype.slice.call(root.querySelectorAll('[data-filter]'));
  var status = root.querySelector('[data-pooja-status]');

  // Filter chips
  function applyFilter(key) {
    var shown = 0;
    slots.forEach(function (li) {
      var match = key === 'all' || li.getAttribute('data-slot') === key;
      li.hidden = !match;
      if (match) shown++;
    });
    chips.forEach(function (c) { c.setAttribute('aria-pressed', String(c.getAttribute('data-filter') === key)); });
    if (status) status.textContent = key === 'all' ? 'Showing all ' + slots.length + ' poojas' : 'Showing ' + shown + ' of ' + slots.length + ' poojas';
  }
  chips.forEach(function (c) {
    c.addEventListener('click', function () { applyFilter(c.getAttribute('data-filter')); });
  });

  // Expandable ritual notes
  slots.forEach(function (li) {
    var btn = li.querySelector('[data-slot-toggle]');
    var panel = document.getElementById(btn.getAttribute('aria-controls'));
    btn.addEventListener('click', function () {
      var open = btn.getAttribute('aria-expanded') !== 'true';
      btn.setAttribute('aria-expanded', String(open));
      panel.hidden = !open;
    });
  });

  // Live Now / Next (only with a time zone and real times)
  function toMin(hhmm) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
    return m ? +m[1] * 60 + +m[2] : null;
  }
  function nowInZone(tz) {
    try {
      var parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
      var h = 0, mi = 0;
      parts.forEach(function (p) { if (p.type === 'hour') h = +p.value; if (p.type === 'minute') mi = +p.value; });
      return h * 60 + mi;
    } catch (e) { return null; }
  }
  function refresh() {
    slots.forEach(function (li) {
      li.classList.remove('is-now');
      var old = li.querySelector('.hm-slot-flag');
      if (old) old.remove();
    });
    var tz = root.getAttribute('data-tz');
    if (!tz) return;
    var now = nowInZone(tz);
    if (now === null) return;
    var timed = slots
      .map(function (li) {
        return { li: li, s: toMin(li.getAttribute('data-start')), e: toMin(li.getAttribute('data-end')) };
      })
      .filter(function (x) { return x.s !== null && x.e !== null; });
    if (!timed.length) return;
    var current = timed.filter(function (x) { return now >= x.s && now < x.e; })[0];
    var target = current || timed.filter(function (x) { return x.s > now; }).sort(function (a, b) { return a.s - b.s; })[0] || timed[0];
    var flag = document.createElement('span');
    flag.className = 'hm-slot-flag';
    flag.textContent = current ? 'Now' : 'Next';
    if (current) target.li.classList.add('is-now');
    target.li.querySelector('.hm-slot-name').appendChild(flag);
  }
  TT.poojaRefresh = refresh;
  refresh();
  setInterval(refresh, 60000);
});
