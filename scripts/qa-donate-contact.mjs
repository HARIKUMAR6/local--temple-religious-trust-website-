/**
 * Focused QA for Donations and Contact (Playwright + axe-core).
 *   npm run build && npm run qa:donate-contact
 */
import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { startServer } from './serve.mjs';

const WIDTHS = [320, 360, 375, 414, 640, 768, 1024, 1280, 1440, 1920];
const SHOTS = path.resolve(process.env.SHOTS_DIR || 'qa-screenshots/donate-contact');
const cfg = JSON.parse(await fs.readFile('site.config.json', 'utf8'));
const PAGES = {
  donations: { route: 'donations.html', ids: ['top', 'why', 'purposes', 'ways', 'info', 'visit'], nav: 'Donations' },
  contact: { route: 'contact.html', ids: ['top', 'info', 'map', 'form', 'visit-info', 'visit'], nav: 'Contact' },
};
const results = { pass: 0, fail: [] };
const check = (n, ok, info = '') => (ok ? results.pass++ : results.fail.push(`${n}${info ? ` — ${info}` : ''}`));
const section = (t) => console.log(`\n▸ ${t}`);

const server = await startServer(0);
const BASE = `http://localhost:${server.address().port}/`;
const browser = await chromium.launch();
await fs.mkdir(SHOTS, { recursive: true });

async function open(route, { width = 1280, height = 900, theme = 'light', dir = 'ltr', reduced = false, perms = [], allowMaps = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  if (perms.length) await ctx.grantPermissions(perms);
  await ctx.addInitScript(([t, d]) => { try { if (!sessionStorage.getItem('qa-seeded')) { localStorage.setItem('tt-theme', t); localStorage.setItem('tt-dir', d); sessionStorage.setItem('qa-seeded', '1'); } } catch (e) { /* aborted map frame */ } }, [theme, dir]);
  const page = await ctx.newPage();
  if (!allowMaps) await page.route(/google\.com\/maps/, (r) => r.abort()); // only the dedicated map test loads the live embed
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && !/google\.com|gstatic|ERR_/.test(m.text()) && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', (r) => r.status() >= 400 && r.url().startsWith(BASE) && errors.push(`${r.status()} ${r.url()}`));
  await page.goto(BASE + route, { waitUntil: 'load' });
  return { ctx, page, errors };
}
async function loadAll(page) {
  const H = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < H; y += 450) { await page.evaluate((v) => window.scrollTo(0, v), y); await page.waitForTimeout(50); }
  await page.waitForFunction(() => [...document.images].every((i) => i.complete || !i.getClientRects().length));
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
}
const md5 = async (f) => crypto.createHash('md5').update(await fs.readFile(f)).digest('hex');
const A = cfg.address;
const addressText = [A.line1, A.line2, A.city, [A.state, A.postalCode].filter(Boolean).join(' '), A.country].filter(Boolean).join(', ');

// 1 ─ Structure, content rules, photographs ─────────────────────────────
section('Structure, content rules, photographs');
const others = new Set();
for (const d of ['home', 'home2', 'pages']) for (const f of await fs.readdir(`dist/assets/img/${d}`)) others.add(await md5(`dist/assets/img/${d}/${f}`));
const seenImgs = new Set();
for (const [key, P] of Object.entries(PAGES)) {
  const { ctx, page, errors } = await open(P.route, { width: 1440 });
  await loadAll(page);
  const s = await page.evaluate(() => {
    const main = document.querySelector('main'); const imgs = [...main.querySelectorAll('img')];
    const attrs = [...document.querySelectorAll('[alt],[title],[aria-label]')].map((e) => [e.getAttribute('alt'), e.getAttribute('title'), e.getAttribute('aria-label')].filter(Boolean).join(' ')).join(' ');
    return {
      secs: [...main.querySelectorAll(':scope > section')].map((x) => x.id), all: main.querySelectorAll('section').length,
      h1: main.querySelectorAll('h1').length, headings: [...main.querySelectorAll('h1,h2,h3')].map((h) => h.tagName),
      broken: imgs.filter((i) => !i.naturalWidth).length, noAlt: imgs.filter((i) => !i.getAttribute('alt')).length,
      srcs: imgs.map((i) => i.currentSrc.split('/').slice(-2).join('/').replace(/-\d+\.jpg.*$/, '')), text: main.innerText + ' ' + attrs,
      nav: document.querySelector('.nav-desktop [aria-current="page"]')?.textContent.trim(), figcap: main.querySelectorAll('figcaption').length,
      forms: main.querySelectorAll('form').length, hasShell: !!main.querySelector('.phase-note, .page-intro'), html: main.innerHTML,
    };
  });
  check(`${key}: exactly 6 sections in <main>, in order`, s.secs.length === 6 && s.all === 6 && s.secs.join() === P.ids.join(), s.secs.join());
  check(`${key}: one h1; no skipped heading levels`, s.h1 === 1 && !s.headings.some((h, i) => i && +h[1] - +s.headings[i - 1][1] > 1));
  check(`${key}: photos load, have alt, none repeated`, s.broken === 0 && s.noAlt === 0 && new Set(s.srcs).size === s.srcs.length, `${s.srcs.length}`);
  s.srcs.forEach((x) => { check(`${key}: photo ${x} not reused on the other page`, !seenImgs.has(x)); seenImgs.add(x); });
  check(`${key}: Phase-1 shell removed`, !s.hasShell);
  check(`${key}: no credits, source URLs, image paths or captions`, !/(photo|image|picture)\s*(by|credit|courtesy|source)|©\s*[A-Z][a-z]+\s+[A-Z]|wikimedia|commons\.|unsplash|pexels|flickr|cc0|public domain|assets\/img|\.jpg/i.test(s.text) && s.figcap === 0);
  check(`${key}: never says fake / dummy / placeholder / lorem`, !/\b(fake|dummy|placeholder|lorem|ipsum)\b/i.test(s.text));
  check(`${key}: nav marks "${P.nav}" current`, s.nav === P.nav, s.nav);
  const links = await page.$$eval('main a[href]', (a) => a.map((x) => x.getAttribute('href')));
  for (const l of [...new Set(links.filter((h) => !/^(tel:|mailto:|#|https?:)/.test(h)).map((h) => h.split('?')[0].split('#')[0]))]) check(`${key}: link resolves ${l}`, (await fetch(BASE + l)).status === 200);
  check(`${key}: in-page anchors hit real ids`, links.filter((h) => h.startsWith('#')).every((h) => s.secs.includes(h.slice(1))), links.filter((h) => h.startsWith('#')).join());
  check(`${key}: no console/network errors`, errors.length === 0, errors.join(' | '));
  if (key === 'donations') {
    check('donations: NO payment details, QR, gateway, tax claims or amounts anywhere', !/(₹|\brs\.?\s?\d|\bINR\b|\$\s?\d|\bupi\s*(id)?\s*:|@[a-z]{2,}\b(?<!example)|\bifsc\b|account\s*(no|number)\s*[:#]?\s*\d|\b\d{9,}\b|\bqr\b|razorpay|paytm|phonepe|stripe|80g|tax[- ]exempt|exempt from)/i.test(s.text.replace(/info@example\.org/g, '')), '');
    check('donations: no form, no payment/donate-now buttons, no QR image', s.forms === 0 && !/pay now|donate now|make payment|checkout/i.test(s.html) && !/qr/i.test(s.srcs.join()));
    check('donations: every payment detail row says "Ask the Temple Office"', (await page.locator('.dn-details dd').allTextContents()).every((t) => /Ask the Temple Office/.test(t)) && (await page.locator('.dn-details dd').count()) === 5);
    check('donations: unverified-details notice shown', /have not been published yet/.test(await page.locator('.dn-status').innerText()));
    check('donations: hero + CTA buttons point to contact.html?topic=donation', (await page.locator('main a[href="contact.html?topic=donation"]').count()) >= 3);
    check('donations: 5 purposes, 4 ways, 5 FAQ items', (await page.locator('.dn-tile').count()) === 5 && (await page.locator('.dn-way').count()) === 4 && (await page.locator('.dn-faq .ab-space').count()) === 5);
  } else {
    const tels = await page.$$eval('main a[href^="tel:"]', (a) => a.map((x) => x.getAttribute('href')));
    const mails = await page.$$eval('main a[href^="mailto:"]', (a) => a.map((x) => x.getAttribute('href').replace('mailto:', '').split('?')[0]));
    check('contact: every phone link uses the configured number', tels.length >= 3 && tels.every((t) => t === 'tel:' + cfg.phone.href));
    check('contact: every email link uses the configured email', mails.length >= 3 && mails.every((m) => m === cfg.email));
    const infoText = await page.locator('#info').innerText();
    check('contact: info shows configured address, phone, email and hours', infoText.includes(A.line1) && infoText.includes(A.city) && infoText.includes(cfg.phone.display) && infoText.includes(cfg.email) && infoText.includes(cfg.officeHours));
    const mapText = await page.locator('.ct-map-address').innerText();
    check('contact: map card shows the same address', mapText.replace(/\s+/g, ' ').trim() === addressText, mapText);
    const src = await page.locator('.ct-map-frame iframe').getAttribute('src');
    check('contact: map iframe query is exactly the configured address', decodeURIComponent(new URL(src).searchParams.get('q')) === addressText, src);
    check('contact: directions + larger-map links use the same address', (await page.locator('main a[href*="google.com/maps/dir"]').first().getAttribute('href')).includes(encodeURIComponent(addressText)) && (await page.locator('.ct-map-actions a').nth(1).getAttribute('href')).includes(encodeURIComponent(addressText)));
    check('contact: 5 hero-region shells: hero quick actions (call, email, write)', (await page.locator('.ct-quick a').count()) === 3);
  }
  await ctx.close();
}
for (const d of ['pages2']) for (const f of await fs.readdir(`dist/assets/img/${d}`)) check(`photo ${f} not used on Home 1/2, About or Pooja`, !others.has(await md5(`dist/assets/img/${d}/${f}`)));

// 2 ─ Map ────────────────────────────────────────────────────────────────
section('Contact: interactive map');
{
  const { ctx, page } = await open('contact.html', { width: 1280, allowMaps: true });
  await loadAll(page);
  const frame = page.locator('.ct-map-frame iframe');
  check('map: iframe present, titled with the address, lazy, referrer-safe', (await frame.getAttribute('title')).includes(A.line1) && (await frame.getAttribute('loading')) === 'lazy' && /referrerpolicy|no-referrer/.test(await frame.evaluate((e) => e.outerHTML)));
  await page.locator('#map').scrollIntoViewIfNeeded();
  const resp = await page.waitForResponse((r) => /google\.com\/maps/.test(r.url()), { timeout: 15000 }).catch(() => null);
  check('map: the embed URL loads (HTTP 200) from the maps provider', !!resp && resp.status() === 200, resp ? `status ${resp.status()}` : 'no response');
  const box = await frame.boundingBox();
  check('map: visible with usable size (≥ 20rem × 15rem)', box.width >= 320 && box.height >= 240, `${Math.round(box.width)}×${Math.round(box.height)}`);
  // keyboard: skip link, iframe focusable
  await page.locator('.ct-map-card .btn').first().focus();
  await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
  check('map: skip link appears on keyboard focus', await page.evaluate(() => document.activeElement.classList.contains('ct-skip')));
  await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  check('map: skip link jumps to the enquiry form', (await page.evaluate(() => location.hash)) === '#form');
  await frame.focus();
  check('map: iframe can receive keyboard focus (map keys work inside)', await frame.evaluate((e) => document.activeElement === e));
  check('map: directions/larger-map links open safely in a new tab', await page.locator('.ct-map-actions a').evaluateAll((a) => a.every((x) => x.target === '_blank' && /noopener/.test(x.rel))));
  await ctx.close();
}

// 3 ─ Layout matrix ─────────────────────────────────────────────────────
section(`Layout: 2 pages × ${WIDTHS.length} widths × light/dark × LTR/RTL`);
let renders = 0;
for (const [key, P] of Object.entries(PAGES)) for (const width of WIDTHS) for (const theme of ['light', 'dark']) for (const dir of ['ltr', 'rtl']) {
  const { ctx, page, errors } = await open(P.route, { width, theme, dir, reduced: true });
  await loadAll(page);
  const m = await page.evaluate(() => {
    const de = document.documentElement; const bad = [];
    document.querySelectorAll('main *').forEach((el) => {
      if (el.closest('.sr-only, [hidden], svg[width="0"], iframe') || getComputedStyle(el).position === 'fixed') return;
      if (el.tagName === 'IMG' && el.closest('.hm-zoom')) return;
      const c = el.parentElement && el.parentElement.closest('.container-temple, .container-narrow'); if (!c) return;
      const cs = getComputedStyle(c), cr = c.getBoundingClientRect();
      const L = cr.left + parseFloat(cs.paddingLeft) - 1, R = cr.right - parseFloat(cs.paddingRight) + 1, r = el.getBoundingClientRect();
      if (!r.width) return;
      if (r.left < L || r.right > R) bad.push(`${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 2).join('.')} [${Math.round(r.left)}–${Math.round(r.right)} vs ${Math.round(L)}–${Math.round(R)}]`);
    });
    const clipped = [...document.querySelectorAll('main h1,main h2,main h3,main p,main a,main button,main span,main label,main dt,main dd')].filter((el) => !el.matches('.sr-only, .sr-only-focusable:not(:focus)') && el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflow !== 'visible' && getComputedStyle(el).display !== 'inline').map((e) => e.className || e.tagName).slice(0, 4);
    return { sw: de.scrollWidth, iw: innerWidth, bad: bad.slice(0, 4), clipped, dir: de.dir, theme: de.dataset.theme };
  });
  const tag = `${key} @${width} ${theme}/${dir}`;
  check(`no horizontal overflow ${tag}`, m.sw <= m.iw, `${m.sw}>${m.iw}`);
  check(`content inside container ${tag}`, m.bad.length === 0, m.bad.join('; '));
  check(`no clipped text ${tag}`, m.clipped.length === 0, m.clipped.join(','));
  check(`theme+dir applied ${tag}`, m.dir === dir && m.theme === theme);
  check(`no console/network errors ${tag}`, errors.length === 0, errors.join(' | '));
  renders++; await ctx.close();
}
console.log(`  ${renders} renders checked`);

// 4 ─ Hero height parity ────────────────────────────────────────────────
section('Hero height parity with Home 1');
const heroH = async (route, w, h) => { const { ctx, page } = await open(route, { width: w, height: h, reduced: true }); const v = await page.evaluate(() => document.querySelector('#top').getBoundingClientRect().height); await ctx.close(); return v; };
for (const [w, h] of [[1024, 700], [1280, 720], [1440, 900], [1920, 1080], [2560, 1440], [1024, 768]]) {
  const ref = await heroH('index.html', w, h);
  for (const [k, P] of Object.entries(PAGES)) { const v = await heroH(P.route, w, h); check(`${k} hero = Home hero height @${w}×${h}`, Math.abs(v - ref) <= 1, `Home ${Math.round(ref)} vs ${Math.round(v)}`); }
}
for (const [w, h] of [[320, 568], [375, 667], [414, 896], [768, 1024], [1023, 768]]) for (const [k, P] of Object.entries(PAGES)) { const v = await heroH(P.route, w, h); check(`${k} phone/tablet hero ≥ 34rem floor @${w}×${h}`, v >= 543, `${Math.round(v)}`); }

// 5 ─ Mobile CTAs ───────────────────────────────────────────────────────
section('Mobile CTAs: equal-sized and centred');
for (const [key, P] of Object.entries(PAGES)) for (const width of [320, 360, 375, 414, 600]) for (const dir of ['ltr', 'rtl']) {
  const { ctx, page } = await open(P.route, { width, dir, reduced: true });
  await loadAll(page);
  const rows = await page.evaluate(() => [...document.querySelectorAll('main .hm-cta-row, main .ct-map-actions, main .dn-verify-actions, main .ct-submit')].map((row) => {
    const b = [...row.querySelectorAll('.btn')].filter((x) => x.getClientRects().length).map((x) => x.getBoundingClientRect());
    return { id: row.closest('section').id + '/' + row.className.split(' ')[0], w: b.map((r) => Math.round(r.width)), h: b.map((r) => Math.round(r.height)), c: b.map((r) => Math.round(r.left + r.width / 2)), vw: document.documentElement.clientWidth };
  }));
  for (const r of rows) {
    if (!r.w.length) continue;
    const tag = `${key} #${r.id} @${width} ${dir}`;
    check(`CTA equal width ${tag}`, new Set(r.w).size === 1, r.w.join());
    check(`CTA equal height ${tag}`, new Set(r.h).size === 1, r.h.join());
    check(`CTA buttons centred ${tag}`, r.c.every((c) => Math.abs(c - r.vw / 2) <= 2), `${r.c} vs ${r.vw / 2}`);
    check(`CTA ≥ 40px tall ${tag}`, r.h.every((x) => x >= 40));
  }
  await ctx.close();
}

// 6 ─ ?topic= links: the ACTUAL incoming links ──────────────────────────
section('Incoming ?topic= links: click each real link, check the form');
const topicOptions = await (async () => { const { ctx, page } = await open('contact.html'); const o = await page.$$eval('#f-topic option', (os) => os.map((x) => [x.value, x.textContent.trim(), x.disabled])); await ctx.close(); return o; })();
const valid = new Set(topicOptions.filter((o) => o[0] && !o[2]).map((o) => o[0]));
check('form offers general topics + every seva + every festival', ['general', 'visit', 'pooja-timings', 'donation', 'volunteer', 'other'].every((t) => valid.has(t)) && cfg.home.sevas.every((s) => valid.has('seva-' + s.id)) && cfg.home.festivals.every((f) => valid.has('festival-' + f.id)), [...valid].join());
const sources = ['index.html', 'home-2.html', 'pooja-timings.html', 'donations.html', 'about.html', 'contact.html'];
let linkClicks = 0;
const specific = (id) => id !== 'general' && id !== 'other';
async function followAndCheck(from, selector, expected, label, viewport = { width: 1280, height: 900 }) {
  const { ctx, page, errors } = await open(from, { ...viewport, reduced: true });
  await loadAll(page);
  const link = page.locator(selector).first();
  await link.scrollIntoViewIfNeeded();
  await Promise.all([page.waitForURL(/contact\.html/), link.click()]);
  await page.waitForLoadState('load'); await page.waitForTimeout(250);
  const st = await page.evaluate(() => ({ topic: document.getElementById('f-topic').value, noteHidden: document.querySelector('[data-topic-note]').hidden, note: document.querySelector('[data-topic-note]').textContent, msg: document.getElementById('f-message').value, formTop: document.getElementById('form').getBoundingClientRect().top, vh: innerHeight, url: location.search }));
  const ok = st.topic === expected && !st.noteHidden && /chosen from the link/i.test(st.note) && (!specific(expected) || st.msg.startsWith('I would like to ask about:')) && st.formTop < st.vh * 0.6;
  check(`${label}: ${from} → ${expected}`, ok, JSON.stringify(st));
  check(`${label}: no console errors after following the link`, errors.length === 0, errors.join('|'));
  linkClicks++;
  await ctx.close();
}
for (const src of sources.slice(0, 5)) {
  const { ctx, page } = await open(src, { width: 1280, reduced: true });
  const hrefs = [...new Set(await page.$$eval('main a[href*="contact.html?topic="]', (a) => a.map((x) => x.getAttribute('href'))))];
  await ctx.close();
  for (const h of hrefs) await followAndCheck(src, `main a[href="${h}"]`, new URL(h, 'http://x/').searchParams.get('topic'), 'link');
}
// dynamic links: Home 1 / Home 2 seva enquiry link changes with the selection
for (const [src, pick, online] of [['index.html', (id) => `label.hm-seva:has(input[value="${id}"])`, '[data-enquiry-online]'], ['home-2.html', (id) => `label.hm2-seva-pill:has(input[value="${id}"])`, '[data-enquiry-online]']]) {
  for (const s of cfg.home.sevas) {
    const { ctx, page } = await open(src, { width: 1280, reduced: true });
    await loadAll(page);
    await page.locator(pick(s.id)).scrollIntoViewIfNeeded(); await page.locator(pick(s.id)).click();
    await Promise.all([page.waitForURL(/contact\.html/), page.locator(online).click()]);
    await page.waitForLoadState('load'); await page.waitForTimeout(250);
    const v = await page.evaluate(() => document.getElementById('f-topic').value);
    check(`${src} seva "${s.name}" → Contact topic seva-${s.id}`, v === 'seva-' + s.id, v);
    linkClicks++; await ctx.close();
  }
}
// phone viewport too (links must work on a phone layout)
await followAndCheck('pooja-timings.html', 'main a[href="contact.html?topic=festival-ratha"]', 'festival-ratha', 'phone link', { width: 375, height: 800 });
await followAndCheck('donations.html', 'main a[href="contact.html?topic=donation"]', 'donation', 'phone link', { width: 375, height: 800 });
console.log(`  ${linkClicks} real link clicks verified`);

// 7 ─ Topic edge cases + preservation ───────────────────────────────────
section('Topic edge cases and preservation');
for (const [q, expected, note] of [['', '', 'no topic'], ['?topic=', '', 'empty topic'], ['?topic=bogus', '', 'unknown id'], ['?topic=%3Cscript%3Ealert(1)%3C%2Fscript%3E', '', 'script injection'], ['?topic=seva-archana%00', '', 'null byte'], ['?topic=' + 'a'.repeat(500), '', 'very long'], ['?topic=../../etc/passwd', '', 'path traversal'], ['?topic=SEVA-ARCHANA', 'seva-archana', 'upper-case is normalised'], ['?topic=%20festival-kolam%20', 'festival-kolam', 'surrounding spaces'], ['?x=1&topic=donation&y=2', 'donation', 'with other params'], ['?topic=donation&topic=other', 'donation', 'repeated param uses the first'], ['?topic=general', 'general', 'general topic']]) {
  const { ctx, page, errors } = await open('contact.html' + q, { width: 1280, reduced: true });
  await page.waitForTimeout(250);
  const st = await page.evaluate(() => ({ topic: document.getElementById('f-topic').value, noteHidden: document.querySelector('[data-topic-note]').hidden, bodyAlert: !!document.querySelector('[role="alert"]:not([hidden])') }));
  check(`topic edge case: ${note}`, st.topic === expected && (expected ? !st.noteHidden : st.noteHidden) && !st.bodyAlert && errors.length === 0, JSON.stringify(st) + errors.join('|'));
  await ctx.close();
}
{
  const { ctx, page } = await open('contact.html?topic=seva-abhishekam', { width: 1280, reduced: true });
  await page.waitForTimeout(250);
  const prefill = await page.inputValue('#f-message');
  await page.fill('#f-name', 'Asha Rao'); await page.fill('#f-email', 'asha@example.com'); await page.fill('#f-phone', '+91 98765 43210');
  await page.fill('#f-message', prefill + 'Could you share the offering details?');
  check('topic stays selected while filling other fields', (await page.inputValue('#f-topic')) === 'seva-abhishekam');
  await page.locator('#f-email').fill('bad'); await page.locator('#f-name').focus();
  check('topic stays selected after a field fails validation', (await page.inputValue('#f-topic')) === 'seva-abhishekam' && (await page.locator('#err-email').isVisible()));
  await page.click('button[type="submit"]'); await page.waitForTimeout(200);
  check('topic stays selected after a failed submit', (await page.inputValue('#f-topic')) === 'seva-abhishekam');
  check('own typing is never overwritten by the prefill', (await page.inputValue('#f-message')).includes('Could you share'));
  await page.selectOption('#f-topic', 'visit');
  check('visitor can change the topic; link note disappears', (await page.inputValue('#f-topic')) === 'visit' && (await page.locator('[data-topic-note]').isHidden()));
  await page.evaluate(() => document.getElementById('enquiry-form').reset()); await page.waitForTimeout(100);
  check('Reset returns to the link topic and clears the entries', (await page.inputValue('#f-topic')) === 'seva-abhishekam' && (await page.inputValue('#f-name')) === '');
  await ctx.close();
}

// 8 ─ Form validation & honest submission ───────────────────────────────
section('Form: validation, accessibility, honest submission');
for (const width of [375, 1280]) {
  const { ctx, page, errors } = await open('contact.html', { width, reduced: true, perms: ['clipboard-read', 'clipboard-write'] });
  await loadAll(page);
  const tag = `@${width}`;
  const form = page.locator('#enquiry-form');
  check(`form has a no-JS fallback (mailto action, post) and no novalidate in markup ${tag}`, (await form.getAttribute('action')) === 'mailto:' + cfg.email && (await form.getAttribute('method')) === 'post' && (await form.getAttribute('enctype')) === 'text/plain');
  check(`every control has an associated label ${tag}`, await page.evaluate(() => [...document.querySelectorAll('#enquiry-form input,#enquiry-form select,#enquiry-form textarea')].every((c) => document.querySelector(`label[for="${c.id}"]`))));
  check(`required fields are marked required ${tag}`, (await page.locator('#f-name[required], #f-email[required], #f-topic[required], #f-message[required]').count()) === 4 && (await page.locator('#f-phone[required]').count()) === 0);
  await page.click('button[type="submit"]'); await page.waitForTimeout(200);
  const sum = page.locator('[data-summary]');
  check(`empty submit: error summary shown, role=alert, focused ${tag}`, await sum.isVisible() && (await sum.getAttribute('role')) === 'alert' && await sum.evaluate((e) => document.activeElement === e));
  check(`empty submit: 4 required-field errors listed (phone optional) ${tag}`, (await sum.locator('li').count()) === 4);
  check(`empty submit: each invalid field has aria-invalid and a linked visible message ${tag}`, await page.evaluate(() => ['name', 'email', 'topic', 'message'].every((n) => { const f = document.getElementById('f-' + n), e = document.getElementById('err-' + n); return f.getAttribute('aria-invalid') === 'true' && !e.hidden && e.textContent.length > 5 && f.getAttribute('aria-describedby').split(' ').includes('err-' + n); })));
  check(`empty submit: no result/"sent" message shown ${tag}`, !(await page.locator('[data-result]').isVisible()));
  await sum.locator('a').first().click();
  check(`summary link moves focus to the field ${tag}`, (await page.evaluate(() => document.activeElement.id)) === 'f-name');
  await page.fill('#f-email', 'abc'); await page.keyboard.press('Tab');
  check(`invalid email "abc": specific message ${tag}`, /valid email/i.test(await page.locator('#err-email').textContent()));
  for (const bad of ['a@b', 'a b@c.com', '@x.com', 'a@b.c']) { await page.fill('#f-email', bad); await page.locator('#f-email').blur(); check(`invalid email rejected: "${bad}" ${tag}`, await page.locator('#err-email').isVisible()); }
  await page.fill('#f-email', 'asha@example.com'); await page.locator('#f-email').blur();
  check(`valid email clears its error ${tag}`, await page.locator('#err-email').isHidden() && !(await page.locator('#f-email').getAttribute('aria-invalid')));
  await page.fill('#f-phone', 'abc'); await page.locator('#f-phone').blur();
  check(`invalid phone rejected; optional when empty ${tag}`, await page.locator('#err-phone').isVisible());
  await page.fill('#f-phone', '+91 98765 43210'); await page.locator('#f-phone').blur();
  check(`valid phone accepted ${tag}`, await page.locator('#err-phone').isHidden());
  await page.fill('#f-message', 'short'); await page.locator('#f-message').blur();
  check(`short message rejected ${tag}`, /at least 10/i.test(await page.locator('#err-message').textContent()));
  await page.fill('#f-name', '   '); await page.locator('#f-name').blur();
  check(`whitespace-only name rejected ${tag}`, await page.locator('#err-name').isVisible());
  await page.fill('#f-name', 'Asha Rao'); await page.selectOption('#f-topic', 'seva-archana'); await page.fill('#f-message', 'I would like to enquire about an Archana seva for my family.');
  // honest submission (no endpoint configured)
  await page.evaluate(() => { window.__nav = []; });
  await page.click('button[type="submit"]'); await page.waitForTimeout(300);
  const res = page.locator('[data-result]');
  const resText = await res.innerText();
  check(`valid submit: result panel shown and focused ${tag}`, await res.isVisible() && await res.evaluate((e) => document.activeElement === e));
  check(`valid submit: says plainly it has NOT been sent yet ${tag}`, /not been sent|has not been sent yet/i.test(resText), resText);
  check(`valid submit: never claims success ("message sent", "thank you", "submitted", "received") ${tag}`, !/message (was )?sent|thank you|successfully|was submitted|has been received|we have received/i.test(resText), resText);
  const mailto = await page.locator('[data-result-mailto]').getAttribute('href');
  check(`valid submit: mailto addressed to the configured email, with topic in the subject ${tag}`, mailto.startsWith('mailto:' + cfg.email + '?subject=') && decodeURIComponent(mailto).includes('Enquiry: Archana seva'), mailto.slice(0, 120));
  const body = decodeURIComponent(mailto.split('&body=')[1]);
  check(`valid submit: email body carries name, email, phone, topic and message ${tag}`, ['Asha Rao', 'asha@example.com', '+91 98765 43210', 'Topic: Archana seva', 'Archana seva for my family'].every((x) => body.includes(x)), body);
  await page.locator('[data-result-copy]').click(); await page.waitForTimeout(150);
  check(`copy message: puts the full message on the clipboard and says so ${tag}`, (await page.evaluate(() => navigator.clipboard.readText())).includes('Archana seva for my family') && /copied/i.test(await page.locator('[data-result-status]').textContent()));
  await page.locator('[data-result-edit]').click();
  check(`"Edit my message" hides the panel and focuses the message ${tag}`, !(await res.isVisible()) && (await page.evaluate(() => document.activeElement.id)) === 'f-message' && (await page.inputValue('#f-name')) === 'Asha Rao');
  check(`no console errors during form use ${tag}`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}
// keyboard-only completion
{
  const { ctx, page } = await open('contact.html', { width: 1280, reduced: true });
  await page.locator('#f-name').focus();
  await page.keyboard.type('Ravi Kumar'); await page.keyboard.press('Tab');
  await page.keyboard.type('ravi@example.com'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Tab');
  await page.keyboard.type('Please tell me the festival dates.'); await page.keyboard.press('Tab');
  check('keyboard-only: tab order reaches the submit button', (await page.evaluate(() => document.activeElement.type)) === 'submit');
  await page.keyboard.press('Enter'); await page.waitForTimeout(250);
  check('keyboard-only: Enter on the button submits and shows the result', await page.locator('[data-result]').isVisible());
  await ctx.close();
}
// real endpoint: success and failure are reported truthfully
for (const [status, expect, label] of [[200, /was submitted/i, 'success'], [500, /could not be sent|has not been sent/i, 'failure']]) {
  const { ctx, page } = await open('about.html', { width: 1280, reduced: true });
  await page.route('**/contact.html', async (route) => { const r = await route.fetch(); await route.fulfill({ response: r, body: (await r.text()).replace('data-endpoint=""', 'data-endpoint="/__form"') }); });
  let posted = null;
  await page.route('**/__form', async (route) => { posted = route.request().postData(); await route.fulfill({ status, contentType: 'application/json', body: '{}' }); });
  await page.goto(BASE + 'contact.html', { waitUntil: 'load' });
  await page.fill('#f-name', 'Asha'); await page.fill('#f-email', 'a@b.co'); await page.selectOption('#f-topic', 'donation'); await page.fill('#f-message', 'A message of enough length.');
  await page.click('button[type="submit"]'); await page.waitForTimeout(600);
  const t = await page.locator('[data-result]').innerText();
  check(`endpoint ${label}: POSTs the form data to the endpoint`, !!posted && posted.includes('A message of enough length'));
  check(`endpoint ${label}: reports ${label} truthfully`, expect.test(t), t);
  if (status === 500) check('endpoint failure: does not claim it was sent; offers phone/email', !/was submitted|thank you/i.test(t) && t.includes(cfg.email));
  await ctx.close();
}
// no JavaScript
{
  const nojs = await browser.newContext({ javaScriptEnabled: false }); const np = await nojs.newPage(); await np.goto(BASE + 'contact.html?topic=donation');
  check('contact without JS: form, labels, map and contact details all visible', await np.locator('#enquiry-form').isVisible() && await np.locator('#f-topic').isVisible() && await np.locator('.ct-map-frame').isVisible() && await np.locator('.ct-slab').isVisible() && await np.evaluate(() => [...document.querySelectorAll('main [data-reveal]')].every((e) => getComputedStyle(e).opacity === '1')));
  check('contact without JS: native required validation still applies', (await np.locator('#f-name').getAttribute('required')) !== null && (await np.locator('#f-email').getAttribute('type')) === 'email');
  const nd = await nojs.newPage(); await nd.goto(BASE + 'donations.html');
  check('donations without JS: all FAQ answers readable, all content visible', (await nd.locator('.ab-space-panel:visible').count()) === 5 && await nd.evaluate(() => [...document.querySelectorAll('main [data-reveal]')].every((e) => getComputedStyle(e).opacity === '1')));
  await nojs.close();
}

// 9 ─ Donations interactions ────────────────────────────────────────────
section('Donations: FAQ accordion, links, no payment actions');
for (const width of [375, 1280]) {
  const { ctx, page, errors } = await open('donations.html', { width, reduced: true });
  await loadAll(page);
  const tag = `@${width}`;
  const b = page.locator('.dn-faq [data-disclosure-trigger]');
  check(`FAQ: first open by default, single-open ${tag}`, (await b.nth(0).getAttribute('aria-expanded')) === 'true');
  await b.nth(1).click();
  check(`FAQ: opening one closes the other ${tag}`, (await b.nth(1).getAttribute('aria-expanded')) === 'true' && (await b.nth(0).getAttribute('aria-expanded')) === 'false' && /Temple Office/.test(await page.locator('#faq-genuine').innerText()));
  await b.nth(2).focus(); await page.keyboard.press('Enter');
  check(`FAQ: Enter opens; focus ring visible ${tag}`, await page.locator('#faq-receipt').isVisible() && await page.evaluate(() => { const s = getComputedStyle(document.activeElement); return s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2; }));
  check(`FAQ never states or implies receipts/tax benefits ${tag}`, !/(will receive a receipt|tax[- ]deduct|exempt|80g)/i.test(await page.locator('.dn-faq').evaluate((e) => e.textContent)));
  check(`ways: sponsor link goes to the sevas; volunteer goes to the form topic ${tag}`, (await page.locator('.dn-way a').evaluateAll((a) => a.map((x) => x.getAttribute('href')))).join() === 'contact.html?topic=donation,pooja-timings.html#sevas,contact.html?topic=volunteer,about.html');
  check(`hero: "Ways to Support" scrolls to #ways ${tag}`, (await page.locator('.dn-hero a[href="#ways"]').count()) === 1);
  check(`no errors ${tag}`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// 10 ─ Shared components + motion ───────────────────────────────────────
section('Shared header, mobile menu, scroll-to-top, motion');
for (const [key, P] of Object.entries(PAGES)) {
  const { ctx, page } = await open(P.route, { width: 1280, reduced: true });
  await loadAll(page);
  await page.locator('[data-dropdown-trigger]').hover(); await page.waitForTimeout(250);
  check(`${key}: Home dropdown not opened by hover; opens on click`, !(await page.locator('#home-menu').isVisible()));
  await page.locator('[data-dropdown-trigger]').click();
  check(`${key}: dropdown shows only Home 1 / Home 2`, (await page.locator('#home-menu a').allTextContents()).map((s) => s.trim()).join('|') === 'Home 1|Home 2');
  await page.evaluate(() => window.scrollTo(0, 1500)); await page.waitForTimeout(150);
  await page.locator('[data-scroll-top]').click(); await page.waitForTimeout(150);
  check(`${key}: scroll-to-top works`, (await page.evaluate(() => scrollY)) === 0);
  check(`${key}: reduced motion shows all reveal content`, await page.evaluate(() => [...document.querySelectorAll('main [data-reveal]')].every((e) => getComputedStyle(e).opacity === '1')));
  await ctx.close();
  const m = await open(P.route, { width: 375, reduced: true });
  await m.page.locator('[data-menu-open]').click(); await m.page.waitForTimeout(150);
  check(`${key}: mobile menu opens (theme/dir/CTA inside, accordion collapsed)`, await m.page.locator('#mobile-menu [data-theme-toggle]').isVisible() && await m.page.locator('#mobile-menu [data-dir-toggle]').isVisible() && !(await m.page.locator('#m-home-menu').isVisible()));
  await m.page.keyboard.press('Escape'); await m.page.waitForTimeout(150);
  check(`${key}: Escape closes menu; header has no theme/dir/CTA on phones`, !(await m.page.locator('#mobile-menu').isVisible()) && !(await m.page.locator('.site-header [data-theme-toggle]').isVisible()) && !(await m.page.locator('.site-header .btn').isVisible()));
  await m.ctx.close();
  const a = await open(P.route, { width: 1280, reduced: false });
  check(`${key}: below-the-fold content starts hidden for reveal`, await a.page.evaluate(() => [...document.querySelectorAll('main [data-reveal]')].filter((e) => e.getBoundingClientRect().top > innerHeight + 50).every((e) => getComputedStyle(e).opacity === '0')));
  await a.ctx.close();
}

// 11 ─ axe ──────────────────────────────────────────────────────────────
section('axe-core (WCAG 2.2 A/AA + best practice)');
const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
let axeRuns = 0;
for (const [key, P] of Object.entries(PAGES)) for (const theme of ['light', 'dark']) for (const dir of ['ltr', 'rtl']) for (const width of [375, 768, 1280]) {
  const { ctx, page } = await open(P.route, { width, theme, dir, reduced: true });
  await loadAll(page);
  const run = async (label) => { const r = await new AxeBuilder({ page }).withTags(tags).analyze(); const v = r.violations.map((x) => `${x.id} (${x.nodes.length}): ${x.nodes[0]?.target.join(' ')}`); check(`axe ${key} ${label} @${width} ${theme}/${dir}`, v.length === 0, v.join(' ; ')); axeRuns++; };
  await run('default');
  if (key === 'contact') {
    await page.click('button[type="submit"]'); await page.waitForTimeout(200);
    await run('form errors showing');
    await page.fill('#f-name', 'Asha Rao'); await page.fill('#f-email', 'asha@example.com'); await page.selectOption('#f-topic', 'donation'); await page.fill('#f-message', 'I would like to ask about contributing.');
    await page.click('button[type="submit"]'); await page.waitForTimeout(200);
    await run('result panel showing');
  } else {
    await page.evaluate(() => document.querySelectorAll('[data-disclosure-trigger]').forEach((b, i) => i === 2 && b.click()));
    await run('FAQ open');
  }
  await ctx.close();
}
console.log(`  ${axeRuns} axe audits`);

// 12 ─ Screenshots ──────────────────────────────────────────────────────
section(`Screenshots → ${SHOTS}`);
for (const [key, P] of Object.entries(PAGES)) for (const [w, theme, dir] of [[320, 'light', 'ltr'], [375, 'dark', 'ltr'], [768, 'light', 'rtl'], [1024, 'light', 'ltr'], [1440, 'light', 'ltr'], [1440, 'dark', 'rtl'], [1920, 'dark', 'ltr']]) {
  const { ctx, page } = await open(P.route, { width: w, theme, dir, reduced: true });
  await loadAll(page);
  await page.addStyleTag({ content: '.site-header{position:static!important}.scroll-top,.skip-link{display:none!important}' });
  for (const id of P.ids) await page.locator('#' + id).screenshot({ path: path.join(SHOTS, `${key}-${w}-${theme}-${dir}-${id}.png`) });
  await ctx.close();
}

await browser.close(); server.close();
console.log(`\n══ Donations + Contact QA: ${results.pass} passed, ${results.fail.length} failed ══`);
if (results.fail.length) { results.fail.slice(0, 80).forEach((f) => console.log('  ✗ ' + f)); if (results.fail.length > 80) console.log(`  … and ${results.fail.length - 80} more`); process.exit(1); }
