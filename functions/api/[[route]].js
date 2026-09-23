/* Cała logika serwerowa: terminy, rezerwacje, panel, e-maile.
   Działa jako Cloudflare Pages Function. Tego pliku nie trzeba edytować. */

import { SALON, HOURS, CLOSED_DATES, SERVICES, BOOKING, publicConfig } from '../../shared/config.js';

const TZ = 'Europe/Warsaw';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const WD  = ['niedziela','poniedziałek','wtorek','środa','czwartek','piątek','sobota'];
const MON = ['','stycznia','lutego','marca','kwietnia','maja','czerwca','lipca','sierpnia','września','października','listopada','grudnia'];
const MONS = ['','sty','lut','mar','kwi','maj','cze','lip','sie','wrz','paź','lis','gru'];

/* ---------- czas w strefie Europe/Warsaw ---------- */
function nowInWarsaw() {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false })
    .formatToParts(new Date()).reduce((a, x) => (a[x.type] = x.value, a), {});
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: (+p.hour) * 60 + (+p.minute) };
}
const addDays = (date, n) => { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dow = date => new Date(date + 'T12:00:00Z').getUTCDay();
const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const toHM = m => `${String(Math.floor(m / 60)).padStart(2,'0')}:${String(m % 60).padStart(2,'0')}`;
const longDate = d => `${WD[dow(d)]}, ${+d.slice(8)} ${MON[+d.slice(5,7)]}`;
const shortDate = d => `${+d.slice(8)} ${MONS[+d.slice(5,7)]}`;
const svcById = id => SERVICES.find(s => s.id === id);

/* ---------- baza D1 ---------- */
const rowToBooking = r => ({
  id: r.id, service: r.service, dur: r.dur, price: r.price, date: r.date, time: r.time,
  name: r.name, phone: r.phone, email: r.email, note: r.note || '', status: r.status,
  reason: r.reason || '', createdAt: r.created_at, decidedAt: r.decided_at || null,
  sample: !!r.sample, emails: JSON.parse(r.emails || '[]'),
});

async function activeBookings(db, fromDate, toDate) {
  const { results } = await db.prepare(
    `SELECT * FROM bookings WHERE date >= ? AND date <= ? AND status IN ('pending','accepted') ORDER BY date, time`
  ).bind(fromDate, toDate).all();
  return (results || []).map(rowToBooking);
}

function freeTimes(date, dur, bookings, today, nowMinutes) {
  if (CLOSED_DATES.includes(date)) return [];
  const h = HOURS[dow(date)];
  if (!h) return [];
  const taken = bookings.filter(b => b.date === date).map(b => [toMin(b.time), toMin(b.time) + b.dur]);
  const limit = date === today ? nowMinutes + BOOKING.leadMinutes : -1;
  const out = [];
  for (let m = h[0] * 60; m + dur <= h[1] * 60; m += BOOKING.step) {
    if (m < limit) continue;
    if (taken.some(([a, z]) => m < z && m + dur > a)) continue;
    out.push(toHM(m));
  }
  return out;
}

function newCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return [...bytes].map(b => ALPHABET[b % ALPHABET.length]).join('');
}

/* ---------- sesja panelu (podpisane ciasteczko) ---------- */
async function hmac(value, secret) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name:'HMAC', hash:'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}
const sessionSecret = env => env.SESSION_SECRET || env.PANEL_PASSWORD || 'brak-sekretu';
async function makeToken(env) {
  const exp = String(Date.now() + 1000 * 60 * 60 * 24 * 14);
  return `${exp}.${await hmac(exp, sessionSecret(env))}`;
}
async function isAdmin(request, env) {
  const cookie = request.headers.get('Cookie') || '';
  const m = cookie.match(/salon_admin=([^;]+)/);
  if (!m) return false;
  const [exp, sig] = decodeURIComponent(m[1]).split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  return sig === await hmac(exp, sessionSecret(env));
}

/* ---------- e-maile (Resend) ---------- */
function mailFor(b, kind, reason = '') {
  const s = svcById(b.service)?.name || '';
  const when = `${longDate(b.date)}, godz. ${b.time}`;
  const first = String(b.name).trim().split(/\s+/)[0];
  const hi = `Dzień dobry ${first},`;
  const sig = `\n\nDo zobaczenia,\n${SALON.name}\n${SALON.address} · tel. ${SALON.phone}`;
  if (kind === 'received') return { subj:`Otrzymaliśmy Twoją prośbę o wizytę (${b.id})`,
    body:`${hi}\n\ndziękuję za rezerwację: ${s}, ${when}. Termin czeka teraz na moje potwierdzenie — napiszę, gdy tylko je sprawdzę.\n\nTwój kod rezerwacji: ${b.id}${sig}` };
  if (kind === 'accepted') return { subj:`Wizyta potwierdzona — ${shortDate(b.date)}, ${b.time}`,
    body:`${hi}\n\npotwierdzam Twoją wizytę: ${s}, ${when}.\n\nJeśli nie możesz przyjść, odwołaj wizytę na stronie, wpisując kod ${b.id} w sekcji „Moja rezerwacja”.${sig}` };
  if (kind === 'rejected') return { subj:`Nie mogę przyjąć rezerwacji na ${shortDate(b.date)}, ${b.time}`,
    body:`${hi}\n\nniestety nie mogę przyjąć wizyty: ${s}, ${when}.${reason ? `\n\nPowód: ${reason}` : ''}\n\nZapraszam do wyboru innego terminu na stronie — zajmie to minutę.${sig}` };
  return { subj:`Wizyta odwołana — ${shortDate(b.date)}, ${b.time}`,
    body:`${hi}\n\nTwoja wizyta (${s}, ${when}) została odwołana.${reason ? `\n\nPowód: ${reason}` : ''} Zapraszam do rezerwacji innego terminu.${sig}` };
}
function ownerMail(b) {
  const s = svcById(b.service)?.name || '';
  return { subj:`Nowa rezerwacja: ${b.name} — ${shortDate(b.date)}, ${b.time}`,
    body:`Nowa prośba o wizytę:\n\n${b.name}\ntel. ${b.phone}\n${b.email}\n\n${s}\n${longDate(b.date)}, godz. ${b.time}\n${b.note ? `Uwagi: ${b.note}\n` : ''}\nKod: ${b.id}\n\nZaakceptuj lub odrzuć w panelu salonu.` };
}
async function sendMailDetailed(env, to, subj, body) {
  if (!env.RESEND_API_KEY) return { ok: false, error: 'Brak sekretu RESEND_API_KEY w ustawieniach Cloudflare.' };
  if (!env.MAIL_FROM)      return { ok: false, error: 'Brak sekretu MAIL_FROM — adresu nadawcy, np. rezerwacje@twojadomena.pl.' };
  if (!to)                 return { ok: false, error: 'Brak adresu odbiorcy (sekret OWNER_EMAIL).' };
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: `${SALON.name} <${env.MAIL_FROM}>`, to: [to], subject: subj, text: body }),
    });
    if (r.ok) return { ok: true };
    const txt = (await r.text()).slice(0, 300);
    console.log('Resend:', r.status, txt);
    const hint = r.status === 403 || /domain/i.test(txt)
      ? ' Najczęstsza przyczyna: domena z MAIL_FROM nie ma w Resend statusu Verified.'
      : r.status === 401 ? ' Klucz RESEND_API_KEY jest nieprawidłowy.' : '';
    return { ok: false, error: `Resend odrzucił wysyłkę (${r.status}): ${txt}${hint}` };
  } catch (e) {
    console.log('Resend error:', e.message);
    return { ok: false, error: 'Nie udało się połączyć z Resend: ' + e.message };
  }
}
async function sendMail(env, to, subj, body) {
  return (await sendMailDetailed(env, to, subj, body)).ok;
}

/* ---------- pomocnicze ---------- */
const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', ...headers } });

/* ---------- router ---------- */
export async function onRequest(context) {
  const { request, env, params } = context;
  const route = Array.isArray(params.route) ? params.route.join('/') : (params.route || '');
  const url = new URL(request.url);
  const db = env.DB;
  const { date: today, minutes: nowMin } = nowInWarsaw();
  let body = {};
  if (request.method === 'POST') { try { body = await request.json(); } catch { body = {}; } }
  const admin = await isAdmin(request, env);
  const needDb = () => { if (!db) throw new Error('Brak bazy D1 — dodaj powiązanie „DB” w ustawieniach projektu.'); };

  try {
    switch (route) {

      case 'config':
        return json(publicConfig());

      case 'calendar': {
        needDb();
        const s = svcById(url.searchParams.get('service') || '');
        if (!s) return json({ error: 'Nieznana usługa.' }, 400);
        const last = addDays(today, BOOKING.daysAhead);
        const active = await activeBookings(db, today, last);
        const days = [];
        for (let i = 0; i < BOOKING.daysAhead; i++) {
          const date = addDays(today, i);
          days.push({ date, closed: !HOURS[dow(date)] || CLOSED_DATES.includes(date), times: freeTimes(date, s.dur, active, today, nowMin) });
        }
        return json({ days });
      }

      case 'book': {
        needDb();
        if (body.company) return json({ error: 'Odrzucono.' }, 400);        // pułapka na boty
        const s = svcById(String(body.service || ''));
        if (!s) return json({ error: 'Wybierz usługę.' }, 400);
        const date = String(body.date || '').slice(0, 10);
        const time = String(body.time || '').slice(0, 5);
        const name = String(body.name || '').trim().slice(0, 80);
        const phone = String(body.phone || '').trim().slice(0, 24);
        const email = String(body.email || '').trim().slice(0, 120);
        const note = String(body.note || '').trim().slice(0, 500);

        const errors = {};
        if (name.length < 3) errors.name = 'Wpisz imię i nazwisko.';
        if (phone.replace(/\D/g, '').length < 9) errors.phone = 'Numer powinien mieć 9 cyfr.';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) errors.email = 'Sprawdź adres e-mail.';
        if (!body.consent) errors.consent = 'Zaznacz zgodę, żebym mógł obsłużyć rezerwację.';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) errors.slot = 'Wybierz termin.';
        if (Object.keys(errors).length) return json({ errors }, 422);
        if (date < today || date > addDays(today, BOOKING.daysAhead)) return json({ error: 'Ten termin jest poza zakresem rezerwacji.' }, 400);

        const ipHash = (await hmac(request.headers.get('CF-Connecting-IP') || '', sessionSecret(env))).slice(0, 16);
        const recent = await db.prepare(`SELECT COUNT(*) AS n FROM bookings WHERE ip = ? AND created_at > ?`)
          .bind(ipHash, new Date(Date.now() - 3600000).toISOString()).first();
        if ((recent?.n || 0) >= 5) return json({ error: 'Za dużo rezerwacji z tego urządzenia. Spróbuj za godzinę albo zadzwoń.' }, 429);

        const active = await activeBookings(db, date, date);
        if (!freeTimes(date, s.dur, active, today, nowMin).includes(time))
          return json({ taken: true, error: 'Ktoś właśnie zajął tę godzinę — wybierz inną.' }, 409);

        const b = { id: newCode(), service: s.id, dur: s.dur, price: s.price, date, time, name, phone, email, note,
                    status: BOOKING.autoAccept ? 'accepted' : 'pending', createdAt: new Date().toISOString(), sample: false, emails: [] };
        b.emails.push({ kind:'received', at:b.createdAt, ...mailFor(b, 'received') });
        if (BOOKING.autoAccept) b.emails.push({ kind:'accepted', at:b.createdAt, ...mailFor(b, 'accepted') });

        try {
          await db.prepare(`INSERT INTO bookings (id, service, dur, price, date, time, name, phone, email, note, status, created_at, sample, ip, emails)
                            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0,?,?)`)
            .bind(b.id, b.service, b.dur, b.price, b.date, b.time, b.name, b.phone, b.email, b.note, b.status, b.createdAt, ipHash, JSON.stringify(b.emails)).run();
        } catch (e) {
          if (String(e.message).includes('UNIQUE')) return json({ taken: true, error: 'Ktoś właśnie zajął tę godzinę — wybierz inną.' }, 409);
          throw e;
        }

        const m = b.emails[b.emails.length - 1];
        await sendMail(env, b.email, m.subj, m.body);
        const om = ownerMail(b);
        await sendMail(env, env.OWNER_EMAIL || SALON.email, om.subj, om.body);
        return json({ booking: b });
      }

      case 'status': {
        needDb();
        const code = (url.searchParams.get('code') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
        if (!code) return json({ booking: null });
        const row = await db.prepare(`SELECT * FROM bookings WHERE id = ?`).bind(code).first();
        return json({ booking: row ? rowToBooking(row) : null });
      }

      case 'cancel': {
        needDb();
        const code = String(body.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
        const row = await db.prepare(`SELECT * FROM bookings WHERE id = ?`).bind(code).first();
        if (!row) return json({ error: 'Nie znaleziono rezerwacji o tym kodzie.' }, 404);
        const b = rowToBooking(row);
        if (b.status !== 'pending' && b.status !== 'accepted') return json({ error: 'Ta wizyta jest już nieaktywna.' }, 400);
        if (b.date < today) return json({ error: 'Nie można odwołać minionej wizyty.' }, 400);
        const m = mailFor(b, 'cancelled', 'odwołana przez klienta');
        b.status = 'cancelled';
        b.emails.push({ kind:'cancelled', at:new Date().toISOString(), ...m });
        await db.prepare(`UPDATE bookings SET status='cancelled', decided_at=?, emails=? WHERE id=?`)
          .bind(new Date().toISOString(), JSON.stringify(b.emails), b.id).run();
        await sendMail(env, env.OWNER_EMAIL || SALON.email, `Klient odwołał wizytę — ${shortDate(b.date)}, ${b.time}`,
          `${b.name} odwołał(a) wizytę: ${longDate(b.date)}, godz. ${b.time}.\nTermin jest znów wolny.`);
        return json({ booking: b });
      }

      /* ---------------- panel ---------------- */

      case 'login': {
        if (!env.PANEL_PASSWORD) return json({ error: 'Nie ustawiono hasła (PANEL_PASSWORD) w ustawieniach Cloudflare.' }, 500);
        await new Promise(r => setTimeout(r, 300));
        if (String(body.password || '') !== env.PANEL_PASSWORD) return json({ error: 'Błędne hasło.' }, 401);
        const token = await makeToken(env);
        return json({ ok: true }, 200, { 'Set-Cookie': `salon_admin=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=1209600` });
      }

      case 'logout':
        return json({ ok: true }, 200, { 'Set-Cookie': 'salon_admin=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0' });

      case 'admin': {
        if (!admin) return json({ error: 'Zaloguj się.' }, 401);
        needDb();
        const { results } = await db.prepare(
          `SELECT * FROM bookings WHERE date >= ? OR status = 'pending' ORDER BY date, time`
        ).bind(addDays(today, -60)).all();
        return json({ bookings: (results || []).map(rowToBooking), today, mailReady: !!(env.RESEND_API_KEY && env.MAIL_FROM) });
      }

      case 'decide': {
        if (!admin) return json({ error: 'Zaloguj się.' }, 401);
        needDb();
        const code = String(body.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
        const status = String(body.status || '');
        const reason = String(body.reason || '').trim().slice(0, 300);
        if (!['accepted','rejected','cancelled'].includes(status)) return json({ error: 'Nieznana operacja.' }, 400);
        const row = await db.prepare(`SELECT * FROM bookings WHERE id = ?`).bind(code).first();
        if (!row) return json({ error: 'Nie znaleziono rezerwacji.' }, 404);
        const b = rowToBooking(row);
        const m = mailFor(b, status, reason);
        b.status = status; b.reason = reason || b.reason;
        b.emails.push({ kind: status, at: new Date().toISOString(), ...m });
        await db.prepare(`UPDATE bookings SET status=?, reason=?, decided_at=?, emails=? WHERE id=?`)
          .bind(status, b.reason || null, new Date().toISOString(), JSON.stringify(b.emails), b.id).run();
        const res = await sendMailDetailed(env, b.email, m.subj, m.body);
        return json({ booking: b, mail: m, sent: res.ok, mailError: res.error || null });
      }

      case 'seed': {
        if (!admin) return json({ error: 'Zaloguj się.' }, 401);
        needDb();
        const P = [
          [0,'10:00','dam','Anna Kowalska','601 234 567','anna.k@example.com','Chcę zachować długość, tylko odświeżyć','accepted'],
          [0,'13:00','bro','Marek Nowak','602 345 678','marek.nowak@example.com','','accepted'],
          [1,'09:30','kol','Katarzyna Wiśniewska','603 456 789','kasia.w@example.com','Kolor zbliżony do obecnego, trochę cieplejszy','pending'],
          [1,'15:00','mes','Tomasz Zieliński','604 567 890','tomek.z@example.com','','pending'],
          [2,'11:00','dz','Ola Lewandowska','605 678 901','ola.lew@example.com','Strzyżenie dla syna (7 lat)','pending'],
          [3,'12:00','mod','Julia Kamińska','606 789 012','julia.k@example.com','Wesele w sobotę','accepted'],
        ];
        const open = [];
        for (let i = 0; i < 21 && open.length < 6; i++) { const d = addDays(today, i); if (HOURS[dow(d)] && !CLOSED_DATES.includes(d)) open.push(d); }
        let added = 0;
        for (const [di, time, sid, name, phone, email, note, status] of P) {
          const s = svcById(sid), date = open[Math.min(di, open.length - 1)];
          if (!s || !date) continue;
          const active = await activeBookings(db, date, date);
          if (!freeTimes(date, s.dur, active, today, nowMin).includes(time)) continue;
          const b = { id:newCode(), service:sid, dur:s.dur, price:s.price, date, time, name, phone, email, note, status,
                      createdAt:new Date(Date.now() - 3600000 * (1 + di)).toISOString(), sample:true, emails:[] };
          b.emails.push({ kind:'received', at:b.createdAt, ...mailFor(b, 'received') });
          if (status === 'accepted') b.emails.push({ kind:'accepted', at:b.createdAt, ...mailFor(b, 'accepted') });
          try {
            await db.prepare(`INSERT INTO bookings (id, service, dur, price, date, time, name, phone, email, note, status, created_at, sample, ip, emails)
                              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,'seed',?)`)
              .bind(b.id, b.service, b.dur, b.price, b.date, b.time, b.name, b.phone, b.email, b.note, b.status, b.createdAt, JSON.stringify(b.emails)).run();
            added++;
          } catch {}
        }
        return json({ ok: true, added });
      }

      case 'unseed': {
        if (!admin) return json({ error: 'Zaloguj się.' }, 401);
        needDb();
        await db.prepare(`DELETE FROM bookings WHERE sample = 1`).run();
        return json({ ok: true });
      }

      case 'testmail': {
        if (!admin) return json({ error: 'Zaloguj się.' }, 401);
        const to = env.OWNER_EMAIL || SALON.email;
        const res = await sendMailDetailed(env, to, `Test wysyłki — ${SALON.name}`,
          'To jest wiadomość testowa z Twojej strony.\n\nJeśli ją widzisz, powiadomienia o rezerwacjach będą działać.');
        return json({ sent: res.ok, to, from: env.MAIL_FROM || null, error: res.error || null });
      }

      default:
        return json({ error: 'Nieznane żądanie.' }, 404);
    }
  } catch (e) {
    console.log('Błąd:', e.message);
    return json({ error: e.message || 'Błąd serwera.' }, 500);
  }
}
