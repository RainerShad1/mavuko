// Servidor local para probar el panel sin Cloudflare ni Neon (PGlite en memoria).
import { PGlite } from '@electric-sql/pglite';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import worker from '../src/index.js';
import { hashClave } from '../src/auth.js';

const pg = new PGlite();
await pg.exec(readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8'));
const db = { q: async (t, p = []) => (await pg.query(t, p)).rows, one: async (t, p) => (await pg.query(t, p ?? [])).rows[0] || null };
await db.q("insert into usuarios(usuario,nombre,rol,hash,sal) values('director','Dirección','director',$1,'s')", [await hashClave('prueba', 's')]);
const PUB = new URL('../public/', import.meta.url).pathname;
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png', '.css': 'text/css' };
const env = {
  __db: db,
  ASSETS: { fetch: async (req) => { let p = new URL(req.url).pathname; if (p.endsWith('/')) p += 'index.html'; const f = join(PUB, p); if (!existsSync(f) || statSync(f).isDirectory()) return new Response('404', { status: 404 }); return new Response(readFileSync(f), { headers: { 'Content-Type': TIPOS[extname(f)] || 'application/octet-stream' } }); } },
};
const ctx = { waitUntil: (p) => p };
createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  const r = await worker.fetch(new Request('http://localhost:8787' + req.url, { method: req.method, headers: req.headers, body: chunks.length ? Buffer.concat(chunks) : undefined }), env, ctx);
  res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer()));
}).listen(8787, () => console.log('http://localhost:8787'));
