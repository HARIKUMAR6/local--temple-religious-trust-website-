/**
 * Static HTML builder (zero dependencies).
 *
 *  src/pages/*.html  ──►  dist/*.html
 *
 * Page files start with a small front-matter block:
 *   ---
 *   title: About
 *   nav: about
 *   ---
 *   …main content…
 *
 * Template syntax (used in pages and partials):
 *   {{> name}}                 include src/partials/name.html (recursive)
 *   {{site.a.b}} / {{page.x}}  HTML-escaped value from site.config.json / front-matter
 *   {{year}}                   current year
 *   {{#if site.x}} … {{/if}}   render block only when value is non-empty (not nestable)
 *
 * Navigation state: any element with data-nav="<page.nav>" receives aria-current="page",
 * and any element with data-nav-group="<page.navGroup>" receives data-current="true".
 *
 * Also copies static assets, self-hosted fonts and concatenates JS modules into one
 * classic script (works over http:// and file://).
 */
import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');
const CONFIG = path.join(ROOT, 'site.config.json');

/** JS files concatenated in this order into dist/assets/js/app.js */
const JS_ORDER = [
  'core.js',
  'modules/theme.js',
  'modules/direction.js',
  'modules/header-scroll.js',
  'modules/dropdown.js',
  'modules/mobile-menu.js',
  'modules/reveal.js',
  'modules/scroll-top.js',
  'modules/festivals.js',
  'modules/pooja-schedule.js',
  'modules/seva-enquiry.js',
  'modules/page-actions.js',
  'modules/contact-form.js',
  'main.js',
];

/** Self-hosted font files (latin subset) copied from node_modules */
const FONTS = [
  '@fontsource/marcellus/files/marcellus-latin-400-normal.woff2',
  '@fontsource/mukta/files/mukta-latin-400-normal.woff2',
  '@fontsource/mukta/files/mukta-latin-500-normal.woff2',
  '@fontsource/mukta/files/mukta-latin-600-normal.woff2',
  '@fontsource/mukta/files/mukta-latin-700-normal.woff2',
];

const escapeHtml = (v) =>
  String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const lookup = (ctx, keyPath) => keyPath.split('.').reduce((o, k) => (o == null ? undefined : o[k]), ctx);

function parsePage(raw, file) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) throw new Error(`Missing front-matter in ${file}`);
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { meta, body: raw.slice(m[0].length) };
}

async function loadPartials() {
  const dir = path.join(SRC, 'partials');
  const map = {};
  for (const f of await fs.readdir(dir)) {
    if (f.endsWith('.html')) map[f.replace(/\.html$/, '')] = await fs.readFile(path.join(dir, f), 'utf8');
  }
  return map;
}

function render(tpl, ctx, partials, depth = 0) {
  if (depth > 10) throw new Error('Partial include depth exceeded');
  let out = tpl.replace(/\{\{>\s*([\w-]+)\s*\}\}/g, (_, name) => {
    if (!(name in partials)) throw new Error(`Unknown partial "${name}"`);
    return render(partials[name], ctx, partials, depth + 1);
  });
  if (depth > 0) return out; // lists, conditionals and values are resolved once at the top level
  return resolve(out, ctx);
}

/** Resolves {{#each}}, {{#if}} and {{value}} tags (partials are already expanded). */
function resolve(out, ctx) {
  out = out.replace(/\{\{#each\s+([\w.]+)\s*\}\}([\s\S]*?)\{\{\/each\}\}/g, (_, key, block) => {
    const list = lookup(ctx, key);
    if (!Array.isArray(list)) throw new Error(`#each "${key}" is not a list`);
    return list
      .map((item, i) => {
        const self = typeof item === 'object' && item !== null ? { ...item, index: i, number: i + 1, first: i === 0 } : item;
        return resolve(block, { ...ctx, this: self });
      })
      .join('');
  });
  out = out.replace(/\{\{#if\s+([\w.]+)\s*\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, key, block) => {
    const v = lookup(ctx, key);
    return v !== undefined && v !== null && v !== '' && v !== false ? block : '';
  });
  out = out.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (whole, key) => {
    if (key === 'content') return whole; // handled by caller
    const v = lookup(ctx, key);
    if (v === undefined) throw new Error(`Unknown template value "${key}"`);
    return escapeHtml(v);
  });
  return out;
}

function markNavigation(html, page) {
  if (page.nav) {
    html = html.replace(new RegExp(`data-nav="${page.nav}"`, 'g'), `data-nav="${page.nav}" aria-current="page"`);
  }
  if (page.navGroup) {
    html = html.replace(
      new RegExp(`data-nav-group="${page.navGroup}"`, 'g'),
      `data-nav-group="${page.navGroup}" data-current="true"`,
    );
  }
  return html;
}

async function copyDir(from, to) {
  if (!fss.existsSync(from)) return;
  await fs.mkdir(to, { recursive: true });
  for (const entry of await fs.readdir(from, { withFileTypes: true })) {
    const s = path.join(from, entry.name);
    const d = path.join(to, entry.name);
    if (entry.isDirectory()) await copyDir(s, d);
    else await fs.copyFile(s, d);
  }
}

/**
 * Derived contact values, so the map, directions and form all use the one configured address.
 *   contact.mapQueryText   the address text used for the map (config override: contact.mapQuery)
 *   contact.mapEmbedSrc    iframe URL (config override: contact.mapEmbedUrl)
 *   contact.mapOpenUrl     link that opens the map (config override: address.mapUrl)
 *   contact.directionsUrl  link that opens directions to the address
 *   contact.formAction / formEnctype   endpoint if configured, otherwise a mailto: fallback for no-JS
 */
function deriveContact(site) {
  const a = site.address || {};
  const c = (site.contact = site.contact || {});
  const text = c.mapQuery || [a.line1, a.line2, a.city, [a.state, a.postalCode].filter(Boolean).join(' '), a.country].filter(Boolean).join(', ');
  const q = encodeURIComponent(text);
  c.mapQueryText = text;
  c.mapEmbedSrc = c.mapEmbedUrl || `https://www.google.com/maps?q=${q}&z=${c.mapZoom || 15}&output=embed`;
  c.mapOpenUrl = a.mapUrl || `https://www.google.com/maps/search/?api=1&query=${q}`;
  c.directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${q}`;
  c.formAction = c.formEndpoint || `mailto:${site.email}`;
  c.formEnctype = c.formEndpoint ? 'multipart/form-data' : 'text/plain';
}

export async function build() {
  const t0 = Date.now();
  const site = JSON.parse(await fs.readFile(CONFIG, 'utf8'));
  deriveContact(site);
  const partials = await loadPartials();
  const layout = partials.layout;
  if (!layout) throw new Error('src/partials/layout.html is required');

  await fs.mkdir(DIST, { recursive: true });
  const pagesDir = path.join(SRC, 'pages');
  const pages = (await fs.readdir(pagesDir)).filter((f) => f.endsWith('.html'));

  for (const file of pages) {
    const { meta, body } = parsePage(await fs.readFile(path.join(pagesDir, file), 'utf8'), file);
    // Front-matter values may reference config, e.g. "heading: {{site.templeName}}"
    for (const k of Object.keys(meta)) {
      meta[k] = meta[k].replace(/\{\{\s*site\.([\w.]+)\s*\}\}/g, (_, key) => lookup(site, key) ?? '');
    }
    const page = { slug: file.replace(/\.html$/, ''), file, ...meta };
    const ctx = { site, page, year: new Date().getFullYear() };
    const content = render(body, ctx, partials);
    let html = render(layout, ctx, partials).replace('{{content}}', () => content);
    html = markNavigation(html, page);
    await fs.writeFile(path.join(DIST, file), html);
  }

  // Static assets
  await copyDir(path.join(SRC, 'assets'), path.join(DIST, 'assets'));

  // Fonts
  const fontDir = path.join(DIST, 'assets', 'fonts');
  await fs.mkdir(fontDir, { recursive: true });
  for (const f of FONTS) {
    await fs.copyFile(path.join(ROOT, 'node_modules', f), path.join(fontDir, path.basename(f)));
  }

  // JavaScript bundle (ordered concatenation of self-registering IIFE modules)
  const jsDir = path.join(DIST, 'assets', 'js');
  await fs.mkdir(jsDir, { recursive: true });
  const parts = [];
  for (const f of JS_ORDER) {
    parts.push(`/* ── src/js/${f} ── */\n${await fs.readFile(path.join(SRC, 'js', f), 'utf8')}`);
  }
  await fs.writeFile(path.join(jsDir, 'app.js'), parts.join('\n'));

  console.log(`[html] built ${pages.length} pages + assets in ${Date.now() - t0}ms`);
}

export function watch() {
  let timer;
  const rebuild = () => {
    clearTimeout(timer);
    timer = setTimeout(() => build().catch((e) => console.error('[html] build failed:', e.message)), 80);
  };
  fss.watch(SRC, { recursive: true }, (_, name) => {
    if (name && !name.startsWith('css')) rebuild();
  });
  fss.watch(CONFIG, rebuild);
  console.log('[html] watching src/ and site.config.json');
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  build()
    .then(() => process.argv.includes('--watch') && watch())
    .catch((e) => {
      console.error('[html] build failed:', e.message);
      process.exit(1);
    });
}
