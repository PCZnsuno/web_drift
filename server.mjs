// Optional cross-platform launcher for machines with Node.js 20+.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url)), port = Number(process.env.PAPERBOAT_PORT || 17936);
const types = { '.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.pdf':'application/pdf','.wasm':'application/wasm','.json':'application/json','.ftl':'text/plain','.png':'image/png','.jpg':'image/jpeg','.ttf':'font/ttf','.otf':'font/otf' };
http.createServer((req,res) => {
  if (req.headers.host !== `127.0.0.1:${port}` || !['GET','HEAD'].includes(req.method)) { res.writeHead(403).end(); return; }
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if (url.pathname === '/__paperboat_health') { res.setHeader('Content-Type','text/plain; charset=utf-8'); res.end('paperboat-0.5'); return; }
    const pathname = decodeURIComponent(url.pathname), target = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!target.startsWith(root + path.sep) || pathname.includes('\\') || /\.(ps1|cmd|map)$/.test(target) || !fs.statSync(target).isFile()) { res.writeHead(404).end(); return; }
    res.writeHead(200, {'Content-Type':types[path.extname(target)] || 'application/octet-stream','Content-Length':fs.statSync(target).size,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
    if (req.method === 'HEAD') res.end(); else fs.createReadStream(target).pipe(res);
  } catch { res.writeHead(404).end(); }
}).listen(port,'127.0.0.1',()=>console.log(`Paperboat: http://127.0.0.1:${port}/`));
