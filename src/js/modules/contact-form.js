/**
 * Contact enquiry form.
 *
 *  • ?topic=<id> from incoming links (Home 1, Home 2, Pooja Timings, Festivals, Sevas, Donations)
 *    preselects the topic. The id is validated against the form's own options, so missing,
 *    malformed or unknown values are ignored safely. The user's own input is never overwritten.
 *  • Validation: required name, valid email, optional phone, required topic, message (≥ 10 chars),
 *    with an accessible error summary, per-field messages, aria-invalid and aria-describedby.
 *  • Submission is honest. If a real endpoint is configured (data-endpoint) the form is POSTed and the
 *    visitor is told the result. Otherwise nothing is sent: the visitor's email app is opened with the
 *    message ready, and the page says plainly that it has NOT been sent until they press Send there.
 */
TT.register('contact-form', function () {
  'use strict';
  var form = document.querySelector('[data-contact-form]');
  if (!form) return;
  form.noValidate = true; // our own validation replaces the browser's; without JS the native one still works

  var el = form.elements;
  var topic = el.topic;
  var message = el.message;
  var note = form.querySelector('[data-topic-note]');
  var summary = form.querySelector('[data-summary]');
  var result = form.querySelector('[data-result]');
  var endpoint = form.getAttribute('data-endpoint') || '';
  var toEmail = form.getAttribute('data-email') || '';
  var phoneShown = form.getAttribute('data-phone') || '';
  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var touched = {};
  var prefilled = '';

  /* ── Topic from the URL ─────────────────────────────────────────────── */
  function topicFromUrl() {
    var raw;
    try { raw = new URLSearchParams(window.location.search).get('topic'); } catch (e) { return null; }
    if (!raw) return null;
    var id = String(raw).trim().toLowerCase().slice(0, 60);
    if (!/^[a-z0-9-]+$/.test(id)) return null;
    for (var i = 0; i < topic.options.length; i++) {
      var o = topic.options[i];
      if (o.value === id && !o.disabled) return o;
    }
    return null;
  }

  function applyTopic(opt, fromReset) {
    topic.value = opt.value;
    var label = opt.textContent.trim();
    note.textContent = 'Topic chosen from the link you followed: ' + label + '. You can change it.';
    note.hidden = false;
    prefilled = opt.value;
    // Start the message only if it is empty, and never again once the visitor has typed
    if (!message.value.trim() && opt.value !== 'general' && opt.value !== 'other') {
      message.value = 'I would like to ask about: ' + label + '.\n\n';
    }
    if (!fromReset) {
      var section = form.closest('section');
      if (section) section.scrollIntoView({ behavior: TT.prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
    }
  }

  var initial = topicFromUrl();
  if (initial) applyTopic(initial, false);

  topic.addEventListener('change', function () {
    // The visitor's own choice replaces the link-based one; the explanatory note no longer applies
    if (topic.value !== prefilled) note.hidden = true;
  });
  form.addEventListener('reset', function () {
    setTimeout(function () {
      touched = {};
      clearErrors();
      result.hidden = true;
      var again = topicFromUrl();
      if (again) applyTopic(again, true); else note.hidden = true;
    }, 0);
  });

  /* ── Validation ─────────────────────────────────────────────────────── */
  function rule(name) {
    var v = (el[name].value || '').trim();
    switch (name) {
      case 'name': return v ? '' : 'Please enter your name.';
      case 'email': return !v ? 'Please enter your email address.' : (EMAIL.test(v) ? '' : 'Please enter a valid email address, for example name@example.com.');
      case 'phone':
        if (!v) return '';
        return (/^[+()\d\s\-.]+$/.test(v) && v.replace(/\D/g, '').length >= 7 && v.replace(/\D/g, '').length <= 15) ? '' : 'Please enter a valid phone number, or leave it empty.';
      case 'topic': return v ? '' : 'Please choose an enquiry topic.';
      case 'message': return !v ? 'Please write your message.' : (v.length < 10 ? 'Please write a little more (at least 10 characters).' : '');
    }
    return '';
  }

  function showError(name, msg) {
    var input = el[name];
    var err = document.getElementById('err-' + name);
    if (msg) {
      input.setAttribute('aria-invalid', 'true');
      err.textContent = msg;
      err.hidden = false;
    } else {
      input.removeAttribute('aria-invalid');
      err.textContent = '';
      err.hidden = true;
    }
  }

  function clearErrors() {
    ['name', 'email', 'phone', 'topic', 'message'].forEach(function (n) { showError(n, ''); });
    summary.hidden = true;
    summary.querySelector('ul').innerHTML = '';
  }

  ['name', 'email', 'phone', 'topic', 'message'].forEach(function (n) {
    var ev = n === 'topic' ? 'change' : 'blur';
    el[n].addEventListener(ev, function () { touched[n] = true; showError(n, rule(n)); });
    el[n].addEventListener('input', function () { if (touched[n]) showError(n, rule(n)); });
  });

  function validate() {
    var problems = [];
    ['name', 'email', 'phone', 'topic', 'message'].forEach(function (n) {
      var m = rule(n);
      touched[n] = true;
      showError(n, m);
      if (m) problems.push({ name: n, msg: m });
    });
    var ul = summary.querySelector('ul');
    ul.innerHTML = '';
    problems.forEach(function (p) {
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = '#' + el[p.name].id;
      a.textContent = p.msg;
      a.addEventListener('click', function (e) { e.preventDefault(); el[p.name].focus(); });
      li.appendChild(a);
      ul.appendChild(li);
    });
    summary.hidden = problems.length === 0;
    return problems;
  }

  /* ── Submission ─────────────────────────────────────────────────────── */
  function topicLabel() {
    var o = topic.options[topic.selectedIndex];
    return o ? o.textContent.trim() : '';
  }
  function composeBody() {
    var lines = ['Name: ' + el.name.value.trim(), 'Email: ' + el.email.value.trim()];
    if (el.phone.value.trim()) lines.push('Phone: ' + el.phone.value.trim());
    lines.push('Topic: ' + topicLabel(), '', message.value.trim());
    return lines.join('\n');
  }
  function mailtoUrl() {
    return 'mailto:' + toEmail + '?subject=' + encodeURIComponent('Enquiry: ' + topicLabel()) + '&body=' + encodeURIComponent(composeBody());
  }

  function showResult(title, text, opts) {
    opts = opts || {};
    result.hidden = false;
    result.querySelector('[data-result-title]').textContent = title;
    result.querySelector('[data-result-text]').textContent = text;
    var mail = result.querySelector('[data-result-mailto]');
    var copy = result.querySelector('[data-result-copy]');
    mail.hidden = !opts.mailto;
    copy.hidden = !opts.copy;
    if (opts.mailto) mail.setAttribute('href', opts.mailto);
    result.querySelector('[data-result-status]').textContent = '';
    result.focus();
  }

  form.addEventListener('submit', function (e) {
    var problems = validate();
    if (problems.length) {
      e.preventDefault();
      result.hidden = true;
      summary.focus();
      return;
    }
    e.preventDefault();
    summary.hidden = true;

    if (endpoint) {
      var btn = form.querySelector('[type="submit"]');
      btn.disabled = true;
      fetch(endpoint, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } })
        .then(function (r) {
          if (!r.ok) throw new Error('status ' + r.status);
          showResult('Your enquiry was submitted', 'Thank you. The Temple Office has received your enquiry and will reply to the email address you gave.');
          form.querySelector('.ct-fields').hidden = true;
        })
        .catch(function () {
          showResult('Your enquiry could not be sent', 'Something went wrong, and your message has not been sent. Please try again, or contact the Temple Office by phone' + (phoneShown ? ' on ' + phoneShown : '') + ' or email' + (toEmail ? ' at ' + toEmail : '') + '.');
        })
        .then(function () { btn.disabled = false; });
      return;
    }

    // No submission endpoint: open the visitor's email app, and say so honestly.
    var url = mailtoUrl();
    showResult(
      'Your enquiry is ready to send',
      'We have prepared an email to ' + toEmail + ' in your email app. It has not been sent yet: please press Send there. If nothing opened, use Open Email App Again or Copy Message below' + (phoneShown ? ', or call ' + phoneShown : '') + '.',
      { mailto: url, copy: true }
    );
    var a = document.createElement('a');
    a.href = url;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
  });

  result.querySelector('[data-result-edit]').addEventListener('click', function () {
    result.hidden = true;
    var fields = form.querySelector('.ct-fields');
    if (fields) fields.hidden = false;
    message.focus();
  });
  result.querySelector('[data-result-copy]').addEventListener('click', function () {
    var status = result.querySelector('[data-result-status]');
    var text = composeBody();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function () { status.textContent = 'Message copied. You can paste it into any email or message.'; },
        function () { status.textContent = 'Could not copy automatically. Please select the text in the message box and copy it.'; }
      );
    } else {
      status.textContent = 'Copying is not available here. Please select the text in the message box and copy it.';
    }
  });
});
