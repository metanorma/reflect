/**
 * Zero-dependency static file server for the prosemirror-minimap harness
 * build output (§15.3).
 *
 * Serves `pkg/prosemirror-minimap/harness/dist/` over http:// so that ES
 * module `<script type="module">` tags load correctly (they require an
 * http origin — file:// origins are rejected by the browser).
 *
 * Used by `../e2e/playwright.config.ts` (webServer) and manual testing:
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

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  // Map "/" to "/index.html"; collapse any ".." traversal to a bare name.
  let pathname = url.pathname;
  if (pathname === '/') pathname = '/index.html';
  const filePath = path.join(ROOT, path.basename(pathname));

  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end(`Not found: ${pathname}`);
  }
});

server.listen(PORT, () => {
  console.log(`minimap harness server → http://localhost:${PORT} (serving ${ROOT})`);
});
