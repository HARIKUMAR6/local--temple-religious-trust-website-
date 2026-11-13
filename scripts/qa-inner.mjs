/**
 * Focused QA for the About and Pooja Timings pages (Playwright + axe-core).
 *   npm run build && npm run qa:inner
 */
import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { startServer } from './serve.mjs';

const WIDTHS = [320, 360, 375, 414, 640, 768, 1024, 1280, 1440, 1920];
const SHOTS = path.resolve(process.env.SHOTS_DIR || 'qa-screenshots/inner');
const PAGES = {
  about: { route: 'about.html', count: 6, ids: ['top', 'intro', 'history', 'architecture', 'traditions', 'visit'], nav: 'About' },
  pooja: { route: 'pooja-timings.html', count: 6, ids: ['top', 'schedule', 'rituals', 'sevas', 'occasions', 'visit'], nav: 'Pooja Timings' },
};
const results = { pass: 0, fail: [] };
const check = (n, ok, info = '') => (ok ? results.pass++ : results.fail.push(`${n}${info ? ` — ${info}` : ''}`));
const section = (t) => console.log(`\n▸ ${t}`);

const server = await startServer(0);
const BASE = `http://localhost:${server.address().port}/`;
const browser = await chromium.launch();
await fs.mkdir(SHOTS, { recursive: true });

async function open(route, { width, height = 900, theme = 'light', dir = 'ltr', reduced = false, perms = [] }) {
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  if (perms.length) await ctx.grantPermissions(perms);
  await ctx.addInitScript(([t, d]) => { if (!sessionStorage.getItem('qa-seeded')) { localStorage.setItem('tt-theme', t); localStorage.setItem('tt-dir', d); sessionStorage.setItem('qa-seeded', '1'); } }, [theme, dir]);
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
  for (let y = 0; y < H; y += 450) { await page.evaluate((v) => window.scrollTo(0, v), y); await page.waitForTimeout(50); }
  await page.waitForFunction(() => [...document.images].every((i) => i.complete || !i.getClientRects().length));
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
}
const md5 = async (f) => crypto.createHash('md5').update(await fs.readFile(f)).digest('hex');

// 1 ─ Structure & content ───────────────────────────────────────────────
section('Structure, content rules, photographs');
const used = new Set();
const other = new Set();
for (const d of ['home', 'home2']) for (const f of await fs.readdir(`dist/assets/img/${d}`)) other.add(await md5(`dist/assets/img/${d}/${f}`));
for (const [key, P] of Object.entries(PAGES)) {
  const { ctx, page, errors } = await open(P.route, { width: 1440 });
  await loadAll(page);
  const s = await page.evaluate(() => {
    const main = document.querySelector('main'); const imgs = [...main.querySelectorAll('img')];
    return {
      secs: [...main.querySelectorAll(':scope > section')].map((x) => x.id), all: main.querySelectorAll('section').length,
      h1: main.querySelectorAll('h1').length, headings: [...main.querySelectorAll('h1,h2,h3')].map((h) => h.tagName),
      broken: imgs.filter((i) => i.getClientRects().length && !i.naturalWidth).length, noAlt: imgs.filter((i) => !i.getAttribute('alt')).length,
      srcs: imgs.map((i) => i.getAttribute('src').split('/').slice(-2).join('/').replace(/-\d+\.jpg.*$/, '')), text: main.innerText,
      nav: document.querySelector('.nav-desktop [aria-current="page"]')?.textContent.trim(),
      fp: { hm: !!main.querySelector('.hm-hero, .hm2-hero, .hm-facts, .page-intro, .phase-note'), ab: !!main.querySelector('.ab-hero'), pt: !!main.querySelector('.pt-dial') },
      figcap: main.querySelectorAll('figcaption').length, dash: /dashboard/i.test(document.body.innerHTML),
    };
  });
  const t = key;
  check(`${t}: ${P.count} sections in <main>`, s.secs.length === P.count && s.all === P.count, `${s.secs.length}/${s.all}`);
  check(`${t}: section order`, s.secs.join() === P.ids.join(), s.secs.join());
  check(`${t}: one h1; no skipped heading levels`, s.h1 === 1 && !s.headings.some((h, i) => i && +h[1] - +s.headings[i - 1][1] > 1));
  check(`${t}: all photos load, have alt, none repeated`, s.broken === 0 && s.noAlt === 0 && new Set(s.srcs).size === s.srcs.length, `${s.srcs.length} imgs`);
  s.srcs.forEach((x) => { if (used.has(x)) check(`${t}: photo ${x} unique across the two pages`, false); used.add(x); });
  check(`${t}: no phase-1 shell / home hero / info-bar classes`, !s.fp.hm);
  check(`${t}: no credits, source URLs or image paths in visible text; no captions`, !/(photo|image|picture)\s*(by|credit|courtesy|source)|©\s*[A-Z][a-z]+\s+[A-Z]|wikimedia|commons\.|unsplash|pexels|flickr|cc0|public domain|assets\/img|\.jpg/i.test(s.text) && s.figcap === 0);
  check(`${t}: no invented times/dates/amounts`, !/\b\d{1,2}[:.]\d{2}\s?(am|pm)\b/i.test(s.text) && !/(₹|rs\.?\s?\d|\bupi\b|ifsc|paytm)/i.test(s.text));
  check(`${t}: nav marks "${P.nav}" current; no Dashboard`, s.nav === P.nav && !s.dash, s.nav);
  const links = await page.$$eval('main a[href]', (a) => a.map((x) => x.getAttribute('href')));
  for (const l of [...new Set(links.filter((h) => !/^(tel:|mailto:|#)/.test(h)).map((h) => h.split('?')[0]))]) check(`${t}: link resolves ${l}`, (await fetch(BASE + l)).status === 200);
  check(`${t}: in-page anchors hit real ids`, links.filter((h) => h.startsWith('#')).every((h) => s.secs.includes(h.slice(1))), links.filter((h) => h.startsWith('#')).join());
  check(`${t}: no console/network errors`, errors.length === 0, errors.join(' | '));
  if (key === 'about') {
    check('about: hero is the title-over-panorama layout (not Home/Pooja)', s.fp.ab && !s.fp.pt);
    check('about: all 4 history chapters + 5 sacred spaces + 5 traditions present', /Origins/.test(s.text) && /Restoration and renewal/.test(s.text) && /Gopuram/.test(s.text) && /Temple tank/.test(s.text) && /Volunteer service/.test(s.text));
    check('about: unknown facts say "to be confirmed/shared"', (s.text.match(/to be (confirmed|shared)/gi) || []).length >= 6);
    check('about: deity and trust come from config', /Presiding Deity/.test(s.text) && /Temple Trust Name/.test(s.text));
  } else {
    check('pooja: hero is the day-dial layout (not Home/About)', s.fp.pt && !s.fp.ab);
    check('pooja: clear announcement state shown (hero pill + banner)', (s.text.match(/Timings to be announced/gi) || []).length >= 2 && (await page.locator('.pt-announce').isVisible()));
    check('pooja: every slot says timing to be announced', (await page.locator('.pt-row .pt-time').allTextContents()).every((x) => /to be announced/i.test(x)));
    check('pooja: 4 slots, 4 rituals, 5 sevas, 3 occasions', (await page.locator('.pt-row').count()) === 4 && (await page.locator('.pt-tab').count()) === 4 && (await page.locator('.pt-ledger li').count()) === 5 && (await page.locator('.pt-occ').count()) === 3);
  }
  await ctx.close();
}
for (const f of await fs.readdir('dist/assets/img/pages')) check(`photo ${f} is not used on Home 1/Home 2`, !other.has(await md5('dist/assets/img/pages/' + f)));

// 2 ─ Layout matrix ─────────────────────────────────────────────────────
section(`Layout: 2 pages × ${WIDTHS.length} widths × light/dark × LTR/RTL`);
let renders = 0;
for (const [key, P] of Object.entries(PAGES)) for (const width of WIDTHS) for (const theme of ['light', 'dark']) for (const dir of ['ltr', 'rtl']) {
  const { ctx, page, errors } = await open(P.route, { width, theme, dir, reduced: true });
  await loadAll(page);
  const m = await page.evaluate(() => {
    const de = document.documentElement; const bad = [];
    document.querySelectorAll('main *').forEach((el) => {
      if (el.closest('.sr-only, [hidden], svg[width="0"]') || getComputedStyle(el).position === 'fixed') return;
      if (el.tagName === 'IMG' && el.closest('.hm-zoom')) return; // clipped by its figure (overflow hidden)
      const c = el.parentElement && el.parentElement.closest('.container-temple'); if (!c) return;
      const cs = getComputedStyle(c), cr = c.getBoundingClientRect();
      const L = cr.left + parseFloat(cs.paddingLeft) - 1, R = cr.right - parseFloat(cs.paddingRight) + 1, r = el.getBoundingClientRect();
      if (!r.width) return;
      if (r.left < L || r.right > R) bad.push(`${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 2).join('.')} [${Math.round(r.left)}–${Math.round(r.right)} vs ${Math.round(L)}–${Math.round(R)}]`);
    });
    const clipped = [...document.querySelectorAll('main h1,main h2,main h3,main p,main a,main button,main span,main label')].filter((el) => el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflow !== 'visible' && getComputedStyle(el).display !== 'inline').map((e) => e.className || e.tagName).slice(0, 4);
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

// 3 ─ Hero height parity ────────────────────────────────────────────────
section('Hero height parity with Home 1 / Home 2');
const heroH = async (route, w, h) => { const { ctx, page } = await open(route, { width: w, height: h, reduced: true }); const v = await page.evaluate(() => document.querySelector('#top').getBoundingClientRect().height); await ctx.close(); return v; };
for (const [w, h] of [[1024, 700], [1280, 720], [1440, 900], [1920, 1080], [2560, 1440], [1024, 768]]) {
  const ref = await heroH('index.html', w, h);
  for (const [k, P] of Object.entries(PAGES)) { const v = await heroH(P.route, w, h); check(`${k} hero = Home hero height @${w}×${h}`, Math.abs(v - ref) <= 1, `Home ${Math.round(ref)} vs ${Math.round(v)}`); }
}
for (const [w, h] of [[320, 568], [375, 667], [414, 896], [768, 1024], [1023, 768]]) for (const [k, P] of Object.entries(PAGES)) { const v = await heroH(P.route, w, h); check(`${k} phone/tablet hero ≥ 34rem floor @${w}×${h}`, v >= 543, `${Math.round(v)}`); }

// 4 ─ Mobile CTAs ───────────────────────────────────────────────────────
section('Mobile CTA buttons: equal-sized and centred');
for (const [key, P] of Object.entries(PAGES)) for (const width of [320, 360, 375, 414, 600]) for (const dir of ['ltr', 'rtl']) {
  const { ctx, page } = await open(P.route, { width, dir, reduced: true });
  await loadAll(page);
  const rows = await page.evaluate(() => [...document.querySelectorAll('main .hm-cta-row, main .pt-announce-actions')].map((row) => {
    const b = [...row.querySelectorAll('.btn')].map((x) => x.getBoundingClientRect());
    return { id: row.closest('section').id + (row.classList.contains('pt-announce-actions') ? '/announce' : ''), w: b.map((r) => Math.round(r.width)), h: b.map((r) => Math.round(r.height)), c: b.map((r) => Math.round(r.left + r.width / 2)), vw: document.documentElement.clientWidth, stacked: new Set(b.map((r) => Math.round(r.top))).size === b.length };
  }));
  for (const r of rows) {
    const tag = `${key} #${r.id} @${width} ${dir}`;
    check(`CTA equal width ${tag}`, new Set(r.w).size === 1, r.w.join());
    check(`CTA equal height ${tag}`, new Set(r.h).size === 1, r.h.join());
    const mid = (Math.min(...r.c) + Math.max(...r.c)) / 2;
    check(`CTA group centred ${tag}`, Math.abs(mid - r.vw / 2) <= 2, `${mid} vs ${r.vw / 2}`);
    if (r.stacked) check(`CTA stacked buttons each centred ${tag}`, r.c.every((c) => Math.abs(c - r.vw / 2) <= 2), r.c.join());
  }
  await ctx.close();
}

// 5 ─ About interactions ────────────────────────────────────────────────
section('About: architecture disclosure list, keyboard, no-JS');
for (const width of [375, 1280]) {
  const { ctx, page, errors } = await open('about.html', { width, reduced: true });
  await loadAll(page);
  const tag = `@${width}`;
  const btns = page.locator('[data-disclosure-trigger]');
  check(`first sacred space open by default ${tag}`, (await btns.nth(0).getAttribute('aria-expanded')) === 'true' && await page.locator('#space-gopuram').isVisible());
  await btns.nth(2).click();
  check(`opening one closes the others (single-open) ${tag}`, (await btns.nth(2).getAttribute('aria-expanded')) === 'true' && (await btns.nth(0).getAttribute('aria-expanded')) === 'false' && (await page.locator('.ab-space-panel:visible').count()) === 1);
  await btns.nth(2).click();
  check(`clicking the open one collapses it ${tag}`, (await page.locator('.ab-space-panel:visible').count()) === 0);
  await btns.nth(3).focus(); await page.keyboard.press('Enter');
  check(`Enter opens a space; focus ring visible ${tag}`, await page.locator('#space-prakaram').isVisible() && await page.evaluate(() => { const s = getComputedStyle(document.activeElement); return s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2; }));
  await page.keyboard.press('Space');
  check(`Space closes it again ${tag}`, !(await page.locator('#space-prakaram').isVisible()));
  check(`no errors ${tag}`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}
{
  const nojs = await browser.newContext({ javaScriptEnabled: false }); const np = await nojs.newPage(); await np.goto(BASE + 'about.html');
  check('about without JavaScript: all content visible, all sacred-space panels readable', await np.evaluate(() => [...document.querySelectorAll('main [data-reveal]')].every((e) => getComputedStyle(e).opacity === '1')) && (await np.locator('.ab-space-panel:visible').count()) === 5);
  await nojs.close();
}

// 6 ─ Pooja interactions ────────────────────────────────────────────────
section('Pooja Timings: dial, tabs, schedule, sevas, occasions, print, no-JS');
for (const width of [375, 1280]) {
  const { ctx, page, errors } = await open('pooja-timings.html', { width, reduced: true, perms: ['clipboard-read', 'clipboard-write'] });
  await loadAll(page);
  const tag = `@${width}`;
  // tabs
  check(`tabs: Morning selected, exactly one panel visible ${tag}`, (await page.locator('.pt-tab[aria-selected="true"]').count()) === 1 && (await page.locator('.pt-tab[aria-selected="true"]').textContent()).trim() === 'Morning' && (await page.locator('[data-tabpanel]:visible').count()) === 1);
  await page.locator('#tab-evening').click();
  check(`tabs: click selects Evening and shows its panel ${tag}`, await page.locator('#ritual-evening').isVisible() && !(await page.locator('#ritual-morning').isVisible()) && (await page.locator('#tab-evening').getAttribute('aria-selected')) === 'true');
  const fwd = width >= 1024 ? 'ArrowDown' : 'ArrowRight', back = width >= 1024 ? 'ArrowUp' : 'ArrowLeft';
  await page.keyboard.press(fwd);
  check(`tabs: ${fwd} moves to Night and focuses it ${tag}`, (await page.evaluate(() => document.activeElement.id)) === 'tab-night' && await page.locator('#ritual-night').isVisible());
  await page.keyboard.press(fwd);
  check(`tabs: arrow wraps to Morning ${tag}`, await page.locator('#ritual-morning').isVisible());
  await page.keyboard.press(back);
  check(`tabs: ${back} wraps back to Night ${tag}`, await page.locator('#ritual-night').isVisible());
  await page.keyboard.press('Home'); await page.keyboard.press('End');
  check(`tabs: Home/End jump to first/last ${tag}`, await page.locator('#ritual-night').isVisible());
  check(`tabs: roving tabindex + aria wiring ${tag}`, await page.evaluate(() => [...document.querySelectorAll('.pt-tab')].every((t) => document.getElementById(t.getAttribute('aria-controls'))?.getAttribute('aria-labelledby') === t.id) && document.querySelectorAll('.pt-tab[tabindex="0"]').length === 1));
  check(`tabs: focus ring visible ${tag}`, await page.evaluate(() => { const s = getComputedStyle(document.activeElement); return s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2; }));
  // hero dial → tab
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator('.pt-dial-node a[data-tab-link="midday"]').click(); await page.waitForTimeout(400);
  check(`dial: node jumps to Rituals and selects Afternoon ${tag}`, (await page.evaluate(() => location.hash)) === '#rituals' && await page.locator('#ritual-midday').isVisible() && (await page.locator('#tab-midday').getAttribute('aria-selected')) === 'true');
  // schedule
  await page.locator('[data-filter="evening"]').click();
  check(`schedule filter: only Evening ${tag}`, (await page.locator('[data-slot]:visible').count()) === 1 && /Showing 1 of 4/.test(await page.locator('[data-pooja-status]').textContent()));
  await page.locator('[data-filter="all"]').click();
  check(`schedule filter: All restores 4 ${tag}`, (await page.locator('[data-slot]:visible').count()) === 4);
  const sb = page.locator('[data-slot="morning"] [data-slot-toggle]');
  await sb.scrollIntoViewIfNeeded(); await sb.click();
  check(`schedule: row expands to "what the office will confirm" ${tag}`, await page.locator('#slot-panel-morning').isVisible() && /will confirm/.test(await page.locator('#slot-panel-morning').innerText()));
  await sb.click();
  check(`schedule: row collapses ${tag}`, !(await page.locator('#slot-panel-morning').isVisible()));
  check(`schedule: summary text readable without expanding ${tag}`, await page.locator('[data-slot="morning"] .pt-row-detail').isVisible());
  const nowMin = await page.evaluate(() => { const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()); return +p.find((x) => x.type === 'hour').value * 60 + +p.find((x) => x.type === 'minute').value; });
  check(`schedule: no Now/Next flag without configured times ${tag}`, (await page.locator('.hm-slot-flag').count()) === 0);
  const hh = (m) => `${String(Math.floor((((m % 1440) + 1440) % 1440) / 60)).padStart(2, '0')}:${String(((m % 60) + 60) % 60).padStart(2, '0')}`;
  await page.evaluate(([s, e]) => { document.querySelector('[data-pooja]').setAttribute('data-tz', 'Asia/Kolkata'); const a = document.querySelector('[data-slot="midday"]'); a.setAttribute('data-start', s); a.setAttribute('data-end', e); TT.poojaRefresh(); }, [hh(nowMin - 5), hh(nowMin + 5)]);
  if (nowMin >= 6 && nowMin <= 1380) check(`schedule: running pooja flagged "Now" ${tag}`, /Now/.test(await page.locator('[data-slot="midday"] .hm-slot-flag').textContent()) && (await page.locator('[data-slot="midday"].is-now').count()) === 1);
  // print
  await page.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed++; }; });
  await page.locator('[data-print]').click();
  check(`print button calls window.print ${tag}`, (await page.evaluate(() => window.__printed)) === 1);
  // sevas
  check(`sevas: enquiry links carry the topic ${tag}`, (await page.locator('.pt-ledger li a').evaluateAll((a) => a.map((x) => x.getAttribute('href')))).join() === 'contact.html?topic=seva-archana,contact.html?topic=seva-abhishekam,contact.html?topic=seva-alankaram,contact.html?topic=seva-deepam,contact.html?topic=seva-annadanam');
  // occasions
  const card = page.locator('[data-festival="ratha"]'), tg = card.locator('[data-fest-toggle]'), pn = page.locator('#festival-ratha-panel');
  await card.scrollIntoViewIfNeeded(); await tg.click();
  check(`occasions: details open/close ${tag}`, await pn.isVisible() && (await tg.locator('[data-label]').textContent()) === 'Hide details');
  await tg.click();
  check(`occasions: details collapse ${tag}`, !(await pn.isVisible()));
  await card.locator('[data-share]').click(); await page.waitForTimeout(150);
  check(`occasions: share copies a #festival-ratha deep link ${tag}`, /#festival-ratha$/.test(await page.evaluate(() => navigator.clipboard.readText().catch(() => ''))));
  await page.evaluate(() => { const c = document.querySelector('[data-festival="utsavam"]'); c.setAttribute('data-iso', '2031-03-14'); const b = document.createElement('button'); b.type = 'button'; b.className = 'btn btn-outline btn-sm'; b.textContent = 'Add to calendar'; b.setAttribute('data-ics', ''); c.querySelector('.pt-occ-actions').appendChild(b); });
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('[data-festival="utsavam"] [data-ics]').click()]);
  check(`occasions: calendar file downloads ${tag}`, /DTSTART;VALUE=DATE:20310314/.test(await fs.readFile(await dl.path(), 'utf8')));
  await page.goto(BASE + 'pooja-timings.html#festival-kolam'); await page.waitForTimeout(200);
  check(`occasions: #festival-kolam deep link opens details ${tag}`, await page.locator('#festival-kolam-panel').isVisible());
  check(`no errors ${tag}`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}
{
  const { ctx, page } = await open('pooja-timings.html', { width: 375, dir: 'rtl', reduced: true });
  await loadAll(page);
  await page.locator('#tab-morning').click(); await page.locator('#tab-morning').focus(); await page.keyboard.press('ArrowLeft');
  check('tabs in RTL: ArrowLeft moves to the next tab', await page.locator('#ritual-midday').isVisible());
  await ctx.close();
  const nojs = await browser.newContext({ javaScriptEnabled: false }); const np = await nojs.newPage(); await np.goto(BASE + 'pooja-timings.html');
  check('pooja without JavaScript: all 4 ritual panels visible, tab bar hidden', (await np.locator('[data-tabpanel]:visible').count()) === 4 && !(await np.locator('.pt-tablist').isVisible()));
  check('pooja without JavaScript: schedule, announcement and reveal content visible', (await np.locator('.pt-row .pt-time:visible').count()) === 4 && await np.locator('.pt-announce').isVisible() && await np.evaluate(() => [...document.querySelectorAll('main [data-reveal]')].every((e) => getComputedStyle(e).opacity === '1')));
  await nojs.close();
}

// 7 ─ Shared components + motion ────────────────────────────────────────
section('Shared header, mobile menu, scroll-to-top, reduced motion');
for (const [key, P] of Object.entries(PAGES)) {
  const { ctx, page } = await open(P.route, { width: 1280, reduced: true });
  await loadAll(page);
  await page.locator('[data-dropdown-trigger]').hover(); await page.waitForTimeout(250);
  check(`${key}: Home dropdown not opened by hover`, !(await page.locator('#home-menu').isVisible()));
  await page.locator('[data-dropdown-trigger]').click();
  check(`${key}: dropdown opens on click (Home 1 / Home 2)`, (await page.locator('#home-menu a').allTextContents()).map((s) => s.trim()).join('|') === 'Home 1|Home 2');
  await page.evaluate(() => window.scrollTo(0, 1500)); await page.waitForTimeout(150);
  await page.locator('[data-scroll-top]').click(); await page.waitForTimeout(150);
  check(`${key}: scroll-to-top works`, (await page.evaluate(() => scrollY)) === 0);
  check(`${key}: reduced motion shows all reveal content`, await page.evaluate(() => [...document.querySelectorAll('main [data-reveal]')].every((e) => getComputedStyle(e).opacity === '1')));
  await page.locator('.hm-zoom').first().hover();
  check(`${key}: reduced motion disables image zoom`, await page.evaluate(() => { const i = document.querySelector('.hm-zoom img'); const s = getComputedStyle(i); return s.transform === 'none'; }));
  await ctx.close();
  const m = await open(P.route, { width: 375, reduced: true });
  await m.page.locator('[data-menu-open]').click(); await m.page.waitForTimeout(150);
  check(`${key}: mobile menu opens with theme/direction/CTA inside; accordion collapsed`, await m.page.locator('#mobile-menu [data-theme-toggle]').isVisible() && await m.page.locator('#mobile-menu [data-dir-toggle]').isVisible() && await m.page.locator('#mobile-menu .btn').isVisible() && !(await m.page.locator('#m-home-menu').isVisible()));
  await m.page.keyboard.press('Escape'); await m.page.waitForTimeout(150);
  check(`${key}: Escape closes mobile menu; header hides theme/dir/CTA on phones`, !(await m.page.locator('#mobile-menu').isVisible()) && !(await m.page.locator('.site-header [data-theme-toggle]').isVisible()) && !(await m.page.locator('.site-header .btn').isVisible()));
  await m.ctx.close();
  const a = await open(P.route, { width: 1280, reduced: false });
  check(`${key}: below-the-fold content starts hidden, then reveals`, await a.page.evaluate(() => [...document.querySelectorAll('main [data-reveal]')].filter((e) => e.getBoundingClientRect().top > innerHeight + 50).every((e) => getComputedStyle(e).opacity === '0')));
  await a.page.evaluate(() => document.querySelector('main > section:nth-of-type(3)').scrollIntoView()); await a.page.waitForTimeout(1300);
  check(`${key}: reveal runs when scrolled into view`, await a.page.evaluate(() => getComputedStyle(document.querySelector('main > section:nth-of-type(3) [data-reveal]')).opacity === '1'));
  await a.ctx.close();
}

// 8 ─ axe ───────────────────────────────────────────────────────────────
section('axe-core (WCAG 2.2 A/AA + best practice)');
const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
let axeRuns = 0;
for (const [key, P] of Object.entries(PAGES)) for (const theme of ['light', 'dark']) for (const dir of ['ltr', 'rtl']) for (const width of [375, 768, 1280]) {
  const { ctx, page } = await open(P.route, { width, theme, dir, reduced: true });
  await loadAll(page);
  const run = async (label) => { const r = await new AxeBuilder({ page }).withTags(tags).analyze(); const v = r.violations.map((x) => `${x.id} (${x.nodes.length}): ${x.nodes[0]?.target.join(' ')}`); check(`axe ${key} ${label} @${width} ${theme}/${dir}`, v.length === 0, v.join(' ; ')); axeRuns++; };
  await run('default');
  await page.evaluate(() => { document.querySelectorAll('[data-fest-toggle],[data-slot-toggle]').forEach((b) => b.click()); document.querySelectorAll('[data-tab]').forEach((t, i, all) => i === all.length - 1 && t.click()); document.querySelectorAll('[data-disclosure-trigger]').forEach((b, i) => i === 1 && b.click()); });
  await run('states open');
  await ctx.close();
}
console.log(`  ${axeRuns} axe audits`);

// 9 ─ Screenshots ───────────────────────────────────────────────────────
section(`Screenshots → ${SHOTS}`);
for (const [key, P] of Object.entries(PAGES)) for (const [w, theme, dir] of [[320, 'light', 'ltr'], [375, 'dark', 'ltr'], [768, 'light', 'rtl'], [1024, 'light', 'ltr'], [1440, 'light', 'ltr'], [1440, 'dark', 'rtl'], [1920, 'dark', 'ltr']]) {
  const { ctx, page } = await open(P.route, { width: w, theme, dir, reduced: true });
  await loadAll(page);
  await page.addStyleTag({ content: '.site-header{position:static!important}.scroll-top,.skip-link{display:none!important}' });
  for (const id of P.ids) await page.locator('#' + id).screenshot({ path: path.join(SHOTS, `${key}-${w}-${theme}-${dir}-${id}.png`) });
  await ctx.close();
}

await browser.close(); server.close();
console.log(`\n══ About + Pooja Timings QA: ${results.pass} passed, ${results.fail.length} failed ══`);
if (results.fail.length) { results.fail.slice(0, 80).forEach((f) => console.log('  ✗ ' + f)); if (results.fail.length > 80) console.log(`  … and ${results.fail.length - 80} more`); process.exit(1); }
