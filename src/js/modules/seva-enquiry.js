/**
 * Seva enquiry: choosing a seva updates the enquiry panel and prefills the
 * email subject/body and the contact-page link. The phone link is unchanged.
 */
TT.register('seva-enquiry', function () {
  'use strict';
  var root = document.querySelector('[data-seva-enquiry]');
  if (!root) return;
  var radios = root.querySelectorAll('input[name="seva"]');
  var title = root.querySelector('[data-seva-selected]');
  var mail = root.querySelector('[data-enquiry-mail]');
  var online = root.querySelector('[data-enquiry-online]');
  if (!radios.length || !title) return;

  var mailBase = mail ? mail.getAttribute('href').split('?')[0] : '';
  var onlineBase = online ? online.getAttribute('href').split('?')[0] : '';

  function update(radio) {
    var name = radio.getAttribute('data-name');
    title.textContent = name;
    if (mail) {
      mail.setAttribute(
        'href',
        mailBase + '?subject=' + encodeURIComponent('Seva enquiry: ' + name) +
          '&body=' + encodeURIComponent('I would like to enquire about the ' + name + ' seva.\n\nName:\nPhone:\nPreferred date:')
      );
    }
    if (online) online.setAttribute('href', onlineBase + '?topic=seva-' + encodeURIComponent(radio.value));
  }

  radios.forEach(function (r) {
    r.addEventListener('change', function () { if (r.checked) update(r); });
    if (r.checked) update(r);
  });
});
