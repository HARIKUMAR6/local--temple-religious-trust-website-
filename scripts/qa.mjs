/**
 * Phase 1 QA run (Playwright + axe-core).
 *   npm run build && npm run qa
 * Optional: SHOTS_DIR=<folder> to save screenshots (default: ./qa-screenshots)
 */
import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { startServer } from './serve.mjs';

const ROUTES = ['index.html', 'home-2.html', 'about.html', 'pooja-timings.html', 'donations.html', 'contact.html'];
const WIDTHS = [320, 360, 375, 414, 768, 1024, 1280, 1440, 1920];
const THEMES = ['light', 'dark'];
const DIRS = ['ltr', 'rtl'];
const SHOTS = path.resolve(process.env.SHOTS_DIR || 'qa-screenshots');

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

async function newPage({ width, height = 900, theme = 'light', dir = 'ltr', reduced = false }) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    reducedMotion: reduced ? 'reduce' : 'no-preference',
  });
  await ctx.addInitScript(
    ([t, d]) => {
      try {
        if (!sessionStorage.getItem('qa-seeded')) {
          localStorage.setItem('tt-theme', t);
          localStorage.setItem('tt-dir', d);
          sessionStorage.setItem('qa-seeded', '1');
        }
      } catch (e) {
        /* the aborted third-party map frame has no storage */
      }
    },
    [theme, dir],
  );
  const page = await ctx.newPage();
  // The Contact page embeds a live third-party map; it is covered by qa-donate-contact.mjs, so skip it here for speed
  await page.route(/google\.com\/maps/, (r) => r.abort());
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && !/ERR_FAILED|ERR_BLOCKED/.test(m.text()) && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));
  return { ctx, page, errors };
}

// 1 ─ Routes & internal links ───────────────────────────────────────────
section('Routes and internal links');
const internal = new Set();
for (const r of ROUTES) {
  const res = await fetch(BASE + r);
  check(`route ${r} returns 200`, res.status === 200, `got ${res.status}`);
  const html = await res.text();
  for (const m of html.matchAll(/(?:href|src)="([^"#:]+?)"/g)) internal.add(m[1]);
  check(`${r} has no Dashboard link`, !/dashboard/i.test(html));
}
for (const url of internal) {
  const res = await fetch(BASE + url);
  check(`internal asset ${url}`, res.status === 200, `got ${res.status}`);
}
console.log(`  ${ROUTES.length} routes, ${internal.size} unique internal URLs checked`);

// 2 ─ Responsive matrix ─────────────────────────────────────────────────
section(`Layout matrix: ${ROUTES.length} routes × ${WIDTHS.length} widths × themes × directions`);
let matrixRuns = 0;
for (const width of WIDTHS) {
  for (const theme of THEMES) {
    for (const dir of DIRS) {
      const { ctx, page, errors } = await newPage({ width, theme, dir });
      for (const r of ROUTES) {
        errors.length = 0;
        await page.goto(BASE + r, { waitUntil: 'load' });
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(60);
        const m = await page.evaluate(() => {
          const de = document.documentElement;
          const offenders = [];
          for (const el of document.querySelectorAll('body *')) {
            const cs = getComputedStyle(el);
            if (cs.position === 'fixed' || el.closest('[hidden]') || el.closest('svg[width="0"]')) continue;
            const b = el.getBoundingClientRect();
            if (b.width && (b.right > innerWidth + 1 || b.left < -1)) {
              // ignore if an ancestor clips it
              let p = el.parentElement, clipped = false;
              while (p && p !== document.body) {
                const o = getComputedStyle(p).overflowX;
                if (o === 'hidden' || o === 'clip') { clipped = true; break; }
                p = p.parentElement;
              }
              if (!clipped) offenders.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`);
            }
          }
          const c = document.querySelector('.site-header .container-temple').getBoundingClientRect();
          return {
            theme: de.dataset.theme,
            dir: de.dir,
            scrollW: de.scrollWidth,
            innerW: innerWidth,
            offenders: offenders.slice(0, 5),
            centred: Math.abs(c.left - (innerWidth - c.right)) <= 1,
          };
        });
        const tag = `${r} @${width} ${theme}/${dir}`;
        check(`theme applied ${tag}`, m.theme === theme);
        check(`dir applied ${tag}`, m.dir === dir);
        check(`no horizontal overflow ${tag}`, m.scrollW <= m.innerW, `scrollWidth ${m.scrollW} > ${m.innerW}`);
        check(`no element outside viewport ${tag}`, m.offenders.length === 0, m.offenders.join(', '));
        check(`container centred ${tag}`, m.centred);
        check(`no console/page/network errors ${tag}`, errors.length === 0, errors.join(' | '));
        matrixRuns++;
      }
      await ctx.close();
    }
  }
}
console.log(`  ${matrixRuns} page renders checked`);

// 3 ─ Mobile / tablet navigation ────────────────────────────────────────
section('Mobile/tablet header + full-screen menu');
for (const width of [320, 375, 768, 1023]) {
  for (const dir of DIRS) {
    const { ctx, page, errors } = await newPage({ width, dir });
    await page.goto(BASE + 'about.html');
    const tag = `@${width} ${dir}`;
    check(`header theme toggle hidden ${tag}`, !(await page.locator('.site-header [data-theme-toggle]').isVisible()));
    check(`header dir toggle hidden ${tag}`, !(await page.locator('.site-header [data-dir-toggle]').isVisible()));
    check(`header CTA hidden ${tag}`, !(await page.locator('.site-header .btn').isVisible()));
    check(`desktop nav hidden ${tag}`, !(await page.locator('.nav-desktop').isVisible()));
    const openBtn = page.locator('[data-menu-open]');
    check(`menu button visible ${tag}`, await openBtn.isVisible());
    check(`menu closed initially ${tag}`, !(await page.locator('#mobile-menu').isVisible()));

    await openBtn.click();
    await page.waitForTimeout(400);
    const menu = page.locator('#mobile-menu');
    check(`menu opens ${tag}`, await menu.isVisible());
    check(`menu aria-expanded ${tag}`, (await openBtn.getAttribute('aria-expanded')) === 'true');
    check(`theme toggle inside menu ${tag}`, await menu.locator('[data-theme-toggle]').isVisible());
    check(`dir toggle inside menu ${tag}`, await menu.locator('[data-dir-toggle]').isVisible());
    check(`CTA inside menu ${tag}`, await menu.locator('.btn').isVisible());
    check(`focus moved into menu ${tag}`, await page.evaluate(() => document.getElementById('mobile-menu').contains(document.activeElement)));
    check(`body scroll locked ${tag}`, await page.evaluate(() => document.body.classList.contains('menu-open')));
    const menuOverflow = await page.evaluate(() => {
      const m = document.getElementById('mobile-menu');
      return m.scrollWidth <= m.clientWidth;
    });
    check(`menu has no horizontal overflow ${tag}`, menuOverflow);

    const acc = menu.locator('[data-accordion-trigger]');
    const panel = page.locator('#m-home-menu');
    check(`Home accordion closed by default ${tag}`, !(await panel.isVisible()) && (await acc.getAttribute('aria-expanded')) === 'false');
    await acc.hover();
    await page.waitForTimeout(300);
    check(`Home accordion does not open on hover ${tag}`, !(await panel.isVisible()));
    await acc.click();
    check(`Home accordion opens on click ${tag}`, (await panel.isVisible()) && (await acc.getAttribute('aria-expanded')) === 'true');
    const links = await panel.locator('a').allTextContents();
    check(`Home accordion has only Home 1 & Home 2 ${tag}`, links.join('|') === 'Home 1|Home 2', links.join('|'));

    // Focus trap: tab through more items than exist
    let escaped = false;
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press('Tab');
      if (!(await page.evaluate(() => document.getElementById('mobile-menu').contains(document.activeElement)))) escaped = true;
    }
    check(`focus trapped in menu ${tag}`, !escaped);

    // Theme + direction toggles from inside the menu
    await menu.locator('[data-theme-toggle]').click();
    check(`menu theme toggle → dark ${tag}`, (await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark');
    await menu.locator('[data-theme-toggle]').click();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    check(`Escape closes menu ${tag}`, !(await menu.isVisible()));
    check(`focus returns to menu button ${tag}`, await page.evaluate(() => document.activeElement?.hasAttribute('data-menu-open')));
    check(`background inert removed ${tag}`, await page.evaluate(() => !document.querySelector('[inert]')));

    await openBtn.click();
    await page.waitForTimeout(400);
    check(`accordion re-collapsed on reopen ${tag}`, !(await panel.isVisible()));
    await menu.locator('[data-menu-close]').click();
    await page.waitForTimeout(400);
    check(`close button closes menu ${tag}`, !(await menu.isVisible()));
    check(`no errors (mobile menu) ${tag}`, errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
}

// 4 ─ Desktop click-only dropdown ───────────────────────────────────────
section('Desktop header + click-only Home dropdown');
for (const width of [1024, 1280, 1920]) {
  for (const dir of DIRS) {
    const { ctx, page, errors } = await newPage({ width, dir });
    await page.goto(BASE + 'contact.html');
    const tag = `@${width} ${dir}`;
    check(`menu button hidden on desktop ${tag}`, !(await page.locator('[data-menu-open]').isVisible()));
    check(`header controls visible ${tag}`, await page.locator('.header-actions').isVisible());
    const trig = page.locator('[data-dropdown-trigger]');
    const dd = page.locator('#home-menu');
    check(`dropdown closed by default ${tag}`, !(await dd.isVisible()));
    await trig.hover();
    await page.waitForTimeout(400);
    check(`dropdown does NOT open on hover ${tag}`, !(await dd.isVisible()));
    await trig.focus();
    await page.waitForTimeout(100);
    check(`dropdown does NOT open on focus ${tag}`, !(await dd.isVisible()));
    await trig.click();
    check(`dropdown opens on click ${tag}`, (await dd.isVisible()) && (await trig.getAttribute('aria-expanded')) === 'true');
    const items = await dd.locator('a').allTextContents();
    check(`dropdown has only Home 1 & Home 2 ${tag}`, items.map((s) => s.trim()).join('|') === 'Home 1|Home 2', items.join('|'));
    const box = await dd.boundingBox();
    check(`dropdown within viewport ${tag}`, box.x >= 0 && box.x + box.width <= width);
    await page.keyboard.press('Escape');
    check(`Escape closes dropdown ${tag}`, !(await dd.isVisible()));
    check(`focus returns to trigger ${tag}`, await page.evaluate(() => document.activeElement?.hasAttribute('data-dropdown-trigger')));
    await trig.click();
    await page.mouse.click(width / 2, 600);
    check(`outside click closes dropdown ${tag}`, !(await dd.isVisible()));
    // Keyboard: Enter opens, ArrowDown moves to items
    await trig.focus();
    await page.keyboard.press('Enter');
    check(`Enter opens dropdown ${tag}`, await dd.isVisible());
    await page.keyboard.press('Escape');
    await page.keyboard.press('ArrowDown');
    check(`ArrowDown focuses first item ${tag}`, (await page.evaluate(() => document.activeElement?.textContent.trim())) === 'Home 1');
    await page.keyboard.press('ArrowDown');
    check(`ArrowDown moves to Home 2 ${tag}`, (await page.evaluate(() => document.activeElement?.textContent.trim())) === 'Home 2');
    await page.keyboard.press('Tab');
    await page.waitForTimeout(50);
    check(`tabbing out closes dropdown ${tag}`, !(await dd.isVisible()));
    check(`no errors (desktop nav) ${tag}`, errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
}

// 5 ─ Persistence of theme & direction ─────────────────────────────────
section('Theme & direction toggles persist across reload');
{
  const { ctx, page } = await newPage({ width: 1280 });
  await page.goto(BASE + 'index.html');
  await page.locator('.site-header [data-theme-toggle]').click();
  await page.locator('.site-header [data-dir-toggle]').click();
  check('header theme toggle → dark', (await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark');
  check('header dir toggle → rtl', (await page.evaluate(() => document.documentElement.dir)) === 'rtl');
  check('aria-pressed reflects theme', (await page.locator('.site-header [data-theme-toggle]').getAttribute('aria-pressed')) === 'true');
  await page.goto(BASE + 'donations.html');
  check('theme persists to another page', (await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark');
  check('dir persists to another page', (await page.evaluate(() => document.documentElement.dir)) === 'rtl');
  await page.reload();
  check('theme persists after reload', (await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark');
  await ctx.close();

  // System preference is respected when nothing is stored
  const c2 = await browser.newContext({ colorScheme: 'dark', viewport: { width: 1280, height: 800 } });
  const p2 = await c2.newPage();
  await p2.goto(BASE + 'index.html');
  check('follows prefers-color-scheme: dark by default', (await p2.evaluate(() => document.documentElement.dataset.theme)) === 'dark');
  await c2.close();
}

// 6 ─ Scroll-to-top & reduced motion ───────────────────────────────────
section('Scroll-to-top and reduced motion');
{
  const { ctx, page } = await newPage({ width: 375, height: 500, reduced: true });
  await page.goto(BASE + 'index.html');
  const btn = page.locator('[data-scroll-top]');
  check('scroll-top hidden at top', !(await btn.evaluate((b) => b.classList.contains('is-visible'))));
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(150);
  check('scroll-top visible after scrolling', await btn.evaluate((b) => b.classList.contains('is-visible')));
  await btn.click();
  await page.waitForTimeout(150);
  check('scroll-top returns to top', (await page.evaluate(() => window.scrollY)) === 0);
  check('reduced motion: reveal content visible immediately', await page.evaluate(() =>
    [...document.querySelectorAll('[data-reveal]')].every((el) => getComputedStyle(el).opacity === '1')));
  await ctx.close();
}

// 7 ─ Accessibility (axe-core, WCAG 2.0/2.1/2.2 A + AA incl. colour contrast) ─
section('axe-core accessibility audit');
const axeTags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
let axeRuns = 0;
for (const theme of THEMES) {
  for (const dir of DIRS) {
    for (const width of [375, 1280]) {
      const { ctx, page } = await newPage({ width, theme, dir, reduced: true });
      for (const r of ROUTES) {
        await page.goto(BASE + r);
        const res = await new AxeBuilder({ page }).withTags(axeTags).analyze();
        const v = res.violations.map((x) => `${x.id} (${x.nodes.length}): ${x.nodes[0]?.target.join(' ')}`);
        check(`axe ${r} @${width} ${theme}/${dir}`, v.length === 0, v.join(' ; '));
        axeRuns++;
      }
      if (width === 375) {
        await page.goto(BASE + 'index.html');
        await page.locator('[data-menu-open]').click();
        await page.locator('[data-accordion-trigger]').click();
        const res = await new AxeBuilder({ page }).withTags(axeTags).analyze();
        const v = res.violations.map((x) => `${x.id} (${x.nodes.length}): ${x.nodes[0]?.target.join(' ')}`);
        check(`axe mobile menu open ${theme}/${dir}`, v.length === 0, v.join(' ; '));
        axeRuns++;
      } else {
        await page.goto(BASE + 'index.html');
        await page.locator('[data-dropdown-trigger]').click();
        const res = await new AxeBuilder({ page }).withTags(axeTags).analyze();
        const v = res.violations.map((x) => `${x.id} (${x.nodes.length}): ${x.nodes[0]?.target.join(' ')}`);
        check(`axe desktop dropdown open ${theme}/${dir}`, v.length === 0, v.join(' ; '));
        axeRuns++;
      }
      await ctx.close();
    }
  }
}
console.log(`  ${axeRuns} axe audits`);

// 8 ─ Screenshots for visual review ─────────────────────────────────────
section(`Screenshots → ${SHOTS}`);
const shots = [
  { route: 'index.html', width: 320, theme: 'light', dir: 'ltr' },
  { route: 'index.html', width: 375, theme: 'dark', dir: 'ltr' },
  { route: 'about.html', width: 768, theme: 'light', dir: 'rtl' },
  { route: 'pooja-timings.html', width: 1024, theme: 'light', dir: 'ltr' },
  { route: 'donations.html', width: 1280, theme: 'dark', dir: 'ltr' },
  { route: 'contact.html', width: 1440, theme: 'light', dir: 'rtl' },
  { route: 'home-2.html', width: 1920, theme: 'dark', dir: 'rtl' },
];
for (const s of shots) {
  const { ctx, page } = await newPage({ ...s, reduced: true });
  await page.goto(BASE + s.route);
  await page.screenshot({ path: path.join(SHOTS, `${s.route.replace('.html', '')}-${s.width}-${s.theme}-${s.dir}.png`), fullPage: true });
  await ctx.close();
}
for (const [width, theme, dir] of [[375, 'light', 'ltr'], [768, 'dark', 'rtl']]) {
  const { ctx, page } = await newPage({ width, theme, dir, reduced: true });
  await page.goto(BASE + 'about.html');
  await page.locator('[data-menu-open]').click();
  await page.locator('[data-accordion-trigger]').click();
  await page.screenshot({ path: path.join(SHOTS, `mobile-menu-${width}-${theme}-${dir}.png`) });
  await ctx.close();
}
{
  const { ctx, page } = await newPage({ width: 1280, height: 420, reduced: true });
  await page.goto(BASE + 'about.html');
  await page.locator('[data-dropdown-trigger]').click();
  await page.screenshot({ path: path.join(SHOTS, 'desktop-dropdown-1280.png') });
  await ctx.close();
}

await browser.close();
server.close();

console.log(`\n══ QA summary: ${results.pass} passed, ${results.fail.length} failed ══`);
if (results.fail.length) {
  const shown = results.fail.slice(0, 60);
  shown.forEach((f) => console.log('  ✗ ' + f));
  if (results.fail.length > shown.length) console.log(`  … and ${results.fail.length - shown.length} more`);
  process.exit(1);
}
