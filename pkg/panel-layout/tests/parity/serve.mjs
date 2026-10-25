#!/usr/bin/env node
/**
 * serve.mjs — zero-dependency static server for the parity suite.
 *
 * Rooted at pkg/panel-layout/ so the fixed routes are:
 *   /mock/editor-dockview7-floats.html   (reference target, today)
 *   /twin/…                              (library twin, later)
 *   /dist/mock/panel-layout.js           (built library artifact, for the
 *                                         future mock glue)
 *
 * Port is provided by the Playwright webServer config (4173). Same pattern
 * as pkg/prosemirror-minimap/harness/serve.mjs.
 *
 * --watch: rebuild continuously. Spawns the ROOT builder
 * (`yarn node ../../build-panel-layout.mjs --dev --watch` — the builder
 * must run from the root manifest for PnP; this file never imports
 * esbuild) as a child process and keeps serving in the foreground — one
 * process tree, one port; do NOT run a separate esbuild watch alongside.
 */
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { extname, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const require = createRequire(import.meta.url);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const port = Number(process.env.PORT ?? 4173);

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const file = resolve(ROOT, '.' + decodeURIComponent(url.pathname));
    if (!file.startsWith(ROOT)) {
      res.writeHead(403);
      res.end();
      return;
    }
    const body = await readFile(file);
    res.writeHead(200, {
      'content-type': MIME[extname(file)] ?? 'application/octet-stream',
    });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});

server.listen(port, '127.0.0.1', () => {
  // Signal readiness to Playwright's webServer on stdout.
  require('node:process').stdout.write(
    `parity server on http://127.0.0.1:${port}\n`);
});

if (process.argv.includes('--watch')) {
  // Root-owned builder as a child (see header); this server stays the
  // foreground process. stdio: 'inherit' keeps rebuild output visible.
  const child = spawn('yarn', [
    'node', '../../build-panel-layout.mjs', '--dev', '--watch',
  ], { cwd: ROOT, stdio: 'inherit' });
  const stop = () => { child.kill('SIGTERM'); };
  process.on('SIGINT', () => { stop(); process.exit(0); });
  process.on('SIGTERM', () => { stop(); process.exit(0); });
  child.on('exit', (code) => {
    if (code !== null && code !== 0) {
      console.error(`watch builder exited with ${code}`);
    }
  });
}
