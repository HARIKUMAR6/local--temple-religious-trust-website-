const { chromium } = require('playwright');
const { spawn } = require('child_process');
(async () => {
  const [,, w, theme, dir, out, route = 'index.html', full = '1'] = process.argv;
  const srv = spawn(process.execPath, ['scripts/serve.mjs'], { env: { ...process.env, PORT: '5199' } });
  await new Promise(r => setTimeout(r, 700));
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: +w, height: 900 }, reducedMotion: 'reduce' });
  await ctx.addInitScript(([t, d]) => { localStorage.setItem('tt-theme', t); localStorage.setItem('tt-dir', d); }, [theme, dir]);
  const p = await ctx.newPage();
  const errs = []; p.on('console', m => m.type() === 'error' && errs.push(m.text())); p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:5199/' + route, { waitUntil: 'load' });
  await p.waitForTimeout(800);
  await p.screenshot({ path: out, fullPage: full === '1' });
  console.log('errors:', errs);
  await b.close(); srv.kill();
})();
