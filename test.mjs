/* Test funkcji API na lokalnej bazie SQLite (symulacja D1). Nie trafia na produkcję. */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { onRequest } from './functions/api/[[route]].js';

const sqlite = new DatabaseSync(':memory:');
for (const stmt of readFileSync('./schema.sql', 'utf8').split(';')) if (stmt.trim()) sqlite.exec(stmt);

const DB = {
  prepare(sql) {
    let args = [];
    const api = {
      bind(...a) { args = a; return api; },
      async first() { return sqlite.prepare(sql).get(...args) ?? null; },
      async all() { return { results: sqlite.prepare(sql).all(...args) }; },
      async run() { return sqlite.prepare(sql).run(...args); },
    };
    return api;
  },
};

const env = { DB, PANEL_PASSWORD: 'tajne123', SESSION_SECRET: 'sekret' };
let cookie = '';

async function call(route, { method = 'GET', body, query = '' } = {}) {
  const req = new Request(`https://salon.test/api/${route}${query}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '1.2.3.4', ...(cookie ? { Cookie: cookie } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const res = await onRequest({ request: req, env, params: { route: route.split('/') } });
  const set = res.headers.get('Set-Cookie');
  if (set) cookie = set.split(';')[0];
  return { status: res.status, data: await res.json() };
}

const ok = (label, cond, extra = '') => console.log(`${cond ? 'OK  ' : 'BŁĄD'} ${label}${extra ? ' → ' + extra : ''}`);

const cfg = await call('config');
ok('konfiguracja', cfg.status === 200 && cfg.data.services.length > 0);

const cal = await call('calendar', { query: '?service=mes' });
const day = cal.data.days.find(d => d.times.length);
ok('kalendarz zwraca wolne terminy', !!day, `${day?.date} ${day?.times[0]}`);

const bookBody = { service:'mes', date:day.date, time:day.times[0], name:'Jan Testowy', phone:'600100200', email:'jan@example.com', note:'test', consent:true };
const b1 = await call('book', { method:'POST', body: bookBody });
ok('rezerwacja zapisana', b1.status === 200 && b1.data.booking.status === 'pending', b1.data.booking?.id);

const b2 = await call('book', { method:'POST', body: { ...bookBody, name:'Ktoś Inny', email:'x@example.com' } });
ok('druga rezerwacja na tę samą godzinę odrzucona', b2.status === 409 && b2.data.taken === true);

const bad = await call('book', { method:'POST', body: { ...bookBody, email:'zle', consent:false, time:day.times[1] } });
ok('walidacja formularza', bad.status === 422 && bad.data.errors.email && bad.data.errors.consent);

const cal2 = await call('calendar', { query: '?service=mes' });
const d2 = cal2.data.days.find(d => d.date === day.date);
ok('zajęta godzina znika z kalendarza', !d2.times.includes(day.times[0]));

const code = b1.data.booking.id;
const st = await call('status', { query: `?code=${code}` });
ok('status po kodzie', st.data.booking?.id === code && st.data.booking.ip === undefined);

const noauth = await call('admin');
ok('panel wymaga logowania', noauth.status === 401);

const badlogin = await call('login', { method:'POST', body:{ password:'zle' } });
ok('błędne hasło odrzucone', badlogin.status === 401);

const login = await call('login', { method:'POST', body:{ password:'tajne123' } });
ok('logowanie', login.status === 200 && cookie.startsWith('salon_admin='));

const adm = await call('admin');
ok('lista w panelu', adm.status === 200 && adm.data.bookings.length === 1 && adm.data.mailReady === false);

const dec = await call('decide', { method:'POST', body:{ code, status:'accepted' } });
ok('akceptacja + treść e-maila', dec.data.booking.status === 'accepted' && dec.data.mail.subj.includes('potwierdzona'));

const seed = await call('seed', { method:'POST' });
const adm2 = await call('admin');
ok('przykładowe rezerwacje', seed.data.added > 0 && adm2.data.bookings.filter(b => b.sample).length === seed.data.added);

const can = await call('cancel', { method:'POST', body:{ code } });
ok('odwołanie przez klienta', can.data.booking.status === 'cancelled');

const cal3 = await call('calendar', { query: '?service=mes' });
ok('termin znów wolny po odwołaniu', cal3.data.days.find(d => d.date === day.date).times.includes(day.times[0]));

await call('unseed', { method:'POST' });
const adm3 = await call('admin');
ok('usuwanie przykładów', adm3.data.bookings.every(b => !b.sample));

const out = await call('logout', { method:'POST' });
cookie = '';
const after = await call('admin');
ok('wylogowanie', out.status === 200 && after.status === 401);
