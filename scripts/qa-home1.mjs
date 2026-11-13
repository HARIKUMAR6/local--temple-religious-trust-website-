/**
 * Focused Home 1 QA (Playwright + axe-core).
 *   npm run build && npm run qa:home1
 * Covers: structure, photographs, responsive layout 320–1920, hero height system,
 * mobile CTA alignment, interactions, keyboard, reduced motion, text contrast over
 * photographs, axe accessibility, screenshots (SHOTS_DIR).
 */
import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { startServer } from './serve.mjs';

const WIDTHS = [320, 360, 375, 414, 640, 768, 1024, 1280, 1440, 1920];
const SHOTS = path.resolve(process.env.SHOTS_DIR || 'qa-screenshots/home1');
const results = { pass: 0, fail: [] };
const check = (name, ok, info = '') => {
  if (ok) results.pass++;
  else results.fail.push(`${name}${info ? ` — ${info}` : ''}`);
};
const section = (t) => console.log(`\n▸ ${t}`);

const server = await startServer(0);
const BASE = `http://localhost:${server.address().port}/`;
const browser = await chromium.launch();
await fs.mkdir(SHOTS, { recursive: true });

async function open({ width, height = 900, theme = 'light', dir = 'ltr', reduced = false, perms = [] }) {
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  if (perms.length) await ctx.grantPermissions(perms);
  await ctx.addInitScript(([t, d]) => {
    if (!sessionStorage.getItem('qa-seeded')) {
      localStorage.setItem('tt-theme', t);
      localStorage.setItem('tt-dir', d);
      sessionStorage.setItem('qa-seeded', '1');
    }
  }, [theme, dir]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));
  await page.goto(BASE + 'index.html', { waitUntil: 'load' });
  return { ctx, page, errors };
}

/** Scroll the whole page so lazy images load and reveals fire, then return to top */
async function loadAll(page) {
  const H = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < H; y += 450) {
    await page.evaluate((v) => window.scrollTo(0, v), y);
    await page.waitForTimeout(60);
  }
  await page.waitForFunction(() => [...document.images].every((i) => i.complete));
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
}

// 1 ─ Structure & content rules ─────────────────────────────────────────
section('Structure, photographs and content rules');
{
  const { ctx, page, errors } = await open({ width: 1440 });
  await loadAll(page);
  const s = await page.evaluate(() => {
    const main = document.querySelector('main');
    const secs = [...main.querySelectorAll(':scope > section')];
    const imgs = [...main.querySelectorAll('img')];
    return {
      mainSections: secs.length,
      allSections: main.querySelectorAll('section').length,
      ids: secs.map((x) => x.id),
      h1: main.querySelectorAll('h1').length,
      h1Text: main.querySelector('h1')?.textContent,
      imgCount: imgs.length,
      broken: imgs.filter((i) => !i.naturalWidth).map((i) => i.currentSrc),
      noAlt: imgs.filter((i) => !i.getAttribute('alt')).length,
      bases: imgs.map((i) => (i.currentSrc || i.src).split('/').pop().replace(/-\d+\.jpg.*$/, '')),
      text: main.innerText,
      figcaptions: [...main.querySelectorAll('figcaption')].map((f) => f.textContent.trim()),
      headingOrder: [...main.querySelectorAll('h1,h2,h3')].map((h) => h.tagName),
      thirdPartyImgs: imgs.filter((i) => !i.src.startsWith(location.origin)).length,
      hasPhaseNote: !!main.querySelector('.phase-note'),
    };
  });
  check('exactly 7 sections in <main>', s.mainSections === 7, `got ${s.mainSections}`);
  check('no nested/extra <section> elements', s.allSections === 7, `got ${s.allSections}`);
  check('section order hero→about→pooja→festivals→sevas→support→visit', s.ids.join() === 'top,about,pooja,festivals,sevas,support,visit', s.ids.join());
  check('exactly one h1 (temple name from config)', s.h1 === 1 && s.h1Text === 'Temple Name', s.h1Text);
  check('heading order is h1 → h2 → h3 (no skips)', !s.headingOrder.some((h, i) => i && +h[1] - +s.headingOrder[i - 1][1] > 1), s.headingOrder.join('>'));
  check('every <img> loaded', s.broken.length === 0, s.broken.join(', '));
  check('every <img> has alt text', s.noAlt === 0);
  check('all images self-hosted (no hotlinks)', s.thirdPartyImgs === 0);
  check('no repeated photograph (unique per <img>)', new Set(s.bases).size === s.bases.length, s.bases.join(', '));
  // byte-level duplicates across the files that are used
  const dir = path.resolve('dist/assets/img/home');
  const used = [...new Set(s.bases)];
  const hashes = new Map();
  for (const b of used) {
    const files = (await fs.readdir(dir)).filter((f) => f.startsWith(b + '-')).sort();
    const largest = files[files.length - 1];
    const h = crypto.createHash('md5').update(await fs.readFile(path.join(dir, largest))).digest('hex');
    hashes.set(h, [...(hashes.get(h) || []), b]);
  }
  check('no two photo slots share the same image file', [...hashes.values()].every((v) => v.length === 1), JSON.stringify([...hashes.values()]));
  check(`${s.imgCount} photographs present (hero, about, pooja, 3 festivals, seva, donate, cta)`, s.imgCount === 9, `got ${s.imgCount}`);
  check('no visible image credit / source text', !/(photo|image|picture)\s*(by|credit|courtesy|source)|©\s*[A-Z][a-z]+\s+[A-Z]|wikimedia|commons|unsplash|pexels|flickr|cc0|public domain/i.test(s.text), '');
  check('figcaptions contain no credits', s.figcaptions.every((c) => !/(by|credit|source|©)/i.test(c)), s.figcaptions.join('|'));
  check('no Phase-1 placeholder note left on Home 1', !s.hasPhaseNote);
  check('Home 1: no invented times/dates (all "to be announced")', (s.text.match(/to be announced/gi) || []).length >= 7 && !/\b\d{1,2}[:.]\d{2}\s?(am|pm)\b/i.test(s.text));
  check('Home 1: no currency amounts / payment credentials', !/(₹|rs\.?\s?\d|\bupi\b|ifsc|account\s*(no|number)|\bpaytm\b)/i.test(s.text));
  check('no console/network errors on load', errors.length === 0, errors.join(' | '));
  const nav = await page.evaluate(() => ({
    current: document.querySelector('.nav-desktop [aria-current="page"]')?.textContent.trim(),
    dashboard: /dashboard/i.test(document.body.innerHTML),
  }));
  check('nav marks Home 1 as current', nav.current === 'Home 1', nav.current);
  check('no Dashboard anywhere', !nav.dashboard);

  // Links
  const links = await page.$$eval('main a[href]', (as) => as.map((a) => a.getAttribute('href')));
  const local = [...new Set(links.filter((h) => !/^(tel:|mailto:|#)/.test(h)).map((h) => h.split('?')[0].split('#')[0]))];
  for (const l of local) {
    const r = await fetch(BASE + l);
    check(`CTA destination resolves: ${l}`, r.status === 200, `status ${r.status}`);
  }
  check('tel: and mailto: links are well-formed', links.filter((h) => /^(tel:|mailto:)/.test(h)).every((h) => /^tel:\+?\d+$|^mailto:[^@\s]+@[^@\s]+/.test(h)));
  console.log(`  ${s.imgCount} images, ${links.length} links checked`);
  await ctx.close();
}

// 2 ─ Responsive layout matrix ──────────────────────────────────────────
section(`Layout: ${WIDTHS.length} widths × light/dark × LTR/RTL`);
let renders = 0;
for (const width of WIDTHS) {
  for (const theme of ['light', 'dark']) {
    for (const dir of ['ltr', 'rtl']) {
      const { ctx, page, errors } = await open({ width, theme, dir, reduced: true });
      await loadAll(page);
      const m = await page.evaluate(() => {
        const de = document.documentElement;
        const bad = [];
        const skip = '.hero-media, .hm-cta-media, .sr-only, [hidden], svg[width="0"]';
        document.querySelectorAll('main *').forEach((el) => {
          if (el.closest(skip) || getComputedStyle(el).position === 'fixed') return;
          const c = el.parentElement && el.parentElement.closest('.container-temple');
          if (!c) return;
          const cs = getComputedStyle(c);
          const cr = c.getBoundingClientRect();
          const L = cr.left + parseFloat(cs.paddingLeft) - 1;
          const R = cr.right - parseFloat(cs.paddingRight) + 1;
          const r = el.getBoundingClientRect();
          if (!r.width) return;
          if (r.left < L || r.right > R) bad.push(`${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 2).join('.')} [${Math.round(r.left)}–${Math.round(r.right)} vs ${Math.round(L)}–${Math.round(R)}]`);
        });
        // text clipped inside its own box (horizontal)
        const clipped = [...document.querySelectorAll('main h1,main h2,main h3,main p,main a,main button,main span')]
          .filter((el) => !el.closest(skip) && el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflow !== 'visible' && getComputedStyle(el).display !== 'inline')
          .map((el) => el.className || el.tagName).slice(0, 4);
        return { scrollW: de.scrollWidth, innerW: innerWidth, bad: bad.slice(0, 4), clipped, dir: de.dir, theme: de.dataset.theme };
      });
      const tag = `@${width} ${theme}/${dir}`;
      check(`no horizontal overflow ${tag}`, m.scrollW <= m.innerW, `${m.scrollW}>${m.innerW}`);
      check(`all content inside container ${tag}`, m.bad.length === 0, m.bad.join('; '));
      check(`no clipped text ${tag}`, m.clipped.length === 0, m.clipped.join(','));
      check(`theme+dir applied ${tag}`, m.dir === dir && m.theme === theme);
      check(`no console/network errors ${tag}`, errors.length === 0, errors.join(' | '));
      renders++;
      await ctx.close();
    }
  }
}
console.log(`  ${renders} renders checked`);

// 3 ─ Shared hero height system ─────────────────────────────────────────
section('Hero height system');
for (const [w, h] of [[1024, 700], [1280, 720], [1440, 900], [1920, 1080], [2560, 1440], [1024, 500]]) {
  const { ctx, page } = await open({ width: w, height: h, reduced: true });
  const got = await page.evaluate(() => {
    const px = (v) => parseFloat(getComputedStyle(document.documentElement).fontSize) * v;
    const hh = document.querySelector('.site-header').getBoundingClientRect().height; // sticky header incl. colour band
    return { hero: document.querySelector('#top').getBoundingClientRect().height, header: hh, min: px(34), max: px(56) };
  });
  const want = Math.min(got.max, Math.max(got.min, h - got.header));
  check(`desktop hero = clamp(34rem, 100svh − header, 56rem) @${w}×${h}`, Math.abs(got.hero - want) <= Math.max(1, want * 0.002) || got.hero > want && got.hero < want + 140, `got ${Math.round(got.hero)}, want ${Math.round(want)} (hero may exceed only when content is taller)`);
  check(`hero never exceeds first screen + facts bar @${w}×${h}`, got.hero <= Math.max(got.max, want) + 140);
  await ctx.close();
}
for (const [w, h] of [[320, 568], [375, 667], [414, 896], [768, 1024]]) {
  const { ctx, page } = await open({ width: w, height: h, reduced: true });
  const got = await page.evaluate(() => ({ hero: document.querySelector('#top').getBoundingClientRect().height, min: parseFloat(getComputedStyle(document.documentElement).fontSize) * 34 }));
  check(`phone/tablet hero ≥ 34rem floor @${w}×${h}`, got.hero >= got.min - 1, `${Math.round(got.hero)} < ${got.min}`);
  await ctx.close();
}
{
  // Home 2 and inner pages are untouched: hero-shell must not leak into them
  const { ctx, page } = await open({ width: 1280 });
  await page.goto(BASE + 'home-2.html');
  check('Home 2 is a separate page and never uses Home 1 hero classes (shell shared only)', await page.locator('.hm-hero, .hm-facts').count() === 0 && await page.locator('main > section').count() === 7);
  await ctx.close();
}

// 4 ─ Mobile CTA alignment ──────────────────────────────────────────────
section('Mobile CTA buttons: centred and consistently sized');
for (const width of [320, 360, 375, 414, 600, 700]) {
  for (const dir of ['ltr', 'rtl']) {
    const { ctx, page } = await open({ width, dir, reduced: true });
    await loadAll(page);
    // hero buttons are start-aligned only from 768px (48rem); the support banner row from 1024px
    const rows = await page.evaluate(() => [...document.querySelectorAll('.hm-cta-row')].map((row) => {
      const b = [...row.querySelectorAll('.btn')].map((x) => x.getBoundingClientRect());
      return { cls: row.closest('section').id, widths: b.map((r) => Math.round(r.width)), heights: b.map((r) => Math.round(r.height)), centres: b.map((r) => Math.round(r.left + r.width / 2)), vw: document.documentElement.clientWidth };
    }));
    for (const r of rows) {
      const tag = `#${r.cls} @${width} ${dir}`;
      check(`CTA buttons equal width ${tag}`, new Set(r.widths).size === 1, r.widths.join(','));
      check(`CTA buttons equal height ${tag}`, new Set(r.heights).size === 1, r.heights.join(','));
      if (width < 640) check(`CTA buttons horizontally centred ${tag}`, r.centres.every((c) => Math.abs(c - r.vw / 2) <= 2), `${r.centres} vs ${r.vw / 2}`);
      else check(`CTA button group centred as a row ${tag}`, Math.abs((Math.min(...r.centres) + Math.max(...r.centres)) / 2 - r.vw / 2) <= 2, `${r.centres} vs ${r.vw / 2}`);
      check(`CTA buttons ≥44px tall ${tag}`, r.heights.every((h) => h >= 44));
    }
    // hero copy is centred on phones
    const hero = await page.evaluate(() => ['.hm-hero-eyebrow', '.hm-hero h1', '.hm-hero-lead'].map((s) => {
      const el = document.querySelector(s); const r = el.getBoundingClientRect(); const range = document.createRange(); range.selectNodeContents(el);
      const t = range.getBoundingClientRect(); return Math.round((t.left + t.right) / 2 - document.documentElement.clientWidth / 2);
    }));
    check(`hero text centred on phones @${width} ${dir}`, hero.every((d) => Math.abs(d) <= 3), hero.join(','));
    await ctx.close();
  }
}
{
  // Desktop: hero CTAs start-aligned with the copy
  for (const dir of ['ltr', 'rtl']) {
    const { ctx, page } = await open({ width: 1280, dir, reduced: true });
    const d = await page.evaluate(() => {
      const h1 = document.querySelector('.hm-hero h1').getBoundingClientRect();
      const btns = [...document.querySelectorAll('.hm-hero .btn')].map((b) => b.getBoundingClientRect());
      const rtl = document.dir === 'rtl';
      return { edgeH1: rtl ? h1.right : h1.left, edgeBtn: rtl ? Math.max(...btns.map((b) => b.right)) : Math.min(...btns.map((b) => b.left)) };
    });
    check(`desktop hero buttons align to text start (${dir})`, Math.abs(d.edgeH1 - d.edgeBtn) <= 2, JSON.stringify(d));
    await ctx.close();
  }
}

// 5 ─ Interactions ──────────────────────────────────────────────────────
section('Interactions: festivals, pooja schedule, sevas');
for (const width of [375, 1280]) {
  const { ctx, page, errors } = await open({ width, reduced: true, perms: ['clipboard-read', 'clipboard-write'] });
  await loadAll(page);
  const tag = `@${width}`;

  // Festival cards
  const card = page.locator('[data-festival="ratha"]');
  const toggle = card.locator('[data-fest-toggle]');
  const panel = page.locator('#festival-ratha-panel');
  await card.scrollIntoViewIfNeeded();
  check(`festival details closed by default ${tag}`, !(await panel.isVisible()) && (await toggle.getAttribute('aria-expanded')) === 'false');
  await toggle.click();
  check(`festival details open on click ${tag}`, (await panel.isVisible()) && (await toggle.getAttribute('aria-expanded')) === 'true');
  check(`festival button label → "Hide details" ${tag}`, (await toggle.locator('[data-label]').textContent()) === 'Hide details');
  check(`festival panel shows about + participation ${tag}`, /About this festival/.test(await panel.innerText()) && /How to take part/.test(await panel.innerText()));
  await toggle.click();
  check(`festival details close again ${tag}`, !(await panel.isVisible()));
  await card.locator('[data-share]').click();
  await page.waitForTimeout(150);
  check(`share → link copied status ${tag}`, /copied|Copy this link/i.test(await card.locator('[data-status]').textContent()));
  const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
  check(`share copies a #festival-ratha deep link ${tag}`, /#festival-ratha$/.test(clip), clip);
  const enq = await card.locator('a:has-text("Enquire")').getAttribute('href');
  check(`festival Enquire → contact.html with topic ${tag}`, enq === 'contact.html?topic=festival-ratha', enq);
  check(`festival cards equal button sizes ${tag}`, await page.evaluate(() => [...document.querySelectorAll('.hm-fest-actions')].every((g) => { const h = [...g.children].map((b) => Math.round(b.getBoundingClientRect().height)); return new Set(h).size === 1; })));

  // Add-to-calendar (rendered only when a real ISO date is configured): inject one to test the handler
  await page.evaluate(() => {
    const c = document.querySelector('[data-festival="utsavam"]');
    c.setAttribute('data-iso', '2031-03-14');
    const b = document.createElement('button'); b.type = 'button'; b.setAttribute('data-ics', ''); b.textContent = 'Add to calendar';
    c.querySelector('.hm-fest-actions').appendChild(b);
  });
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('[data-festival="utsavam"] [data-ics]').click()]);
  const ics = await fs.readFile(await dl.path(), 'utf8');
  check(`add-to-calendar downloads a valid .ics ${tag}`, /BEGIN:VEVENT/.test(ics) && /DTSTART;VALUE=DATE:20310314/.test(ics) && /DTEND;VALUE=DATE:20310315/.test(ics) && dl.suggestedFilename() === 'utsavam.ics', dl.suggestedFilename());
  check(`default build shows no calendar button without a date ${tag}`, await page.locator('[data-festival="ratha"] [data-ics]').count() === 0);

  // Pooja schedule
  const slots = page.locator('[data-slot]');
  check(`4 pooja slots listed ${tag}`, (await slots.count()) === 4);
  check(`all slots say timing to be announced ${tag}`, (await page.locator('.hm-slot-time').allTextContents()).every((t) => /to be announced/i.test(t)));
  await page.locator('[data-filter="evening"]').click();
  check(`filter: only Evening shown ${tag}`, (await page.locator('[data-slot]:visible').count()) === 1 && (await page.locator('[data-slot="evening"]').isVisible()));
  check(`filter: chip aria-pressed + live status ${tag}`, (await page.locator('[data-filter="evening"]').getAttribute('aria-pressed')) === 'true' && /Showing 1 of 4/.test(await page.locator('[data-pooja-status]').textContent()));
  await page.locator('[data-filter="all"]').click();
  check(`filter: All restores 4 slots ${tag}`, (await page.locator('[data-slot]:visible').count()) === 4);
  const sb = page.locator('[data-slot="morning"] [data-slot-toggle]');
  await sb.click();
  check(`ritual note expands ${tag}`, await page.locator('#slot-panel-morning').isVisible() && (await sb.getAttribute('aria-expanded')) === 'true');
  await sb.click();
  check(`ritual note collapses ${tag}`, !(await page.locator('#slot-panel-morning').isVisible()));
  // Now/Next only with tz + times
  const nowMin = await page.evaluate(() => { const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()); return +p.find((x) => x.type === 'hour').value * 60 + +p.find((x) => x.type === 'minute').value; });
  check(`no Now/Next flag without configured times ${tag}`, await page.locator('.hm-slot-flag').count() === 0);
  const hhmm = (m) => `${String(Math.floor(((m % 1440) + 1440) % 1440 / 60)).padStart(2, '0')}:${String(((m % 60) + 60) % 60).padStart(2, '0')}`;
  await page.evaluate(([s, e, nextS, nextE]) => {
    document.querySelector('[data-pooja]').setAttribute('data-tz', 'Asia/Kolkata');
    const a = document.querySelector('[data-slot="midday"]'); a.setAttribute('data-start', s); a.setAttribute('data-end', e);
    const b = document.querySelector('[data-slot="night"]'); b.setAttribute('data-start', nextS); b.setAttribute('data-end', nextE);
    TT.poojaRefresh();
  }, [hhmm(nowMin - 5), hhmm(nowMin + 5), hhmm(nowMin + 60), hhmm(nowMin + 90)].map((x) => x));
  if (nowMin >= 6 && nowMin <= 1380) {
    check(`Now flag on the running pooja ${tag}`, /Now/.test(await page.locator('[data-slot="midday"] .hm-slot-flag').textContent()) && (await page.locator('[data-slot="midday"].is-now').count()) === 1);
  }

  // Sevas
  const radios = page.locator('input[name="seva"]');
  check(`5 sevas, first selected ${tag}`, (await radios.count()) === 5 && await radios.first().isChecked());
  await page.locator('label.hm-seva:has-text("Abhishekam")').click();
  check(`seva selection updates panel title ${tag}`, (await page.locator('[data-seva-selected]').textContent()) === 'Abhishekam');
  const mail = await page.locator('[data-enquiry-mail]').getAttribute('href');
  check(`seva email prefilled (subject + body) ${tag}`, /subject=Seva%20enquiry%3A%20Abhishekam/.test(mail) && /body=.*Abhishekam/.test(mail), mail);
  check(`seva online link carries topic ${tag}`, (await page.locator('[data-enquiry-online]').getAttribute('href')) === 'contact.html?topic=seva-abhishekam');
  check(`seva call link is tel: ${tag}`, /^tel:\+\d+$/.test(await page.locator('[data-enquiry-call]').getAttribute('href')));

  // Deep link opens the card
  await page.goto(BASE + 'index.html#festival-kolam');
  await page.waitForTimeout(200);
  check(`#festival-kolam deep link opens its details ${tag}`, await page.locator('#festival-kolam-panel').isVisible());
  check(`no console/network errors during interactions ${tag}`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// 6 ─ Keyboard ──────────────────────────────────────────────────────────
section('Keyboard accessibility');
{
  const { ctx, page } = await open({ width: 1280, reduced: true });
  await loadAll(page);
  const ring = async () => page.evaluate(() => { const s = getComputedStyle(document.activeElement); return s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2; });
  await page.locator('[data-filter="all"]').focus();
  await page.keyboard.press('Tab');
  check('Tab moves focus to the next filter chip, with a visible ring', (await page.evaluate(() => document.activeElement.getAttribute('data-filter'))) === 'morning' && await ring());
  await page.keyboard.press('Space');
  check('Space activates a filter chip', (await page.locator('[data-slot]:visible').count()) === 1);
  await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
  await page.keyboard.press('Tab'); // → midday? reset instead
  await page.locator('[data-filter="all"]').click();
  await page.locator('[data-slot="evening"] [data-slot-toggle]').focus();
  await page.keyboard.press('Enter');
  check('Enter expands a pooja note; ring visible', await page.locator('#slot-panel-evening').isVisible() && await ring());
  await page.locator('[data-festival="utsavam"] [data-fest-toggle]').focus();
  await page.keyboard.press('Enter');
  check('Enter expands festival details', await page.locator('#festival-utsavam-panel').isVisible());
  await page.keyboard.press('Space');
  check('Space collapses festival details', !(await page.locator('#festival-utsavam-panel').isVisible()));
  await page.locator('input[name="seva"]:checked').focus();
  await page.keyboard.press('ArrowDown');
  check('Arrow keys move through sevas', (await page.locator('[data-seva-selected]').textContent()) === 'Abhishekam');
  check('seva radio shows focus ring on its row', await page.evaluate(() => { const s = getComputedStyle(document.activeElement.closest('.hm-seva')); return s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2; }));
  // Tab order inside main reaches every interactive control, none with tabindex>0
  const bad = await page.evaluate(() => [...document.querySelectorAll('[tabindex]')].filter((e) => +e.getAttribute('tabindex') > 0).length);
  check('no positive tabindex values', bad === 0);
  // header, footer, mobile menu and scroll-top still work
  await page.evaluate(() => window.scrollTo(0, 1500));
  await page.waitForTimeout(150);
  check('scroll-to-top appears', await page.locator('[data-scroll-top]').evaluate((b) => b.classList.contains('is-visible')));
  await page.locator('[data-scroll-top]').click();
  await page.waitForTimeout(150);
  check('scroll-to-top returns to top', (await page.evaluate(() => scrollY)) === 0);
  await page.locator('[data-dropdown-trigger]').hover(); await page.waitForTimeout(250);
  check('Home dropdown does not open on hover', !(await page.locator('#home-menu').isVisible()));
  await page.locator('[data-dropdown-trigger]').click();
  check('Home dropdown opens on click (Home 1 / Home 2 only)', (await page.locator('#home-menu a').allTextContents()).map((s) => s.trim()).join('|') === 'Home 1|Home 2');
  await ctx.close();

  const m = await open({ width: 375, reduced: true });
  await m.page.locator('[data-menu-open]').click(); await m.page.waitForTimeout(150);
  check('mobile menu opens on Home 1', await m.page.locator('#mobile-menu').isVisible());
  check('mobile menu Home accordion collapsed', !(await m.page.locator('#m-home-menu').isVisible()));
  check('mobile menu holds theme, direction and CTA', await m.page.locator('#mobile-menu [data-theme-toggle]').isVisible() && await m.page.locator('#mobile-menu [data-dir-toggle]').isVisible() && await m.page.locator('#mobile-menu .btn').isVisible());
  await m.page.keyboard.press('Escape'); await m.page.waitForTimeout(150);
  check('Escape closes the mobile menu', !(await m.page.locator('#mobile-menu').isVisible()));
  check('header shows no theme/direction/CTA on phones', !(await m.page.locator('.site-header [data-theme-toggle]').isVisible()) && !(await m.page.locator('.site-header [data-dir-toggle]').isVisible()) && !(await m.page.locator('.site-header .btn').isVisible()));
  await m.ctx.close();
}

// 7 ─ Motion ────────────────────────────────────────────────────────────
section('Reveal animation and reduced motion');
{
  const a = await open({ width: 1280, reduced: false });
  const before = await a.page.evaluate(() => [...document.querySelectorAll('main [data-reveal]')].filter((e) => e.getBoundingClientRect().top > innerHeight + 50).every((e) => getComputedStyle(e).opacity === '0'));
  check('below-the-fold elements start hidden for reveal (motion allowed)', before);
  await a.page.evaluate(() => document.querySelector('#festivals').scrollIntoView());
  await a.page.waitForTimeout(1300);
  check('elements reveal once scrolled into view', await a.page.evaluate(() => getComputedStyle(document.querySelector('#festivals .hm-fest-grid li')).opacity === '1'));
  check('hero photo has the slow pan animation', await a.page.evaluate(() => getComputedStyle(document.querySelector('.hm-hero .hero-media img')).animationName !== 'none'));
  await a.ctx.close();
  const r = await open({ width: 1280, reduced: true });
  check('reduced motion: all reveal content visible at once', await r.page.evaluate(() => [...document.querySelectorAll('main [data-reveal]')].every((e) => getComputedStyle(e).opacity === '1')));
  check('reduced motion: hero pan animation off', await r.page.evaluate(() => getComputedStyle(document.querySelector('.hm-hero .hero-media img')).animationName === 'none'));
  await r.page.locator('.hm-zoom').first().hover();
  check('reduced motion: no image zoom on hover', await r.page.evaluate(() => getComputedStyle(document.querySelector('.hm-zoom img')).transform === 'none'));
  const nojs = await browser.newContext({ javaScriptEnabled: false });
  const np = await nojs.newPage();
  await np.goto(BASE + 'index.html');
  check('without JavaScript all content is visible (no hidden reveals)', await np.evaluate(() => [...document.querySelectorAll('main [data-reveal]')].every((e) => getComputedStyle(e).opacity === '1')));
  await nojs.close();
  await r.ctx.close();
}

// 8 ─ Text contrast over photographs (worst-case pixel) ──────────────────
section('Text contrast over photographs (hero + final CTA, worst case)');
const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
for (const width of [375, 768, 1024, 1280, 1920]) {
  for (const dir of ['ltr', 'rtl']) {
    const { ctx, page } = await open({ width, dir, reduced: true });
    await loadAll(page);
    await page.addStyleTag({ content: '.site-header,.scroll-top{visibility:hidden!important}' });
    const targets = await page.evaluate(() => {
      const sel = ['.hm-hero-eyebrow', '.hm-hero h1', '.hm-hero-lead', '.hm-cta .text-eyebrow-style', '.hm-cta h2', '.hm-cta-lead', '.hm-cta-contact span', '.hm-cta-contact a'];
      return sel.map((s) => {
        const el = document.querySelector(s); const cs = getComputedStyle(el);
        const fs = parseFloat(cs.fontSize); const bold = +cs.fontWeight >= 700;
        const c = cs.color.match(/\d+(\.\d+)?/g).map(Number);
        return { s, color: c.slice(0, 3), large: fs >= 24 || (fs >= 18.66 && bold) };
      });
    });
    await page.addStyleTag({ content: '.hm-hero *:not(.hero-media):not(.hero-media *):not(.btn):not(.btn *):not(.hm-facts):not(.hm-facts *), .hm-cta *:not(.hm-cta-media):not(.hm-cta-media *):not(.btn):not(.btn *) { color: transparent !important; text-shadow: none !important; } .hm-hero-eyebrow::before,.hm-hero-eyebrow::after,.ornament::before,.ornament::after{opacity:0!important} .ornament .icon{opacity:0!important}' });
    for (const t of targets) {
      const loc = page.locator(t.s).first();
      await loc.evaluate((e) => e.scrollIntoView({ block: 'center' })); // keep the clip fully inside the viewport
      await page.waitForTimeout(30);
      const buf = await loc.screenshot();
      const px = await page.evaluate(async (b64) => {
        const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
        const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
        const cx = cv.getContext('2d'); cx.drawImage(img, 0, 0); const d = cx.getImageData(0, 0, cv.width, cv.height).data;
        const out = []; for (let i = 0; i < d.length; i += 4) out.push([d[i], d[i + 1], d[i + 2]]); return out;
      }, buf.toString('base64'));
      const ls = px.map(lum).sort((a, b) => a - b);
      const p995 = ls[Math.floor(ls.length * 0.995)];
      const maxL = ls[ls.length - 1];
      const tl = lum(t.color);
      const need = t.large ? 3 : 4.5;
      const crMax = (tl + 0.05) / (maxL + 0.05);
      if (crMax < need) await fs.writeFile(path.join(SHOTS, `contrast-fail-${t.s.replace(/[^a-z0-9]+/gi, '_')}-${width}-${dir}.png`), buf);
      check(`contrast ${t.s} @${width} ${dir} ≥ ${need}:1 on brightest pixel`, crMax >= need, `${crMax.toFixed(2)}:1 (text rgb ${t.color}, text L ${tl.toFixed(3)}, brightest bg L ${maxL.toFixed(3)}, p99.5 ${p995.toFixed(3)})`);
    }
    await ctx.close();
  }
}

// 9 ─ axe ───────────────────────────────────────────────────────────────
section('axe-core (WCAG 2.2 A/AA + best practice)');
const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
let axeRuns = 0;
for (const theme of ['light', 'dark']) {
  for (const dir of ['ltr', 'rtl']) {
    for (const width of [375, 768, 1280]) {
      const { ctx, page } = await open({ width, theme, dir, reduced: true });
      await loadAll(page);
      const run = async (label) => {
        const res = await new AxeBuilder({ page }).withTags(tags).analyze();
        const v = res.violations.map((x) => `${x.id} (${x.nodes.length}): ${x.nodes[0]?.target.join(' ')}`);
        check(`axe ${label} @${width} ${theme}/${dir}`, v.length === 0, v.join(' ; '));
        axeRuns++;
      };
      await run('Home 1 default');
      // expanded states
      await page.evaluate(() => { document.querySelectorAll('[data-fest-toggle],[data-slot-toggle]').forEach((b) => b.click()); });
      await run('Home 1 all panels expanded');
      await ctx.close();
    }
  }
}
console.log(`  ${axeRuns} axe audits`);

// 10 ─ Screenshots ──────────────────────────────────────────────────────
section(`Screenshots → ${SHOTS}`);
for (const [w, theme, dir] of [[320, 'light', 'ltr'], [375, 'dark', 'ltr'], [768, 'light', 'rtl'], [1024, 'light', 'ltr'], [1440, 'light', 'ltr'], [1440, 'dark', 'rtl'], [1920, 'dark', 'ltr']]) {
  const { ctx, page } = await open({ width: w, theme, dir, reduced: true });
  await loadAll(page);
  for (const id of ['top', 'about', 'pooja', 'festivals', 'sevas', 'support', 'visit']) {
    await page.addStyleTag({ content: '.site-header{position:static!important}.scroll-top{display:none!important}.skip-link{display:none!important}' });
    await page.locator('#' + id).screenshot({ path: path.join(SHOTS, `${w}-${theme}-${dir}-${id}.png`) });
  }
  await ctx.close();
}

await browser.close();
server.close();
console.log(`\n══ Home 1 QA: ${results.pass} passed, ${results.fail.length} failed ══`);
if (results.fail.length) {
  results.fail.slice(0, 80).forEach((f) => console.log('  ✗ ' + f));
  if (results.fail.length > 80) console.log(`  … and ${results.fail.length - 80} more`);
  process.exit(1);
}
