import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { onRequest } from './functions/api/[[route]].js';
const sqlite = new DatabaseSync('/tmp/salon-test.db');
for (const s of readFileSync('./schema.sql','utf8').split(';')) if (s.trim()) sqlite.exec(s);
const DB = { prepare(sql){ let args=[]; const a={ bind:(...x)=>{args=x;return a;}, first:async()=>sqlite.prepare(sql).get(...args)??null,
  all:async()=>({results:sqlite.prepare(sql).all(...args)}), run:async()=>sqlite.prepare(sql).run(...args) }; return a; } };
const env = { DB, PANEL_PASSWORD:'tajne123', SESSION_SECRET:'s' };
const TYPES = {'.html':'text/html;charset=utf-8','.css':'text/css','.js':'text/javascript'};
http.createServer(async (req,res) => {
  const u = new URL(req.url, 'http://localhost');
  if (u.pathname.startsWith('/api/')) {
    let body=''; for await (const c of req) body+=c;
    const request = new Request('https://salon.test'+req.url, {method:req.method, headers:req.headers, ...(body?{body}:{})});
    const out = await onRequest({request, env, params:{route:u.pathname.slice(5).split('/')}});
    res.writeHead(out.status, Object.fromEntries(out.headers));
    res.end(await out.text()); return;
  }
  let p = 'public' + (u.pathname === '/' ? '/index.html' : u.pathname);
  if (!existsSync(p)) { res.writeHead(404); res.end('nie ma'); return; }
  res.writeHead(200, {'Content-Type': TYPES[p.slice(p.lastIndexOf('.'))] || 'text/plain'});
  res.end(readFileSync(p));
}).listen(8124, () => console.log('start'));
