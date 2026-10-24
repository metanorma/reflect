#!/usr/bin/env node
/**
 * serve.mjs — zero-dependency static server for the parity suite.
 *
 * Rooted at pkg/panel-layout/ so the fixed routes are:
 *   /mock/editor-dockview7-floats.html   (reference target, today)
 *   /twin/…                              (library twin, later)
 *
 * Port is provided by the Playwright webServer config (4173). Same pattern
 * as pkg/prosemirror-minimap/harness/serve.mjs.
 */
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { extname, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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
