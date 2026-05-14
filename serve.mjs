// Minimal zero-deps static file server for moonar.
// Listens on PORT (default 5173). Serves the project root.
// No third-party packages — uses only `node:*` builtins.

import { createServer } from 'node:http';
import { readFile }     from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '..');
const PORT = parseInt(process.env.PORT ?? '5173', 10);

const MIME = {
  '.html':         'text/html; charset=utf-8',
  '.js':           'application/javascript; charset=utf-8',
  '.mjs':          'application/javascript; charset=utf-8',
  '.css':          'text/css; charset=utf-8',
  '.json':         'application/json; charset=utf-8',
  '.svg':          'image/svg+xml',
  '.png':          'image/png',
  '.ico':          'image/x-icon',
  '.webmanifest':  'application/manifest+json',
  '.txt':          'text/plain; charset=utf-8',
};

const server = createServer(async (req, res) => {
  try {
    let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname === '/' || pathname.endsWith('/')) pathname += 'index.html';

    // Path-traversal guard: resolved path must stay inside ROOT
    const target = normalize(join(ROOT, pathname));
    if (!target.startsWith(ROOT)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      return res.end('Forbidden');
    }

    const body = await readFile(target);
    const type = MIME[extname(target).toLowerCase()] ?? 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type':  type,
      'Cache-Control': 'no-store',
    });
    res.end(body);
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'EISDIR') {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not Found');
    }
    console.error(err);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal Server Error');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`moonar  →  http://localhost:${PORT}/`);
});
