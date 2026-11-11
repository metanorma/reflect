/**
 * Zero-dependency static file server for the prosemirror-minimap harness
 * build output (§15.3).
 *
 * Serves `pkg/prosemirror-minimap/harness/dist/` over http:// so that ES
 * module `<script type="module">` tags load correctly (they require an
 * http origin — file:// origins are rejected by the browser).
 *
 * Routes:
 *
 *   /…                     → harness/dist/<basename>      (existing behaviour)
 *   /mockups/metanorma-editor-mockup.html
 *                          → pkg/prosemirror-minimap/docs/ (the committed
 *                            parity baseline; URL kept stable)
 *   /mockups/<other>       → mockups/<other>              (gitignored dir,
 *                            whatever remains there locally)
 *   /parity.html, /parity/<file>
 *                          → harness/parity/<file>        (side-by-side page)
 *   /parity-data/scenarios/<file>     → e2e/parity/scenarios/
 *   /parity-data/masters/<file>       → e2e/parity/masters/
 *   /parity-data/deviations.json      → e2e/parity/deviations.json
 *   /parity-data/coverage.json        → e2e/parity/coverage.json
 *
 * Used by `../e2e/playwright.config.ts` (webServer), the parity suite
 * (`../e2e/parity/playwright.config.ts`), and manual testing:
 *
 *     node pkg/prosemirror-minimap/harness/serve.mjs   # → :3334
 *
 * A copy of `pkg/editor-gui/e2e/serve.mjs` (port 3334, different root);
 * no dependencies beyond Node's builtins, so it works under Yarn PnP
 * without resolution setup.
 */

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, 'dist');
const REPO = path.resolve(HERE, '..', '..', '..');
const PARITY = path.join(HERE, '..', 'e2e', 'parity');
const PORT = Number(process.env.PORT ?? 3334);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.map': 'application/json',
  '.svg': 'image/svg+xml',
};

// Static roots beyond dist/. Each route resolves to path.basename() at its
// root, so ".." traversal collapses to a bare name and nothing escapes.
const ROUTES = [
  { prefix: '/mockups/', root: path.join(REPO, 'mockups') },
  { prefix: '/parity/', root: path.join(HERE, 'parity') },
  { prefix: '/parity-data/scenarios/', root: path.join(PARITY, 'scenarios') },
  { prefix: '/parity-data/masters/', root: path.join(PARITY, 'masters') },
];

/** Map a request pathname to a file under one of the static roots. */
function resolveFile(pathname) {
  if (pathname === '/') pathname = '/index.html';
  if (pathname === '/parity.html') return path.join(HERE, 'parity', 'parity.html');
  if (pathname === '/parity-data/deviations.json')
    return path.join(PARITY, 'deviations.json');
  if (pathname === '/parity-data/coverage.json')
    return path.join(PARITY, 'coverage.json');
  for (const { prefix, root } of ROUTES) {
    if (pathname.startsWith(prefix)) return path.join(root, path.basename(pathname));
  }
  // Default: the harness build output; collapse any ".." traversal.
  return path.join(ROOT, path.basename(pathname));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

  // Directory index for the parity page's scenario picker (generated, not
  // a file).
  if (url.pathname === '/parity-data/scenarios/index.json') {
    try {
      const names = (await fs.readdir(path.join(PARITY, 'scenarios')))
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.replace(/\.json$/, ''))
        .sort();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(names));
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found: scenarios index');
    }
    return;
  }

  // The parity baseline mockup: committed at
  // pkg/prosemirror-minimap/docs/metanorma-editor-mockup.html (the
  // gitignored mockups/ dir is NOT its home anymore). The /mockups/… URL
  // stays stable so adapters, fixtures and the parity page don't change.
  if (url.pathname === '/mockups/metanorma-editor-mockup.html') {
    try {
      // PARITY = pkg/prosemirror-minimap/e2e/parity → up two = package root.
      const data = await fs.readFile(
        path.join(PARITY, '..', '..', 'docs', 'metanorma-editor-mockup.html'),
      );
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found: parity baseline mockup (pkg/prosemirror-minimap/docs/)');
    }
    return;
  }

  const filePath = resolveFile(url.pathname);

  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end(`Not found: ${url.pathname}`);
  }
});

server.listen(PORT, () => {
  console.log(`minimap harness server → http://localhost:${PORT} (serving ${ROOT})`);
});
