/**
 * Festival cards: expandable details, share / copy link, add-to-calendar (.ics,
 * only rendered when the Trust has confirmed a date), and deep links such as
 * index.html#festival-ratha, which open the matching card.
 */
TT.register('festivals', function () {
  'use strict';
  var cards = document.querySelectorAll('[data-festival]');
  if (!cards.length) return;

  function say(card, msg) {
    var el = card.querySelector('[data-status]');
    if (!el) return;
    el.textContent = msg;
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.textContent = ''; }, 4000);
  }

  function setOpen(card, open) {
    var btn = card.querySelector('[data-fest-toggle]');
    var panel = document.getElementById(btn.getAttribute('aria-controls'));
    btn.setAttribute('aria-expanded', String(open));
    panel.hidden = !open;
    btn.querySelector('[data-label]').textContent = open ? 'Hide details' : 'Details';
  }

  function cardUrl(card) {
    return window.location.href.split('#')[0] + '#festival-' + card.getAttribute('data-festival');
  }

  function share(card) {
    var name = card.getAttribute('data-name');
    var url = cardUrl(card);
    if (navigator.share) {
      navigator.share({ title: name, text: name, url: url }).catch(function (err) {
        if (err && err.name !== 'AbortError') say(card, 'Sharing is not available on this device.');
      });
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(
        function () { say(card, 'Link copied to the clipboard.'); },
        function () { say(card, 'Copy this link: ' + url); }
      );
    } else {
      say(card, 'Copy this link: ' + url);
    }
  }

  function icsEscape(s) {
    return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  }

  function addToCalendar(card) {
    var iso = card.getAttribute('data-iso');
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    if (!m) return;
    var start = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    var end = new Date(start.getTime() + 86400000);
    var fmt = function (d) {
      return d.getUTCFullYear() + ('0' + (d.getUTCMonth() + 1)).slice(-2) + ('0' + d.getUTCDate()).slice(-2);
    };
    var id = card.getAttribute('data-festival');
    var lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Temple Trust//Festivals//EN', 'BEGIN:VEVENT',
      'UID:' + id + '-' + iso + '@temple-website',
      'DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, ''),
      'DTSTART;VALUE=DATE:' + fmt(start), 'DTEND;VALUE=DATE:' + fmt(end),
      'SUMMARY:' + icsEscape(card.getAttribute('data-name')),
      'URL:' + cardUrl(card), 'END:VEVENT', 'END:VCALENDAR',
    ];
    var blob = new Blob([lines.join('\r\n')], { type: 'text/calendar' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = id + '.ics';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    say(card, 'Calendar file downloaded.');
  }

  cards.forEach(function (card) {
    card.addEventListener('click', function (e) {
      var t = e.target.closest('button');
      if (!t || !card.contains(t)) return;
      if (t.hasAttribute('data-fest-toggle')) setOpen(card, t.getAttribute('aria-expanded') !== 'true');
      else if (t.hasAttribute('data-share')) share(card);
      else if (t.hasAttribute('data-ics')) addToCalendar(card);
    });
  });

  // Deep link: open the card named in the URL hash
  function openFromHash() {
    var m = /^#festival-(.+)$/.exec(window.location.hash);
    if (!m) return;
    var card = document.querySelector('[data-festival="' + m[1].replace(/"/g, '') + '"]');
    if (card) setOpen(card, true);
  }
  openFromHash();
  window.addEventListener('hashchange', openFromHash);
});
