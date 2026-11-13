/** Dev mode: HTML/JS/asset watcher + Tailwind CLI watcher + static server. */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, watch } from './build-html.mjs';
import { startServer } from './serve.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

await build();
watch();

// Invoke the Tailwind CLI through node directly: .cmd shims break on paths containing "&".
const tw = spawn(
  process.execPath,
  [
    path.join(ROOT, 'node_modules', '@tailwindcss', 'cli', 'dist', 'index.mjs'),
    '-i', path.join(ROOT, 'src', 'css', 'main.css'),
    '-o', path.join(ROOT, 'dist', 'assets', 'css', 'main.css'),
    '--watch',
  ],
  { cwd: ROOT, stdio: 'inherit' },
);
process.on('exit', () => tw.kill());

const server = await startServer();
console.log(`[dev] http://localhost:${server.address().port}`);
