# Temple & Religious Trust Website (Phase 1 foundation)

Static site built with **HTML5, the Tailwind CSS v4 CLI and vanilla JavaScript**. It uses no framework, bundler or CDN.

## Commands

| Command | What it does |
|---|---|
| `npm install` | Install the dev tooling (Tailwind CLI, fonts, Playwright, axe-core) |
| `npm run build` | Build `dist/`: pages, CSS, JS bundle, fonts and images |
| `npm run dev` | Rebuild on change and serve at http://localhost:5173 |
| `npm run serve` | Serve the existing `dist/` |
| `npm run qa` | Run the full Playwright and axe test suite against `dist/`. Run `npm run build` first. The first run needs `node node_modules/playwright/cli.js install chromium` |
| `npm run qa:home1` | Focused Home 1 tests: structure, photos, 320–1920px layout, hero height, mobile CTAs, interactions, keyboard, motion, contrast over photos, axe |

> The folder path contains `&`, which breaks Windows `.cmd` shims such as `npx`. For that reason every script calls the CLIs through `node` directly.

## Configure the temple details

All temple-specific facts live in **`site.config.json`**: the name, trust, deity, address, phone, email, office hours, socials, registration and donate label. Every value is currently a clearly marked **placeholder**. Replace them only with details verified by the Trust, then rebuild. Set a social URL to `""` to hide its icon.

## Project structure

```
site.config.json        Temple/trust details (single source of truth)
scripts/
  build-html.mjs        Pages + partials → dist/, copies assets/fonts, bundles JS
  serve.mjs  dev.mjs    Static server / dev watcher
  qa.mjs                Automated QA (routes, 320–1920px, themes, RTL, menus, axe)
src/
  pages/*.html          Page shells (front-matter + main content)
  partials/*.html       layout, head, header, mobile-menu, footer, page-intro,
                        scroll-top, emblem, icons (SVG sprite)
  css/main.css          Tailwind entry, imports tokens/base/components
  css/tokens.css        Palette, type scale, semantic light/dark tokens
  css/base.css          Document, typography, focus, RTL text handling, .icon
  css/components/*.css  layout, patterns, buttons, cards, forms, header,
                        mobile-menu, page-intro, footer, scroll-top, motion
  js/core.js            TT namespace (register, store, focusables, emit)
  js/modules/*.js       theme, direction, header-scroll, dropdown,
                        mobile-menu, reveal, scroll-top
  js/main.js            Boots all modules
  assets/img/           logo-emblem.svg, favicon.svg
```

### Templating (`scripts/build-html.mjs`)
- `{{> partial}}` inserts the matching partial.
- `{{site.key}}` and `{{page.key}}` insert escaped values.
- `{{year}}` inserts the current year.
- `{{#if site.key}}…{{/if}}` renders a block only when the value is set.
- Each page's front-matter sets `title`, `description`, `nav`, `navGroup`, `breadcrumb`, `eyebrow`, `heading` and `lead`. Front-matter may reference `{{site.*}}`.
- An element with `data-nav="<page.nav>"` automatically receives `aria-current="page"`.

## Design system quick reference

**Palette.** Kumkum maroon `#6B1424`, antique gold `#B0852F` (decorative only; gold text uses `#7A5A16`), ivory `#FBF6EC`, sandalwood `#F3E9D4`, peacock teal and leaf green as complements. The dark theme uses warm-night surfaces `#1A0F0D` with gold `#E2BE6A`. Every text pairing meets WCAG AA, and axe reports no violations.

**Type.** Marcellus is used for display and headings, and Mukta for body and UI. Both are self-hosted. The scale is fluid: `text-display`, `text-h1`…`text-h4`, `text-lead`, `text-body`, `text-small`, `text-eyebrow`.

**Layout utilities.** `container-temple` (1280px wide), `container-narrow` (760px), `container-wide` (1536px), `section-y`, `section-y-sm` and `section-head`.

**Components.**

| Group | Classes |
|---|---|
| Buttons | `btn` with `btn-primary`, `btn-gold`, `btn-outline`, `btn-ghost` or `btn-on-dark`; sizes `btn-sm`, `btn-lg`, `btn-block`; `icon-btn` |
| Links | `link-arrow`, `link-underline` |
| Cards | `card-plain` (add `is-interactive` for hover), `card-mandapa-wrap` > `card-mandapa edge-gopuram`, `card-feature`, `card-title`, `card-text` |
| Forms | `field`, `label`, `input`, `select`, `textarea`, `check`, `help-text`, `error-text` (uses `aria-invalid="true"`) |
| Patterns | `bg-kolam` (with optional `is-faded`), `thoranam` (with optional `is-gold`), `ornament` (with optional `is-start`), `edge-gopuram`, `medallion` |

**Icons.** Use `<svg class="icon" aria-hidden="true"><use href="#i-NAME"/></svg>`. Available names:
- Interface: menu, close, chevron-down, chevron-right, arrow-right, arrow-up, sun, moon, direction
- Contact: phone, mail, map-pin, clock
- Devotional: lotus, lamp, bell, heart-hand, temple
- Social: facebook, instagram, youtube, x, whatsapp

Add `icon-dir` to any icon that should mirror in RTL.

**Motion.** Add `data-reveal` (values `fade` or `zoom`) to animate an element into view. Set an optional delay with `style="--reveal-delay:120ms"`. Content stays visible without JS, and animations are switched off under `prefers-reduced-motion`.

**Theme and direction.** These are stored in `localStorage` under the keys `tt-theme` and `tt-dir`, and applied before first paint. Until a visitor makes a choice, the theme follows the operating system setting.

## Home 1 (`index.html`)

Seven sections, each a partial in `src/partials/home1-*.html`: hero, about, pooja, festivals, sevas, support, visit. Styles are in `src/css/components/home-1.css` (`hm-` prefix); behaviour is in `festivals.js`, `pooja-schedule.js` and `seva-enquiry.js`.

**Content is configurable.** The `home` block in `site.config.json` holds the pooja slots, festivals, sevas and donation purposes. Everything in it is an unconfirmed placeholder: times and dates say "to be announced". When the Trust confirms real details:
- Fill in `isoDate` (`YYYY-MM-DD`) on a festival to show an "Add to calendar" button.
- Fill in `start`/`end` (`HH:MM`) on pooja slots, and set `home.timeZone` (e.g. `Asia/Kolkata`), to get a live Now/Next highlight. Without a time zone, nothing is guessed from the visitor's clock.
- Add or remove list items freely: the templates loop over the config with `{{#each}}`.

**Shared hero height system.** Any hero can opt in with `.hero-shell` (`src/css/components/hero.css`). On phones and tablets (under 1024px) the content sets the height, with a floor of 34rem. On desktop it fills the screen under the sticky header, clamped between 34rem and 56rem. Home 2 should reuse it.

**Photographs.** See `docs/home-1-image-sources.md`. They are stand-ins from other temples, so replace them with the temple's own photographs before launch.

## Home 2 (`home-2.html`)

Seven sections in `src/partials/home2-*.html`, styled by `src/css/components/home-2.css` (`hm2-` prefix). It reuses the Home 1 config (`home` block), the shared `.hero-shell` height system and the existing `festivals.js`, `pooja-schedule.js` and `seva-enquiry.js` modules through their `data-` hooks, so it needs no new JavaScript. Its photographs are listed in `docs/home-2-image-sources.md`.

## About (`about.html`) and Pooja Timings (`pooja-timings.html`)

Six sections each, in `src/partials/about-*.html` and `pooja-*.html`, styled by `about.css` (`ab-`) and `pooja-timings.css` (`pt-`). Content lives in the `about` and `poojaPage` blocks of `site.config.json` (plus `home.poojaSlots`, `home.festivals` and `home.sevas`, shared with the home pages). Everything unconfirmed says "to be announced/confirmed".
- **Announcement state:** clear `poojaPage.announcement` to hide the "Timings to be announced" banner and hero pill once real timings are published. Fill `poojaPage.lastUpdated` to show an updated-on line.
- **Interactions:** `page-actions.js` adds tabs, a single-open disclosure list and print. Both pages also reuse `pooja-schedule.js` and `festivals.js`. Without JavaScript every tab panel and accordion panel stays visible.
- **Tests:** `npm run qa:inner`. Photos: `docs/inner-pages-image-sources.md`.

## Donations (`donations.html`) and Contact (`contact.html`)

Six sections each (`donations-*.html`, `contact-*.html`; styles `donations.css` `dn-`, `contact.css` `ct-`). Content: the `donationsPage` and `contact` blocks of `site.config.json`.
- **Donations never publishes payment details.** No account numbers, UPI, QR, gateway, tax or receipt claims. Every detail row says "Ask the Temple Office" until the Trust verifies something. Clear `donationsPage.status` when real details are added.
- **Map:** an embedded interactive map built from the one configured address (`build-html.mjs` derives the embed, directions and open-map URLs). Set a real address, or `contact.mapQuery` / `contact.mapEmbedUrl`, so the pin resolves.
- **Form:** with no `contact.formEndpoint`, a valid submit opens the visitor's email app with the message ready and says plainly that it is **not sent** until they press Send (plus Copy and Edit). Set `formEndpoint` to a real form-handling URL and the form POSTs to it, reporting success or failure truthfully. Without JavaScript it falls back to a `mailto:` form.
- **`?topic=`:** `contact-form.js` preselects the topic from incoming links (`donation`, `volunteer`, `seva-<id>`, `festival-<id>`, and the other general topics). Unknown or malformed values are ignored, and the visitor's own input is never overwritten.
- **Tests:** `npm run qa:donate-contact`. Photos: `docs/donations-contact-image-sources.md`.
