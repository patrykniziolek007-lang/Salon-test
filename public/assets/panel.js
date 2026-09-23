/* Panel salonu: logowanie, akceptacja rezerwacji, grafik, historia (wersja Cloudflare). */
(() => {
let SERVICES = [], HOURS = {};
const WD = ['niedziela','poniedziałek','wtorek','środa','czwartek','piątek','sobota'];
const WDS = ['Nd','Pn','Wt','Śr','Cz','Pt','So'];
const MON = ['stycznia','lutego','marca','kwietnia','maja','czerwca','lipca','sierpnia','września','października','listopada','grudnia'];
const MONS = ['sty','lut','mar','kwi','maj','cze','lip','sie','wrz','paź','lis','gru'];

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad = n => String(n).padStart(2,'0');
const isoOf = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const fromIso = s => { const [y,m,d] = s.split('-').map(Number); return new Date(y,m-1,d); };
const addDays = (d,n) => { const x = new Date(d); x.setDate(x.getDate()+n); return x; };
const longDate = s => { const d = fromIso(s); return `${WD[d.getDay()]}, ${d.getDate()} ${MON[d.getMonth()]}`; };
const shortDate = s => { const d = fromIso(s); return `${WDS[d.getDay()]} ${d.getDate()} ${MONS[d.getMonth()]}`; };
const toMin = t => { const [h,m] = t.split(':').map(Number); return h*60+m; };
const toHM = m => `${pad(Math.floor(m/60))}:${pad(m%60)}`;
const svcById = id => SERVICES.find(s => s.id === id);
const price = s => (s.from ? 'od ' : '') + s.price + ' zł';
const durTxt = m => m < 60 ? `${m} min` : (m % 60 ? `${Math.floor(m/60)} h ${m%60} min` : `${m/60} h`);
const first = n => String(n||'').trim().split(/\s+/)[0];
const ICON = {
  check:'<svg class="i" viewBox="0 0 24 24"><path d="m5 12 5 5L20 7"/></svg>',
  x:'<svg class="i" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  send:'<svg class="i" viewBox="0 0 24 24"><path d="M22 2 11 13"/><path d="m22 2-7 20-4-9-9-4Z"/></svg>',
  mail:'<svg class="i" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
  phone:'<svg class="i" viewBox="0 0 24 24"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>',
};
const STATUS = {
  pending:{t:'Czeka na akceptację', c:'st-pending'},
  accepted:{t:'Potwierdzona', c:'st-accepted'},
  rejected:{t:'Odrzucona', c:'st-rejected'},
  cancelled:{t:'Odwołana', c:'st-cancelled'},
};
const pill = s => `<span class="pill ${STATUS[s].c}">${STATUS[s].t}</span>`;
const active = b => b.status === 'pending' || b.status === 'accepted';
const byWhen = (a,b) => (a.date+a.time).localeCompare(b.date+b.time);

const S = { bookings:[], today:isoOf(new Date()), tab:'pending', gridDate:null, rejecting:null, seen:null, busy:false, mailWarned:false };

async function api(action, body){
  const r = await fetch('/api/' + action, body
    ? {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)} : {});
  if (r.status === 401) { showLogin(); return {ok:false, data:{}, unauth:true}; }
  let data = {}; try { data = await r.json(); } catch {}
  return {ok:r.ok, data};
}
async function load(quiet){
  const {ok, data, unauth} = await api('admin');
  if (!ok) { if (!quiet && !unauth) toast('Nie udało się pobrać rezerwacji.'); return; }
  if (data.mailReady === false && !S.mailWarned) { S.mailWarned = true; toast('Uwaga: wysyłka e-maili nie jest skonfigurowana (RESEND_API_KEY / MAIL_FROM).'); }
  const pend = data.bookings.filter(b => b.status === 'pending').map(b => b.id);
  if (S.seen) {
    const fresh = pend.filter(id => !S.seen.includes(id));
    const nb = fresh.length && data.bookings.find(b => b.id === fresh[fresh.length-1]);
    if (nb) toast(`Nowa rezerwacja: ${first(nb.name)}, ${shortDate(nb.date)} ${nb.time}`);
  }
  S.seen = pend; S.bookings = data.bookings; S.today = data.today;
  render();
}

function render(){
  const t = S.today, all = S.bookings;
  const pending = all.filter(b => b.status === 'pending').sort(byWhen);
  const todayN  = all.filter(b => b.date === t && b.status === 'accepted').length;
  const wkEnd   = isoOf(addDays(fromIso(t), 7));
  const wk      = all.filter(b => b.status === 'accepted' && b.date >= t && b.date < wkEnd).reduce((s,b) => s + (b.price||0), 0);
  $('#p-date').textContent = longDate(t).replace(/^./, c => c.toUpperCase());
  $('#p-stats').innerHTML = `
    <div class="stat ${pending.length?'hot':''}"><b>${pending.length}</b><span>do akceptacji</span></div>
    <div class="stat"><b>${todayN}</b><span>wizyt dziś</span></div>
    <div class="stat"><b>${wk}<small style="font-size:.9rem"> zł</small></b><span>7 dni (potw.)</span></div>`;
  const bdg = $('#tb-badge'); bdg.hidden = !pending.length; bdg.textContent = pending.length;
  document.title = (pending.length ? `(${pending.length}) ` : '') + 'Panel salonu';
  document.querySelectorAll('.tabbar button').forEach(x => x.setAttribute('aria-current', x.dataset.tab === S.tab ? 'page' : 'false'));
  $('#p-title').textContent = {pending:'Do akceptacji', schedule:'Grafik', history:'Historia'}[S.tab];
  const body = $('#p-body');
  const tools = `<div class="sampler"><span>Narzędzia testowe — użyj ich, zanim wpuścisz tu klientów.</span>
    <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center">
      <button type="button" class="btn btn-ghost btn-sm" id="seed">Wczytaj przykłady</button>
      ${all.some(b => b.sample) ? `<button type="button" class="btn btn-ghost btn-sm" id="unseed">Usuń przykłady</button>` : ''}
      <button type="button" class="btn btn-ghost btn-sm" id="testmail">Wyślij testowy e-mail</button>
    </div></div>`;

  if (S.tab === 'pending') {
    body.innerHTML = `<div class="ph"><h2>Nowe prośby</h2><span class="muted" style="font-size:.84rem">${pending.length ? 'najbliższe na górze' : ''}</span></div>` +
      (pending.length ? pending.map(card).join('')
        : `<div class="sampler"><span>${ICON.check}</span><span>Wszystko zaakceptowane. Nowe prośby pojawią się tu same.</span></div>`) + tools;
  }
  if (S.tab === 'schedule') {
    const days = [];
    for (let i = 0; i < 21; i++) { const d = addDays(fromIso(t), i); if (HOURS[d.getDay()]) days.push(isoOf(d)); }
    if (!S.gridDate || !days.includes(S.gridDate)) S.gridDate = days[0];
    const ds = S.gridDate, h = HOURS[fromIso(ds).getDay()];
    const dayB = all.filter(b => b.date === ds && active(b)).sort(byWhen);
    const rows = []; let m = h[0]*60; const end = h[1]*60;
    while (m < end) {
      const b = dayB.find(x => toMin(x.time) === m);
      if (b) { rows.push(`<div class="slot"><span class="t">${toHM(m)}</span><div class="c"><div class="appt ${b.status==='pending'?'pend':''}">
        <b>${esc(b.name)}${b.sample?'<span class="tag">przykład</span>':''}</b>
        <span>${esc(svcById(b.service)?.name || '')} · do ${toHM(m+b.dur)}${b.status==='pending'?' · czeka na akceptację':''}</span></div></div></div>`); m += b.dur; continue; }
      const inside = dayB.find(x => toMin(x.time) < m && toMin(x.time)+x.dur > m);
      if (inside) { m = toMin(inside.time)+inside.dur; continue; }
      const next = dayB.find(x => toMin(x.time) > m), gapEnd = Math.min(next ? toMin(next.time) : end, end);
      rows.push(`<div class="slot free"><span class="t">${toHM(m)}</span><div class="c">wolne do ${toHM(gapEnd)}</div></div>`); m = gapEnd;
    }
    body.innerHTML = `<div class="ph"><h2>${esc(longDate(ds)).replace(/^./,c=>c.toUpperCase())}</h2><span class="muted tnum" style="font-size:.84rem">${h[0]}:00–${h[1]}:00</span></div>
      <div class="daychips" role="group" aria-label="Dzień">${days.map(d => { const x = fromIso(d), has = all.some(b => b.date===d && active(b));
        return `<button type="button" data-gd="${d}" aria-pressed="${d===ds}">${WDS[x.getDay()]}<b>${x.getDate()}</b><i class="${has?'':'no'}"></i></button>`; }).join('')}</div>
      <div class="sched">${rows.join('')}</div>` + tools;
  }
  if (S.tab === 'history') {
    const up   = all.filter(b => b.status === 'accepted' && b.date >= t).sort(byWhen);
    const hist = all.filter(b => !active(b) || b.date < t).sort((a,b) => byWhen(b,a)).slice(0, 40);
    body.innerHTML = `<div class="ph"><h2>Potwierdzone</h2></div>` + (up.length ? up.map(card).join('') : `<p class="muted">Brak nadchodzących wizyt.</p>`) +
      `<div class="ph"><h2>Zakończone i odrzucone</h2></div>` + (hist.length ? hist.map(card).join('') : `<p class="muted">Pusto.</p>`) + tools;
  }
}
function card(b){
  const s = svcById(b.service), rej = S.rejecting === b.id;
  const actions = b.status === 'pending'
    ? (rej
      ? `<div class="reject-box"><label for="rr-${b.id}" style="font-size:.84rem;font-weight:600">Powód odmowy (klient zobaczy go w e-mailu)</label>
          <textarea id="rr-${b.id}" placeholder="np. Tego dnia salon jest zamknięty z powodu szkolenia."></textarea>
          <div class="bc-actions"><button type="button" class="btn btn-ghost btn-sm" data-rejcancel="1">Anuluj</button>
          <button type="button" class="btn btn-danger btn-sm" data-rejsend="${b.id}">${ICON.send}Wyślij odmowę</button></div></div>`
      : `<div class="bc-actions"><button type="button" class="btn btn-danger" data-reject="${b.id}">${ICON.x}Odrzuć</button>
          <button type="button" class="btn btn-gold" data-accept="${b.id}">${ICON.check}Akceptuj</button></div>`)
    : b.status === 'accepted' && b.date >= S.today
      ? `<div class="bc-actions"><button type="button" class="btn btn-ghost btn-sm" data-mails="${b.id}">${ICON.mail}E-maile</button>
          <button type="button" class="btn btn-danger btn-sm" data-ocancel="${b.id}">Odwołaj</button></div>`
      : `<div class="bc-actions"><button type="button" class="btn btn-ghost btn-sm" data-mails="${b.id}" style="grid-column:1/-1">${ICON.mail}Pokaż ostatni e-mail</button></div>`;
  return `<article class="bcard ${b.status==='pending'?'pending':''}">
    <div class="bc-top"><div class="bc-when">${esc(shortDate(b.date))}, ${esc(b.time)}<small>${esc(s?.name || '')} · ${durTxt(b.dur)}${s?' · '+price(s):''}</small></div>${pill(b.status)}</div>
    <div class="bc-who"><b>${esc(b.name)}${b.sample?'<span class="tag">przykład</span>':''}</b>
      <a href="tel:${esc(String(b.phone).replace(/\s/g,''))}">${ICON.phone}${esc(b.phone)}</a>
      <a href="mailto:${esc(b.email)}">${ICON.mail}${esc(b.email)}</a></div>
    ${b.note ? `<div class="bc-note">„${esc(b.note)}”</div>` : ''}
    ${b.reason ? `<div class="bc-note">Powód: ${esc(b.reason)}</div>` : ''}
    <span class="muted" style="font-size:.74rem">Kod ${esc(b.id)} · wysłano ${new Date(b.createdAt).toLocaleString('pl-PL',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</span>
    ${actions}</article>`;
}
async function decide(code, status, reason){
  if (S.busy) return; S.busy = true;
  const {ok, data} = await api('decide', {code, status, reason: reason || ''});
  S.busy = false;
  if (!ok) { toast(data.error || 'Nie udało się zapisać.'); return; }
  S.rejecting = null;
  await load(true);
  const lbl = {accepted:'Zaakceptowano', rejected:'Odrzucono', cancelled:'Odwołano'}[status];
  const who = first(data.booking.name);
  if (data.sent) toast(`${lbl} · e-mail wysłany do ${who}`, 'Pokaż e-mail', () => showMail(data.booking.email, data.mail));
  else toast(`${lbl}. E-mail NIE został wysłany — sprawdź ustawienia poczty.`, 'Pokaż treść', () => showMail(data.booking.email, data.mail));
}
function showMail(to, m){
  $('#mail-to').textContent = to; $('#mail-subj').textContent = m.subj; $('#mail-body').textContent = m.body;
  $('#maildlg').showModal();
}
let tt;
function toast(text, action, fn){
  const el = $('#toast'), a = $('#toast-a');
  $('#toast-t').textContent = text; a.hidden = !action;
  if (action) { a.textContent = action; a.onclick = () => { el.classList.remove('show'); fn(); }; }
  el.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => el.classList.remove('show'), action ? 7000 : 3600);
}

document.addEventListener('click', async e => {
  const t = e.target.closest('button'); if (!t) return;
  const d = t.dataset;
  if (d.tab) { S.tab = d.tab; S.rejecting = null; render(); window.scrollTo(0,0); return; }
  if (d.accept) return decide(d.accept, 'accepted');
  if (d.reject) { S.rejecting = d.reject; render(); $('#rr-'+d.reject)?.focus(); return; }
  if (d.rejcancel) { S.rejecting = null; render(); return; }
  if (d.rejsend) return decide(d.rejsend, 'rejected', ($('#rr-'+d.rejsend)?.value || '').trim());
  if (d.ocancel) { if (confirm('Odwołać tę wizytę i powiadomić klienta?')) decide(d.ocancel, 'cancelled', 'odwołana przez salon'); return; }
  if (d.mails) { const b = S.bookings.find(x => x.id === d.mails); const m = b?.emails?.[b.emails.length-1]; if (m) showMail(b.email, m); return; }
  if (d.gd) { S.gridDate = d.gd; render(); return; }
  if (t.id === 'seed')   { t.disabled = true; await api('seed');   await load(true); toast('Wczytano przykładowe rezerwacje'); return; }
  if (t.id === 'unseed') { t.disabled = true; await api('unseed'); await load(true); toast('Usunięto przykłady'); return; }
  if (t.id === 'testmail') {
    t.disabled = true; const {data} = await api('testmail'); t.disabled = false;
    toast(data.sent ? `Wysłano test na ${data.to} — sprawdź skrzynkę (także spam).`
                    : `Nie udało się wysłać (metoda: ${data.method}). Zmień ustawienia poczty w config.php.`);
    return;
  }
  if (t.id === 'mail-close') $('#maildlg').close();
});

/* ---------- logowanie ---------- */
function showLogin(){
  $('#panel').hidden = true; $('#login').hidden = false;
  $('#password')?.focus();
}
function showPanel(){ $('#login').hidden = true; $('#panel').hidden = false; }

document.addEventListener('submit', async e => {
  if (e.target.id !== 'loginform') return;
  e.preventDefault();
  const err = $('#login-err'), btn = e.target.querySelector('button[type=submit]');
  err.hidden = true; btn.disabled = true; btn.textContent = 'Sprawdzam…';
  const r = await fetch('/api/login', {method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({password: $('#password').value})});
  let data = {}; try { data = await r.json(); } catch {}
  btn.disabled = false; btn.textContent = 'Zaloguj';
  if (!r.ok) { err.textContent = data.error || 'Błędne hasło.'; err.hidden = false; return; }
  $('#password').value = '';
  showPanel(); S.seen = null; load();
});
document.addEventListener('click', async e => {
  if (e.target.id !== 'logout') return;
  await fetch('/api/logout', {method:'POST'});
  showLogin();
});

/* ---------- start ---------- */
(async () => {
  const cfg = await fetch('/api/config').then(r => r.json()).catch(() => null);
  if (cfg) {
    SERVICES = cfg.services; HOURS = cfg.hours;
    $('#login-brand').textContent = cfg.salon.name;
    document.title = 'Panel — ' + cfg.salon.name;
  }
  const {ok} = await api('admin');
  if (ok) { showPanel(); load(); } else showLogin();
  setInterval(() => { if (!document.hidden && !$('#panel').hidden) load(true); }, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !$('#panel').hidden) load(true); });
})();
})();
