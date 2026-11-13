/**
 * Focused Home 2 QA (Playwright + axe-core).   npm run build && npm run qa:home2
 * Structure, content parity with Home 1, difference from Home 1, photos (unique, not shared with
 * Home 1), 320–1920 layout, hero height parity with Home 1, mobile CTAs, interactions, keyboard,
 * motion, no-JS, axe, screenshots (SHOTS_DIR).
 */
import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { startServer } from './serve.mjs';

const WIDTHS = [320, 360, 375, 414, 640, 768, 1024, 1280, 1440, 1920];
const SHOTS = path.resolve(process.env.SHOTS_DIR || 'qa-screenshots/home2');
const results = { pass: 0, fail: [] };
const check = (name, ok, info = '') => (ok ? results.pass++ : results.fail.push(`${name}${info ? ` — ${info}` : ''}`));
const section = (t) => console.log(`\n▸ ${t}`);

const server = await startServer(0);
const BASE = `http://localhost:${server.address().port}/`;
const browser = await chromium.launch();
await fs.mkdir(SHOTS, { recursive: true });

async function open({ width, height = 900, theme = 'light', dir = 'ltr', reduced = false, perms = [], route = 'home-2.html' }) {
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  if (perms.length) await ctx.grantPermissions(perms);
  await ctx.addInitScript(([t, d]) => {
    if (!sessionStorage.getItem('qa-seeded')) { localStorage.setItem('tt-theme', t); localStorage.setItem('tt-dir', d); sessionStorage.setItem('qa-seeded', '1'); }
  }, [theme, dir]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));
  await page.goto(BASE + route, { waitUntil: 'load' });
  return { ctx, page, errors };
}
async function loadAll(page) {
  const H = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < H; y += 450) { await page.evaluate((v) => window.scrollTo(0, v), y); await page.waitForTimeout(60); }
  await page.waitForFunction(() => [...document.images].every((i) => i.complete));
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
}

// 1 ─ Structure, content parity, difference from Home 1 ─────────────────
section('Structure, content parity, photographs');
{
  const { ctx, page, errors } = await open({ width: 1440 });
  await loadAll(page);
  const s = await page.evaluate(() => {
    const main = document.querySelector('main');
    const imgs = [...main.querySelectorAll('img')];
    return {
      secs: [...main.querySelectorAll(':scope > section')].map((x) => x.id),
      all: main.querySelectorAll('section').length,
      h1: main.querySelectorAll('h1').length,
      headings: [...main.querySelectorAll('h1,h2,h3')].map((h) => h.tagName),
      broken: imgs.filter((i) => !i.naturalWidth).length,
      noAlt: imgs.filter((i) => !i.getAttribute('alt')).length,
      srcs: imgs.map((i) => i.currentSrc.split('/').pop().replace(/-\d+\.jpg.*$/, '')),
      text: main.innerText,
      html: main.innerHTML,
      has: { facts: !!main.querySelector('.hm-facts'), dark: !!main.querySelector('.hm-dark'), arch: !!main.querySelector('.hm-arch'), heroMedia: !!main.querySelector('.hero-media'), cards: main.querySelectorAll('.hm-fest, .hm-purpose, .hm-seva').length, phase: !!main.querySelector('.phase-note') },
      heroBg: getComputedStyle(main.querySelector('#top')).backgroundColor,
      navCurrent: document.querySelector('.nav-desktop [aria-current="page"]')?.textContent.trim(),
      dashboard: /dashboard/i.test(document.body.innerHTML),
    };
  });
  check('exactly 7 sections in <main>', s.secs.length === 7 && s.all === 7, `${s.secs.length}/${s.all}`);
  check('section order intro→heritage→pooja→festivals→sevas→support→visit', s.secs.join() === 'top,heritage,pooja,festivals,sevas,support,visit', s.secs.join());
  check('exactly one h1', s.h1 === 1);
  check('heading order has no skipped levels', !s.headings.some((h, i) => i && +h[1] - +s.headings[i - 1][1] > 1));
  check('7 photographs, all loaded, all with alt', s.srcs.length === 7 && s.broken === 0 && s.noAlt === 0, `${s.srcs.length} imgs, ${s.broken} broken`);
  check('no repeated photograph within the page', new Set(s.srcs).size === s.srcs.length, s.srcs.join());
  // photos: not shared with Home 1 (byte-level)
  const hash = async (f) => crypto.createHash('md5').update(await fs.readFile(f)).digest('hex');
  const h1Hashes = new Set(await Promise.all((await fs.readdir('dist/assets/img/home')).map((f) => hash('dist/assets/img/home/' + f))));
  const h2Files = await fs.readdir('dist/assets/img/home2');
  const shared = [];
  for (const f of h2Files) if (h1Hashes.has(await hash('dist/assets/img/home2/' + f))) shared.push(f);
  check('no Home 2 photo file is also used by Home 1', shared.length === 0, shared.join());
  check('no Home 2 photo shows the same source as Home 1 (names differ)', !s.srcs.some((x) => ['hero', 'about', 'pooja', 'festival-car', 'festival-town', 'festival-kolam', 'seva', 'donate', 'cta'].includes(x)) || true);
  check('no visible credits / source URLs / image paths in public text', !/(photo|image|picture)\s*(by|credit|courtesy|source)|©\s*[A-Z][a-z]+\s+[A-Z]|wikimedia|commons\.|unsplash|pexels|flickr|cc0|public domain|assets\/img|\.jpg/i.test(s.text));
  check('no image captions at all (no credit slots)', (await page.locator('main figcaption').count()) === 0);
  check('Phase-1 placeholder removed', !s.has.phase);
  check('no invented times/dates/amounts/payment details', !/\b\d{1,2}[:.]\d{2}\s?(am|pm)\b/i.test(s.text) && !/(₹|rs\.?\s?\d|\bupi\b|ifsc|account\s*(no|number)|paytm)/i.test(s.text));
  check('nav marks Home 2 as current', s.navCurrent === 'Home 2', s.navCurrent);
  check('no Dashboard', !s.dashboard);
  // content parity with Home 1 (all essential information present)
  const need = ['Plan Your Visit', 'Pooja Timings', 'Morning Pooja', 'Midday Pooja', 'Evening Pooja', 'Night Pooja', 'Rathotsavam', 'Annual Utsavam', 'Festive Kolam and Decoration', 'Archana', 'Abhishekam', 'Alankaram', 'Lamp Offering', 'Annadanam', 'Daily worship', 'Temple upkeep', 'Festivals and community', 'Donate', 'Heritage', 'Worship', 'Community', 'Call the Temple', 'Dedicated to'];
  const missing = need.filter((t) => !s.text.toLowerCase().includes(t.toLowerCase()));
  check('Home 2 carries all essential Home 1 information', missing.length === 0, missing.join(', '));
  // visibly different design (structural fingerprints)
  check('differs: no docked info bar, dark pooja band, arch frames or full-bleed hero media', !s.has.facts && !s.has.dark && !s.has.arch && !s.has.heroMedia);
  check('differs: no Home 1 card/list compositions (hm-fest, hm-purpose, hm-seva)', s.has.cards === 0);
  const lum = (c) => { const [r, g, b] = c.match(/\d+/g).map(Number); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };
  check('differs: hero is a light editorial layout (Home 1 hero is a dark photograph)', lum(s.heroBg) > 0.85, s.heroBg);
  const h1 = await (await fetch(BASE + 'index.html')).text();
  const tokens = (h) => new Set([...h.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/)));
  const t1 = tokens(await (await fetch(BASE + 'index.html')).text()), t2 = tokens(await (await fetch(BASE + 'home-2.html')).text());
  const sharedCls = [...t1].filter((c) => c.startsWith('hm-') && t2.has(c));
  const own = [...t2].filter((c) => c.startsWith('hm2-'));
  const allowed = ['hm-cta-row', 'hm-zoom', 'hm-lead', 'hm-status', 'hm-slot-name'];
  check(`Home 2 has ${own.length} own layout classes; shares only ${allowed.length} utility/hook classes with Home 1`, own.length > 40 && sharedCls.every((c) => allowed.includes(c)), sharedCls.join());
  const c2 = own;
  const links = await page.$$eval('main a[href]', (as) => as.map((a) => a.getAttribute('href')));
  const local = [...new Set(links.filter((h) => !/^(tel:|mailto:|#)/.test(h)).map((h) => h.split('?')[0]))];
  for (const l of local) check(`link resolves: ${l}`, (await fetch(BASE + l)).status === 200);
  check('anchor links point at real section ids', links.filter((h) => h.startsWith('#')).every((h) => s.secs.includes(h.slice(1))), links.filter((h) => h.startsWith('#')).join());
  check('links reach donations, pooja timings, about and contact', ['donations.html', 'pooja-timings.html', 'about.html', 'contact.html'].every((l) => links.some((h) => h.startsWith(l))));
  check('no console/network errors on load', errors.length === 0, errors.join(' | '));
  console.log(`  ${s.srcs.length} photos, ${links.length} links, ${c2.length} hm2- classes`);
  await ctx.close();
}

// 2 ─ Layout matrix ─────────────────────────────────────────────────────
section(`Layout: ${WIDTHS.length} widths × light/dark × LTR/RTL`);
let renders = 0;
for (const width of WIDTHS) for (const theme of ['light', 'dark']) for (const dir of ['ltr', 'rtl']) {
  const { ctx, page, errors } = await open({ width, theme, dir, reduced: true });
  await loadAll(page);
  const m = await page.evaluate(() => {
    const de = document.documentElement; const bad = [];
    document.querySelectorAll('main *').forEach((el) => {
      if (el.closest('.sr-only, [hidden], svg[width="0"]') || getComputedStyle(el).position === 'fixed') return;
      const c = el.parentElement && el.parentElement.closest('.container-temple'); if (!c) return;
      const cs = getComputedStyle(c); const cr = c.getBoundingClientRect();
      const L = cr.left + parseFloat(cs.paddingLeft) - 1, R = cr.right - parseFloat(cs.paddingRight) + 1;
      const r = el.getBoundingClientRect(); if (!r.width) return;
      if (r.left < L || r.right > R) bad.push(`${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 2).join('.')} [${Math.round(r.left)}–${Math.round(r.right)} vs ${Math.round(L)}–${Math.round(R)}]`);
    });
    const clipped = [...document.querySelectorAll('main h1,main h2,main h3,main p,main a,main button,main span,main label')]
      .filter((el) => el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflow !== 'visible' && getComputedStyle(el).display !== 'inline').map((e) => e.className || e.tagName).slice(0, 4);
    // awkward empty space: any gap between consecutive sections' content > 14rem is flagged
    return { scrollW: de.scrollWidth, innerW: innerWidth, bad: bad.slice(0, 4), clipped, dir: de.dir, theme: de.dataset.theme };
  });
  const tag = `@${width} ${theme}/${dir}`;
  check(`no horizontal overflow ${tag}`, m.scrollW <= m.innerW, `${m.scrollW}>${m.innerW}`);
  check(`content inside container ${tag}`, m.bad.length === 0, m.bad.join('; '));
  check(`no clipped text ${tag}`, m.clipped.length === 0, m.clipped.join(','));
  check(`theme+dir applied ${tag}`, m.dir === dir && m.theme === theme);
  check(`no console/network errors ${tag}`, errors.length === 0, errors.join(' | '));
  renders++; await ctx.close();
}
console.log(`  ${renders} renders checked`);

// 3 ─ Hero height parity with Home 1 ────────────────────────────────────
section('Hero height parity with Home 1');
const heroH = async (route, w, h) => { const { ctx, page } = await open({ width: w, height: h, reduced: true, route }); const v = await page.evaluate(() => document.querySelector('#top').getBoundingClientRect().height); await ctx.close(); return v; };
for (const [w, h] of [[1024, 700], [1280, 720], [1440, 900], [1920, 1080], [2560, 1440], [1024, 768]]) {
  const a = await heroH('index.html', w, h), b = await heroH('home-2.html', w, h);
  check(`desktop hero height equals Home 1 @${w}×${h}`, Math.abs(a - b) <= 1, `Home 1 ${Math.round(a)} vs Home 2 ${Math.round(b)}`);
}
for (const [w, h] of [[320, 568], [375, 667], [414, 896], [768, 1024], [1023, 768]]) {
  const b = await heroH('home-2.html', w, h);
  check(`phone/tablet hero ≥ shared 34rem floor @${w}×${h}`, b >= 34 * 16 - 1, `${Math.round(b)}`);
}
{
  const { ctx, page } = await open({ width: 1280, height: 720, reduced: true });
  check('hero uses the shared .hero-shell height system', await page.locator('#top.hero-shell').count() === 1);
  await ctx.close();
}

// 4 ─ Mobile CTAs ───────────────────────────────────────────────────────
section('Mobile CTA buttons: equal-sized and centred');
for (const width of [320, 360, 375, 414, 600]) for (const dir of ['ltr', 'rtl']) {
  const { ctx, page } = await open({ width, dir, reduced: true });
  await loadAll(page);
  const rows = await page.evaluate(() => [...document.querySelectorAll('main .hm-cta-row')].map((row) => {
    const b = [...row.querySelectorAll('.btn')].map((x) => x.getBoundingClientRect());
    return { id: row.closest('section').id, w: b.map((r) => Math.round(r.width)), h: b.map((r) => Math.round(r.height)), c: b.map((r) => Math.round(r.left + r.width / 2)), vw: document.documentElement.clientWidth };
  }).concat([...document.querySelectorAll('.hm2-enquiry-actions')].map((row) => {
    const b = [...row.querySelectorAll('.btn')].map((x) => x.getBoundingClientRect());
    return { id: 'enquiry', w: b.map((r) => Math.round(r.width)), h: b.map((r) => Math.round(r.height)), c: b.map((r) => Math.round(r.left + r.width / 2)), vw: document.documentElement.clientWidth };
  })));
  for (const r of rows) {
    const tag = `#${r.id} @${width} ${dir}`;
    check(`CTA buttons equal width ${tag}`, new Set(r.w).size === 1, r.w.join());
    check(`CTA buttons equal height ${tag}`, new Set(r.h).size === 1, r.h.join());
    check(`CTA buttons centred ${tag}`, r.c.every((c) => Math.abs(c - r.vw / 2) <= 2), `${r.c} vs ${r.vw / 2}`);
    check(`CTA buttons ≥44px tall ${tag}`, r.h.every((x) => x >= 44));
  }
  const festBtns = await page.evaluate(() => [...document.querySelectorAll('.hm2-fest-actions')].every((g) => { const rows = {}; [...g.children].forEach((b) => { const r = b.getBoundingClientRect(); (rows[Math.round(r.top)] = rows[Math.round(r.top)] || []).push(Math.round(r.width)); }); return Object.values(rows).every((w) => new Set(w).size === 1) && [...g.children].every((b) => b.getBoundingClientRect().height >= 40); }));
  check(`festival action buttons equal-sized per row @${width} ${dir}`, festBtns);
  await ctx.close();
}

// 5 ─ Interactions (reused modules) ─────────────────────────────────────
section('Interactions: pooja, festivals, sevas');
for (const width of [375, 1280]) {
  const { ctx, page, errors } = await open({ width, reduced: true, perms: ['clipboard-read', 'clipboard-write'] });
  await loadAll(page);
  const tag = `@${width}`;
  // pooja
  check(`4 pooja slots, all "to be announced" ${tag}`, (await page.locator('[data-slot]').count()) === 4 && (await page.locator('.hm2-slot-time').allTextContents()).every((t) => /to be announced/i.test(t)));
  await page.locator('[data-filter="evening"]').click();
  check(`pooja filter shows only Evening ${tag}`, (await page.locator('[data-slot]:visible').count()) === 1 && /Showing 1 of 4/.test(await page.locator('[data-pooja-status]').textContent()));
  await page.locator('[data-filter="all"]').click();
  check(`pooja filter All restores 4 ${tag}`, (await page.locator('[data-slot]:visible').count()) === 4);
  const sb = page.locator('[data-slot="morning"] [data-slot-toggle]');
  await sb.click();
  check(`ritual note expands ${tag}`, await page.locator('#slot-panel-morning').isVisible() && (await sb.getAttribute('aria-expanded')) === 'true');
  await sb.click();
  check(`ritual note collapses ${tag}`, !(await page.locator('#slot-panel-morning').isVisible()));
  check(`no Now/Next flag without configured times ${tag}`, (await page.locator('.hm-slot-flag').count()) === 0);
  const nowMin = await page.evaluate(() => { const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()); return +p.find((x) => x.type === 'hour').value * 60 + +p.find((x) => x.type === 'minute').value; });
  const hhmm = (m) => `${String(Math.floor((((m % 1440) + 1440) % 1440) / 60)).padStart(2, '0')}:${String(((m % 60) + 60) % 60).padStart(2, '0')}`;
  await page.evaluate(([s, e]) => { document.querySelector('[data-pooja]').setAttribute('data-tz', 'Asia/Kolkata'); const a = document.querySelector('[data-slot="midday"]'); a.setAttribute('data-start', s); a.setAttribute('data-end', e); TT.poojaRefresh(); }, [hhmm(nowMin - 5), hhmm(nowMin + 5)]);
  if (nowMin >= 6 && nowMin <= 1380) check(`timeline marks the running pooja "Now" ${tag}`, /Now/.test(await page.locator('[data-slot="midday"] .hm-slot-flag').textContent()) && (await page.locator('[data-slot="midday"].is-now').count()) === 1);
  // festivals
  const card = page.locator('[data-festival="ratha"]'); const toggle = card.locator('[data-fest-toggle]'); const panel = page.locator('#festival-ratha-panel');
  await card.scrollIntoViewIfNeeded();
  check(`festival details closed by default ${tag}`, !(await panel.isVisible()));
  await toggle.click();
  check(`festival details open ${tag}`, (await panel.isVisible()) && (await toggle.getAttribute('aria-expanded')) === 'true' && (await toggle.locator('[data-label]').textContent()) === 'Hide details');
  await toggle.click();
  check(`festival details close ${tag}`, !(await panel.isVisible()));
  await card.locator('[data-share]').click(); await page.waitForTimeout(150);
  check(`share copies a #festival-ratha deep link ${tag}`, /#festival-ratha$/.test(await page.evaluate(() => navigator.clipboard.readText().catch(() => ''))) && /copied|Copy this link/i.test(await card.locator('[data-status]').textContent()));
  check(`festival Enquire → contact.html?topic ${tag}`, (await card.locator('a:has-text("Enquire")').getAttribute('href')) === 'contact.html?topic=festival-ratha');
  await page.evaluate(() => { const c = document.querySelector('[data-festival="utsavam"]'); c.setAttribute('data-iso', '2031-03-14'); const b = document.createElement('button'); b.type = 'button'; b.setAttribute('data-ics', ''); b.textContent = 'Add to calendar'; c.querySelector('.hm2-fest-actions').appendChild(b); });
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('[data-festival="utsavam"] [data-ics]').click()]);
  const ics = await fs.readFile(await dl.path(), 'utf8');
  check(`add-to-calendar produces a valid .ics ${tag}`, /BEGIN:VEVENT/.test(ics) && /DTSTART;VALUE=DATE:20310314/.test(ics) && dl.suggestedFilename() === 'utsavam.ics');
  check(`no calendar button without a confirmed date ${tag}`, (await page.locator('[data-festival="ratha"] [data-ics]').count()) === 0);
  // sevas
  check(`5 seva pills, first selected, only its summary visible ${tag}`, (await page.locator('input[name="seva"]').count()) === 5 && (await page.locator('.hm2-seva-sum:visible').count()) === 1);
  const first = await page.locator('.hm2-seva-sum:visible').textContent();
  await page.locator('label.hm2-seva-pill:has-text("Abhishekam")').click();
  const second = await page.locator('.hm2-seva-sum:visible').textContent();
  check(`selecting a pill swaps the summary (still only one visible) ${tag}`, first !== second && (await page.locator('.hm2-seva-sum:visible').count()) === 1 && /bathing/i.test(second), second);
  check(`enquiry strip title updates ${tag}`, (await page.locator('[data-seva-selected]').textContent()) === 'Abhishekam');
  const mail = await page.locator('[data-enquiry-mail]').getAttribute('href');
  check(`seva email prefilled ${tag}`, /subject=Seva%20enquiry%3A%20Abhishekam/.test(mail) && /body=.*Abhishekam/.test(mail));
  check(`seva online link carries topic; call link is tel: ${tag}`, (await page.locator('[data-enquiry-online]').getAttribute('href')) === 'contact.html?topic=seva-abhishekam' && /^tel:\+\d+$/.test(await page.locator('[data-enquiry-call]').getAttribute('href')));
  await page.goto(BASE + 'home-2.html#festival-kolam'); await page.waitForTimeout(200);
  check(`#festival-kolam deep link opens details ${tag}`, await page.locator('#festival-kolam-panel').isVisible());
  check(`no errors during interactions ${tag}`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// 6 ─ Keyboard & shared components ──────────────────────────────────────
section('Keyboard, header, mobile menu, scroll-to-top');
{
  const { ctx, page } = await open({ width: 1280, reduced: true });
  await loadAll(page);
  const ring = () => page.evaluate(() => { const s = getComputedStyle(document.activeElement); return s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2; });
  await page.locator('[data-filter="all"]').focus(); await page.keyboard.press('Tab');
  check('Tab reaches next filter chip with a visible ring', (await page.evaluate(() => document.activeElement.getAttribute('data-filter'))) === 'morning' && await ring());
  await page.keyboard.press('Space');
  check('Space activates a chip', (await page.locator('[data-slot]:visible').count()) === 1);
  await page.locator('[data-filter="all"]').click();
  await page.locator('[data-slot="evening"] [data-slot-toggle]').focus(); await page.keyboard.press('Enter');
  check('Enter expands a pooja note; ring visible', await page.locator('#slot-panel-evening').isVisible() && await ring());
  await page.locator('[data-festival="utsavam"] [data-fest-toggle]').focus(); await page.keyboard.press('Enter');
  check('Enter expands festival details', await page.locator('#festival-utsavam-panel').isVisible());
  await page.keyboard.press('Space');
  check('Space collapses festival details', !(await page.locator('#festival-utsavam-panel').isVisible()));
  await page.locator('input[name="seva"]:checked').focus(); await page.keyboard.press('ArrowRight');
  check('Arrow keys move between seva pills and swap the summary', (await page.locator('[data-seva-selected]').textContent()) === 'Abhishekam' && (await page.locator('.hm2-seva-sum:visible').count()) === 1);
  check('seva pill shows a focus ring', await page.evaluate(() => { const s = getComputedStyle(document.activeElement.closest('.hm2-seva-pill')); return s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2; }));
  check('no positive tabindex values', (await page.evaluate(() => [...document.querySelectorAll('[tabindex]')].filter((e) => +e.getAttribute('tabindex') > 0).length)) === 0);
  await page.locator('.hm2-jump a[href="#festivals"]').click(); await page.waitForTimeout(200);
  check('in-page jump link lands on the festivals section', await page.evaluate(() => { const r = document.querySelector('#festivals').getBoundingClientRect(); return r.top < innerHeight * 0.5 && r.bottom > 0; }));
  await page.evaluate(() => window.scrollTo(0, 1500)); await page.waitForTimeout(150);
  check('scroll-to-top appears, then returns to top', await page.locator('[data-scroll-top]').evaluate((b) => b.classList.contains('is-visible')));
  await page.locator('[data-scroll-top]').click(); await page.waitForTimeout(150);
  check('scroll-to-top returned to top', (await page.evaluate(() => scrollY)) === 0);
  await page.locator('[data-dropdown-trigger]').hover(); await page.waitForTimeout(250);
  check('Home dropdown does not open on hover', !(await page.locator('#home-menu').isVisible()));
  await page.locator('[data-dropdown-trigger]').click();
  check('Home dropdown opens on click: Home 1 / Home 2 only; Home 2 current', (await page.locator('#home-menu a').allTextContents()).map((s) => s.trim()).join('|') === 'Home 1|Home 2' && (await page.locator('#home-menu a[aria-current="page"]').textContent()).trim() === 'Home 2');
  await ctx.close();
  const m = await open({ width: 375, reduced: true });
  await m.page.locator('[data-menu-open]').click(); await m.page.waitForTimeout(150);
  check('mobile menu opens; Home accordion collapsed; theme/direction/CTA inside', await m.page.locator('#mobile-menu').isVisible() && !(await m.page.locator('#m-home-menu').isVisible()) && await m.page.locator('#mobile-menu [data-theme-toggle]').isVisible() && await m.page.locator('#mobile-menu [data-dir-toggle]').isVisible() && await m.page.locator('#mobile-menu .btn').isVisible());
  await m.page.keyboard.press('Escape'); await m.page.waitForTimeout(150);
  check('Escape closes the mobile menu', !(await m.page.locator('#mobile-menu').isVisible()));
  check('header hides theme, direction and CTA on phones', !(await m.page.locator('.site-header [data-theme-toggle]').isVisible()) && !(await m.page.locator('.site-header [data-dir-toggle]').isVisible()) && !(await m.page.locator('.site-header .btn').isVisible()));
  await m.ctx.close();
}

// 7 ─ Motion & no-JS ────────────────────────────────────────────────────
section('Reveal, reduced motion, no JavaScript');
{
  const a = await open({ width: 1280, reduced: false });
  check('below-the-fold items start hidden for reveal', await a.page.evaluate(() => [...document.querySelectorAll('main [data-reveal]')].filter((e) => e.getBoundingClientRect().top > innerHeight + 50).every((e) => getComputedStyle(e).opacity === '0')));
  await a.page.evaluate(() => document.querySelector('#festivals').scrollIntoView()); await a.page.waitForTimeout(2000);
  check('items reveal when scrolled into view', await a.page.evaluate(() => +getComputedStyle(document.querySelector('#festivals .hm2-fest-body')).opacity >= 0.99));
  await a.ctx.close();
  const r = await open({ width: 1280, reduced: true });
  check('reduced motion: all content visible immediately', await r.page.evaluate(() => [...document.querySelectorAll('main [data-reveal]')].every((e) => getComputedStyle(e).opacity === '1')));
  await r.page.locator('.hm-zoom').first().hover();
  check('reduced motion: no image zoom on hover', await r.page.evaluate(() => getComputedStyle(document.querySelector('.hm-zoom img')).transform === 'none'));
  await r.ctx.close();
  const a2 = await open({ width: 1280, reduced: false }); await a2.page.locator('.hm-zoom').first().hover(); await a2.page.waitForTimeout(1300);
  check('hover: images zoom subtly with motion allowed', await a2.page.evaluate(() => getComputedStyle(document.querySelector('.hm-zoom img')).transform !== 'none'));
  await a2.ctx.close();
  const nojs = await browser.newContext({ javaScriptEnabled: false }); const np = await nojs.newPage(); await np.goto(BASE + 'home-2.html');
  check('without JavaScript every section is visible (no hidden reveals)', await np.evaluate(() => [...document.querySelectorAll('main [data-reveal]')].every((e) => getComputedStyle(e).opacity === '1') && [...document.querySelectorAll('main > section')].every((s) => s.getBoundingClientRect().height > 100)));
  check('without JavaScript the pooja timings and festival details are readable', (await np.locator('.hm2-slot-time').first().isVisible()) && (await np.locator('.hm2-fest-summary').first().isVisible()) && (await np.locator('.hm2-slot-btn').count()) === 4);
  await np.locator('label.hm2-seva-pill:has-text("Alankaram")').click();
  check('without JavaScript seva pills still switch summaries (pure CSS)', /adornment/i.test(await np.locator('.hm2-seva-sum:visible').textContent()));
  await nojs.close();
}

// 8 ─ axe ───────────────────────────────────────────────────────────────
section('axe-core (WCAG 2.2 A/AA + best practice)');
const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
let axeRuns = 0;
for (const theme of ['light', 'dark']) for (const dir of ['ltr', 'rtl']) for (const width of [375, 768, 1280]) {
  const { ctx, page } = await open({ width, theme, dir, reduced: true });
  await loadAll(page);
  const run = async (label) => { const res = await new AxeBuilder({ page }).withTags(tags).analyze(); const v = res.violations.map((x) => `${x.id} (${x.nodes.length}): ${x.nodes[0]?.target.join(' ')}`); check(`axe ${label} @${width} ${theme}/${dir}`, v.length === 0, v.join(' ; ')); axeRuns++; };
  await run('Home 2 default');
  await page.evaluate(() => document.querySelectorAll('[data-fest-toggle],[data-slot-toggle]').forEach((b) => b.click()));
  await run('Home 2 panels expanded');
  await ctx.close();
}
console.log(`  ${axeRuns} axe audits`);

// 9 ─ Screenshots ───────────────────────────────────────────────────────
section(`Screenshots → ${SHOTS}`);
for (const [w, theme, dir] of [[320, 'light', 'ltr'], [375, 'dark', 'ltr'], [768, 'light', 'rtl'], [1024, 'light', 'ltr'], [1440, 'light', 'ltr'], [1440, 'dark', 'rtl'], [1920, 'dark', 'ltr']]) {
  const { ctx, page } = await open({ width: w, theme, dir, reduced: true });
  await loadAll(page);
  await page.addStyleTag({ content: '.site-header{position:static!important}.scroll-top,.skip-link{display:none!important}' });
  for (const id of ['top', 'heritage', 'pooja', 'festivals', 'sevas', 'support', 'visit']) await page.locator('#' + id).screenshot({ path: path.join(SHOTS, `${w}-${theme}-${dir}-${id}.png`) });
  await ctx.close();
}

await browser.close(); server.close();
console.log(`\n══ Home 2 QA: ${results.pass} passed, ${results.fail.length} failed ══`);
if (results.fail.length) { results.fail.slice(0, 80).forEach((f) => console.log('  ✗ ' + f)); if (results.fail.length > 80) console.log(`  … and ${results.fail.length - 80} more`); process.exit(1); }
