/**
 * Image coverage QA for Pooja Timings and Donations.   npm run build && npm run qa:visuals
 * Every section has a meaningful loaded image; no repeats (by file content); sensible crops;
 * no credits; page weight; responsive across widths; light/dark and LTR/RTL.
 */
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { startServer } from './serve.mjs';

const PAGES = {
  pooja: { route: 'pooja-timings.html', ids: ['top', 'schedule', 'rituals', 'sevas', 'occasions', 'visit'] },
  donations: { route: 'donations.html', ids: ['top', 'why', 'purposes', 'ways', 'info', 'visit'] },
};
const results = { pass: 0, fail: [] };
const check = (n, ok, info = '') => (ok ? results.pass++ : results.fail.push(`${n}${info ? ` — ${info}` : ''}`));
const server = await startServer(0);
const BASE = `http://localhost:${server.address().port}/`;
const browser = await chromium.launch();

async function open(route, { width, theme = 'light', dir = 'ltr' }) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
  await ctx.addInitScript(([t, d]) => { try { localStorage.setItem('tt-theme', t); localStorage.setItem('tt-dir', d); } catch (e) {} }, [theme, dir]);
  const page = await ctx.newPage();
  const bytes = []; const errors = [];
  page.on('response', async (r) => { if (/\.(jpg|jpeg|png|webp)$/i.test(r.url())) { const b = await r.body().catch(() => null); if (b) bytes.push([r.url(), b.length]); } if (r.status() >= 400) errors.push(r.status() + ' ' + r.url()); });
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(BASE + route, { waitUntil: 'load' });
  return { ctx, page, bytes, errors };
}
async function scrollAll(page) {
  const H = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < H; y += 400) { await page.evaluate((v) => window.scrollTo(0, v), y); await page.waitForTimeout(60); }
  await page.waitForFunction(() => [...document.images].every((i) => i.complete || !i.getClientRects().length));
  await page.waitForTimeout(150);
}
const md5 = async (f) => crypto.createHash('md5').update(await fs.readFile(f)).digest('hex');

console.log('\n▸ Section-wise image coverage');
const fileHashes = new Map(); // hash → [page:section]
const coverage = {};
for (const [key, P] of Object.entries(PAGES)) {
  const { ctx, page, errors } = await open(P.route, { width: 1440 });
  await scrollAll(page);
  const per = await page.evaluate((ids) => ids.map((id) => {
    const s = document.getElementById(id);
    const imgs = [...s.querySelectorAll('img')];
    return { id, imgs: imgs.map((i) => ({ src: i.getAttribute('src'), alt: i.getAttribute('alt') || '', hidden: !i.getClientRects().length, w: i.naturalWidth, h: i.naturalHeight, ok: i.complete && i.naturalWidth > 0 })) };
  }), P.ids);
  coverage[key] = per.map((s) => `${s.id}:${s.imgs.length}`).join('  ');
  for (const s of per) {
    check(`${key} #${s.id}: has at least one image`, s.imgs.length >= 1);
    check(`${key} #${s.id}: every rendered image is loaded and has descriptive alt text`, s.imgs.filter((i) => !i.hidden).every((i) => i.ok && i.alt.length > 15), s.imgs.map((i) => i.alt.length).join());
    for (const i of s.imgs) { const h = await md5('dist/' + i.src.split('?')[0]); fileHashes.set(h, [...(fileHashes.get(h) || []), `${key}#${s.id}`]); }
  }
  check(`${key}: hero has a photographic composition (≥1 image in the hero)`, per[0].imgs.length >= 1);
  check(`${key}: no console/network errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}
const dup = [...fileHashes.values()].filter((v) => v.length > 1);
check('no photograph repeats anywhere on the two pages (compared by file content)', dup.length === 0, JSON.stringify(dup));
const total = fileHashes.size;
for (const [k, v] of Object.entries(coverage)) console.log(`  ${k}: ${v}`);
console.log(`  ${total} different photographs across the two pages`);

console.log('\n▸ Rituals tabs: each part of the day has its own photograph');
{
  const { ctx, page } = await open(PAGES.pooja.route, { width: 1280 });
  const seen = new Set();
  for (const id of ['morning', 'midday', 'evening', 'night']) {
    await page.locator('#tab-' + id).click();
    await page.waitForFunction((i) => { const im = document.querySelector(`#ritual-${i} img`); return im && im.complete && im.naturalWidth > 0; }, id, { timeout: 8000 }).catch(() => {});
    const src = await page.locator(`#ritual-${id} img`).evaluate((i) => ({ src: i.currentSrc, ok: i.complete && i.naturalWidth > 0, alt: i.alt }));
    check(`ritual tab "${id}": photograph loads when the tab opens`, src.ok && src.alt.length > 15, src.src);
    seen.add(src.src.replace(/-\d+\.jpg.*/, ''));
  }
  check('ritual tabs: four different photographs', seen.size === 4);
  await ctx.close();
}

console.log('\n▸ Responsive crops, alignment and page weight');
for (const [key, P] of Object.entries(PAGES)) for (const width of [320, 375, 768, 1024, 1280, 1440, 1920]) for (const [theme, dir] of [['light', 'ltr'], ['dark', 'rtl']]) {
  const { ctx, page, bytes } = await open(P.route, { width, theme, dir });
  await scrollAll(page);
  const m = await page.evaluate(() => {
    const out = { stretched: [], tooCropped: [], tiny: [], overflow: document.documentElement.scrollWidth > innerWidth, outside: [] };
    document.querySelectorAll('main img').forEach((img) => {
      if (!img.getClientRects().length) return;
      const r = img.getBoundingClientRect(); const cs = getComputedStyle(img);
      const nw = img.naturalWidth, nh = img.naturalHeight;
      if (cs.objectFit !== 'cover') { if (Math.abs(r.width / r.height - nw / nh) > 0.03) out.stretched.push(img.alt.slice(0, 30)); }
      const scale = Math.max(r.width / nw, r.height / nh);
      const frac = (r.width * r.height) / (nw * scale * nh * scale);
      if (frac < 0.28) out.tooCropped.push(`${img.alt.slice(0, 30)} ${Math.round(frac * 100)}%`);
      if (r.width < 90 || r.height < 60) out.tiny.push(img.alt.slice(0, 30));
      const c = img.closest('.container-temple'); if (c) { const cr = c.getBoundingClientRect(); const pad = parseFloat(getComputedStyle(c).paddingLeft); const f = img.closest('figure') || img; const fr = f.getBoundingClientRect(); if (!f.closest('.pt-sevas-media,.dn-triptych,.pt-dial') && (fr.left < cr.left + pad - 1.5 || fr.right > cr.right - pad + 1.5)) out.outside.push(img.alt.slice(0, 30)); }
    });
    return out;
  });
  const tag = `${key} @${width} ${theme}/${dir}`;
  check(`no horizontal overflow ${tag}`, !m.overflow);
  check(`no stretched or distorted images ${tag}`, m.stretched.length === 0, m.stretched.join('; '));
  check(`no extreme crops (> 72% of the photo cut away) ${tag}`, m.tooCropped.length === 0, m.tooCropped.join('; '));
  check(`no images smaller than 90×60 ${tag}`, m.tiny.length === 0, m.tiny.join('; '));
  check(`images stay inside the shared container ${tag}`, m.outside.length === 0, m.outside.join('; '));
  if (theme === 'light') {
    const kb = bytes.reduce((a, [, n]) => a + n, 0) / 1024;
    const biggest = Math.max(...bytes.map(([, n]) => n)) / 1024;
    check(`largest single image served ≤ 1.3 MB ${tag}`, biggest <= 1300, `${Math.round(biggest)} KB`);
    if (width === 375 || width === 1440) console.log(`  ${key} @${width}: ${bytes.length} image requests, ${(kb / 1024).toFixed(1)} MB total`);
    check(`page image weight ≤ 12 MB ${tag}`, kb <= 12 * 1024, `${Math.round(kb)} KB`);
  }
  await ctx.close();
}

console.log('\n▸ No credits / sources / paths in the UI');
for (const [key, P] of Object.entries(PAGES)) {
  const { ctx, page } = await open(P.route, { width: 1280 });
  const t = await page.evaluate(() => document.body.innerText + ' ' + [...document.querySelectorAll('[alt],[title],[aria-label]')].map((e) => [e.alt, e.title, e.getAttribute('aria-label')].filter(Boolean).join(' ')).join(' '));
  check(`${key}: no credits, source URLs, file paths or captions`, !/(photo|image|picture)\s*(by|credit|courtesy|source)|©\s*[A-Z][a-z]+\s+[A-Z]|wikimedia|commons\.|unsplash|pexels|flickr|cc0|public domain|assets\/img|\.jpg/i.test(t) && (await page.locator('main figcaption').count()) === 0);
  check(`${key}: image alt texts claim nothing about services the temple has not confirmed`, !/(this temple (offers|serves|runs|performs)|our (kitchen|annadanam|priests))/i.test(t));
  await ctx.close();
}

await browser.close(); server.close();
console.log(`\n══ Visual coverage QA: ${results.pass} passed, ${results.fail.length} failed ══`);
if (results.fail.length) { results.fail.slice(0, 60).forEach((f) => console.log('  ✗ ' + f)); if (results.fail.length > 60) console.log(`  … and ${results.fail.length - 60} more`); process.exit(1); }
