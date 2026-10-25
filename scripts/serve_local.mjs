import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(__dirname, '../carddemo-web');
const distDir = path.join(webDir, 'dist');
const snapshot = JSON.parse(fs.readFileSync(path.join(webDir, 'worker-snapshot.json'), 'utf8'));
const workerSrc = fs
  .readFileSync(path.join(webDir, 'worker.mjs'), 'utf8')
  .replace("import snapshot from './worker-snapshot.json';", 'const snapshot = globalThis.__SNAP__;');
globalThis.__SNAP__ = snapshot;
const modUrl = 'data:text/javascript;base64,' + Buffer.from(workerSrc).toString('base64');
const worker = (await import(modUrl)).default;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

const port = Number(process.env.PORT || 8080);

http
  .createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://localhost:${port}`);
    if (url.pathname.startsWith('/api/')) {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const bodyBuf = Buffer.concat(chunks);
      const wReq = new Request(url.toString(), {
        method: req.method,
        headers: req.headers,
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : bodyBuf,
      });
      const wRes = await worker.fetch(wReq, {});
      res.writeHead(wRes.status, Object.fromEntries(wRes.headers.entries()));
      res.end(Buffer.from(await wRes.arrayBuffer()));
      return;
    }

    let filePath = path.join(distDir, url.pathname === '/' ? 'index.html' : url.pathname);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(distDir, 'index.html');
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  })
  .listen(port, '0.0.0.0', () => {
    console.log(`🚀 CardDemo × Sistine Glass live at http://localhost:${port}`);
  });
