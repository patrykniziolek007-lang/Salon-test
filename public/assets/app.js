/* Strona klienta: rezerwacja + sprawdzanie statusu (wersja Cloudflare). */
(() => {
let SERVICES = [], CFG = null;
const WD = ['niedziela','poniedziałek','wtorek','środa','czwartek','piątek','sobota'];
const WDS = ['Nd','Pn','Wt','Śr','Cz','Pt','So'];
const MON = ['stycznia','lutego','marca','kwietnia','maja','czerwca','lipca','sierpnia','września','października','listopada','grudnia'];
const MONS = ['sty','lut','mar','kwi','maj','cze','lip','sie','wrz','paź','lis','gru'];

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad = n => String(n).padStart(2,'0');
const isoToday = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; };
const fromIso = s => { const [y,m,d] = s.split('-').map(Number); return new Date(y,m-1,d); };
const longDate = s => { const d = fromIso(s); return `${WD[d.getDay()]}, ${d.getDate()} ${MON[d.getMonth()]}`; };
const shortDate = s => { const d = fromIso(s); return `${WDS[d.getDay()]} ${d.getDate()} ${MONS[d.getMonth()]}`; };
const svcById = id => SERVICES.find(s => s.id === id);
const price = s => (s.from ? 'od ' : '') + s.price + ' zł';
const durTxt = m => m < 60 ? `${m} min` : (m % 60 ? `${Math.floor(m/60)} h ${m%60} min` : `${m/60} h`);
const first = n => String(n||'').trim().split(/\s+/)[0];
const safeGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
const safeSet = (k,v) => { try { localStorage.setItem(k,v); } catch {} };
const ICON = {
  clock:'<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  check:'<svg class="i" viewBox="0 0 24 24"><path d="m5 12 5 5L20 7"/></svg>',
  x:'<svg class="i" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  send:'<svg class="i" viewBox="0 0 24 24"><path d="M22 2 11 13"/><path d="m22 2-7 20-4-9-9-4Z"/></svg>',
  mail:'<svg class="i" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
  cal:'<svg class="i" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  phone:'<svg class="i" viewBox="0 0 24 24"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>',
};
const STATUS = {
  pending:{t:'Czeka na akceptację', c:'st-pending'},
  accepted:{t:'Potwierdzona', c:'st-accepted'},
  rejected:{t:'Odrzucona', c:'st-rejected'},
  cancelled:{t:'Odwołana', c:'st-cancelled'},
};
const pill = s => `<span class="pill ${STATUS[s].c}">${STATUS[s].t}</span>`;

const S = { sel:{service:null,date:null,time:null}, step:1, form:{name:'',phone:'',email:'',note:'',consent:false},
            errors:{}, created:null, cal:{}, loading:false, lookup:null, lookupMiss:false };

async function api(action, opts = {}){
  const q = opts.query ? '?' + String(opts.query).replace(/^[?&]/, '') : '';
  const r = await fetch(`/api/${action}` + q, opts.body
    ? {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(opts.body)} : {});
  let data = {};
  try { data = await r.json(); } catch {}
  return {ok:r.ok, status:r.status, data};
}
async function calendarFor(sid){
  if (S.cal[sid]) return S.cal[sid];
  const {data} = await api('calendar', {query:`&service=${encodeURIComponent(sid)}`});
  S.cal[sid] = data.days || [];
  return S.cal[sid];
}
const clearCal = () => { S.cal = {}; };
const timesFor = (sid, date) => (S.cal[sid] || []).find(d => d.date === date)?.times || [];

/* ---------- najbliższe wolne godziny w nagłówku ---------- */
async function renderNext(){
  const sid = SERVICES.slice().sort((a,b) => a.dur - b.dur)[0].id;
  const days = await calendarFor(sid);
  const out = days.filter(d => d.times.length).slice(0,3);
  $('#next-slots').innerHTML = out.length ? out.map(d => `
    <div class="nextday"><span class="d">${d.date === isoToday() ? 'Dziś · ' : ''}${esc(longDate(d.date))}</span>
      <div class="chips">${d.times.slice(0,4).map(t => `<button type="button" class="chip" data-quick="${sid}|${d.date}|${t}">${t}</button>`).join('')}</div></div>`).join('')
    : `<p class="sub" style="margin-top:14px">Brak wolnych terminów w najbliższych tygodniach. Zadzwoń, poszukamy czegoś razem.</p>`;
}

/* ---------- kreator rezerwacji ---------- */
function renderSteps(){
  const labels = ['Usługa','Termin','Dane','Gotowe'];
  const can = n => n === 1 || (n === 2 && S.sel.service) || (n === 3 && S.sel.time);
  $('#steps').innerHTML = labels.map((l,i) => {
    const n = i+1, on = S.step === n, done = (S.step > n && S.step !== 4) || (S.step === 4 && n < 4);
    const dis = S.step === 4 || !can(n);
    return `<button type="button" data-step="${n}" class="${on?'on':''} ${done?'done':''}" ${dis?'disabled':''} ${on?'aria-current="step"':''}><span>${done?'✓':n}</span>${l}</button>`;
  }).join('');
}
function renderSummary(){
  const s = svcById(S.sel.service);
  if (S.step === 4 && S.created) {
    $('#summary').innerHTML = `<h4>Co dalej</h4>
      <div class="note">${ICON.mail}<span>${CFG.booking.autoAccept ? 'Potwierdzenie wysłaliśmy na' : 'Gdy potwierdzę wizytę, dostaniesz e-mail na'} <b>${esc(S.created.email)}</b>.</span></div>
      <div class="note">${ICON.cal}<span>Status sprawdzisz w każdej chwili w sekcji „Moja rezerwacja”.</span></div>`;
    return;
  }
  $('#summary').innerHTML = `<h4>Twoja wizyta</h4>
    <div class="sumrow"><span>Usługa</span><span>${s ? esc(s.name) : '—'}</span></div>
    <div class="sumrow"><span>Czas trwania</span><span>${s ? durTxt(s.dur) : '—'}</span></div>
    <div class="sumrow"><span>Termin</span><span>${S.sel.date ? esc(shortDate(S.sel.date)) + (S.sel.time ? ', ' + S.sel.time : '') : '—'}</span></div>
    <div class="sumtotal"><span class="muted">Do zapłaty w salonie</span><b class="tnum">${s ? price(s) : '—'}</b></div>
    <div class="note">${ICON.check}<span>Płacisz na miejscu. Rezerwacja jest bezpłatna.</span></div>`;
}
function renderBooking(){
  renderSteps(); renderSummary();
  const body = $('#bk-body');
  if (S.step === 1) {
    body.innerHTML = `<h3>Wybierz usługę</h3><p class="muted">Czas wizyty dopasuję do wybranej usługi.</p>
      <div class="svc-list">${SERVICES.map(s => `<button type="button" class="svc" data-svc="${s.id}" aria-pressed="${S.sel.service===s.id}">
        <b>${esc(s.name)}</b><span class="pr">${price(s)}</span><small>${durTxt(s.dur)} · ${esc(s.desc)}</small></button>`).join('')}</div>`;
  }
  if (S.step === 2) {
    const s = svcById(S.sel.service), days = S.cal[s.id] || [];
    if (S.loading && !days.length) { body.innerHTML = `<h3>Wybierz termin</h3><div class="empty">Sprawdzam wolne godziny…</div>`; return; }
    if (!S.sel.date || !days.some(d => d.date === S.sel.date)) S.sel.date = (days.find(d => d.times.length) || days[0] || {}).date;
    const times = timesFor(s.id, S.sel.date);
    if (S.sel.time && !times.includes(S.sel.time)) S.sel.time = null;
    body.innerHTML = `<h3>Wybierz termin</h3><p class="muted">${esc(s.name)} · ${durTxt(s.dur)}. Pokazuję tylko godziny, w których zmieści się cała wizyta.</p>
      <div class="days" role="group" aria-label="Dzień">${days.map(d => {
        const dt = fromIso(d.date), n = d.times.length;
        return `<button type="button" class="day" data-date="${d.date}" aria-pressed="${S.sel.date===d.date}" ${d.closed||!n?'disabled':''} aria-label="${esc(longDate(d.date))}${d.closed?', zamknięte':`, ${n} wolnych`}">
          <span class="w">${WDS[dt.getDay()]}</span><span class="n">${dt.getDate()}</span><span class="m">${MONS[dt.getMonth()]}</span>
          <span class="f ${n?'':'none'}">${d.closed?'zamkn.':n?n+' wolne':'brak'}</span></button>`; }).join('')}</div>
      <p class="label">${S.sel.date ? esc(longDate(S.sel.date)) : ''}</p>
      ${times.length ? `<div class="times" role="group" aria-label="Godzina">${times.map(t => `<button type="button" class="time" data-time="${t}" aria-pressed="${S.sel.time===t}">${t}</button>`).join('')}</div>`
        : `<div class="empty">Tego dnia nie ma już wolnych godzin — wybierz inny dzień.</div>`}
      <div class="row-actions"><button type="button" class="btn btn-ghost" data-step="1">Wstecz</button>
        <button type="button" class="btn btn-gold" data-step="3" ${S.sel.time?'':'disabled'}>Dalej: Twoje dane</button></div>`;
    body.querySelector('.day[aria-pressed="true"]')?.scrollIntoView({block:'nearest', inline:'nearest'});
  }
  if (S.step === 3) {
    const f = S.form, e = S.errors;
    const fld = (id, label, type, ac, hint) => `<div class="field ${e[id]?'invalid':''}"><label for="f-${id}">${label}</label>
      <input id="f-${id}" name="${id}" type="${type}" autocomplete="${ac}" value="${esc(f[id])}" ${e[id]?`aria-invalid="true" aria-describedby="e-${id}"`:''}>
      ${e[id] ? `<p class="err" id="e-${id}">${esc(e[id])}</p>` : hint ? `<p class="hint">${hint}</p>` : ''}</div>`;
    body.innerHTML = `<h3>Twoje dane</h3><p class="muted">Potrzebuję ich, żeby potwierdzić wizytę i w razie czego się skontaktować.</p>
      <form class="form" id="bkform" novalidate>
        <div class="full">${fld('name','Imię i nazwisko','text','name')}</div>
        ${fld('phone','Telefon','tel','tel','9 cyfr, np. 600 123 456')}
        ${fld('email','E-mail','email','email','Tu wyślę potwierdzenie')}
        <div class="field full"><label for="f-note">Uwagi <span class="muted" style="font-weight:400">(opcjonalnie)</span></label>
          <textarea id="f-note" name="note" placeholder="np. chcę tylko podciąć końcówki">${esc(f.note)}</textarea></div>
        <div style="position:absolute;left:-9999px" aria-hidden="true"><input id="f-company" name="company" tabindex="-1" autocomplete="off"></div>
        <div class="full"><label class="check"><input type="checkbox" id="f-consent" name="consent" ${f.consent?'checked':''}>
          <span>Zgadzam się na przetwarzanie moich danych w celu obsługi rezerwacji.</span></label>
          ${e.consent ? `<p class="err" style="margin-top:4px">${esc(e.consent)}</p>`:''}</div>
        ${e.slot ? `<p class="full err">${esc(e.slot)}</p>` : ''}
        <div class="full row-actions" style="margin-top:6px"><button type="button" class="btn btn-ghost" data-step="2">Wstecz</button>
          <button type="submit" class="btn btn-gold" id="submitbtn">${ICON.send}Wyślij prośbę o rezerwację</button></div>
      </form>`;
  }
  if (S.step === 4 && S.created) {
    const b = S.created;
    body.innerHTML = `<div class="done-box">
      <p class="eyebrow">${CFG.booking.autoAccept ? 'Wizyta zarezerwowana' : 'Prośba wysłana'}</p>
      <h3 style="margin-top:8px">Dziękuję, ${esc(first(b.name))}!</h3>
      <p class="muted">Twój kod rezerwacji:</p>
      <div class="code">${esc(b.id)}</div>
      <div>${pill(b.status)}</div>
      <p class="muted" style="margin-top:14px">${esc(svcById(b.service)?.name)} · ${esc(longDate(b.date))}, ${esc(b.time)}</p>
      <div class="timeline">
        <div class="tl on"><i>${ICON.check}</i><div><b>Prośba wysłana</b><span>Termin jest zarezerwowany na czas akceptacji.</span></div></div>
        <div class="tl ${b.status!=='pending'?'on':''}"><i>${ICON.clock}</i><div><b>${b.status==='pending'?'Czekam na potwierdzenie fryzjera':STATUS[b.status].t}</b><span>Napiszę e-mailem, gdy tylko sprawdzę grafik.</span></div></div>
        <div class="tl"><i>${ICON.mail}</i><div><b>E-mail z potwierdzeniem</b><span>${esc(b.email)}</span></div></div>
      </div>
      <div class="row-actions" style="justify-content:center"><button type="button" class="btn btn-ghost" data-lookup="${esc(b.id)}">Sprawdź status</button>
        <button type="button" class="btn btn-ink" id="again">Nowa rezerwacja</button></div></div>`;
  }
}
async function goStep(n){
  S.step = n; S.errors = {};
  if (n === 2 && S.sel.service) {
    S.loading = true; renderBooking();
    await calendarFor(S.sel.service);
    S.loading = false;
  }
  renderBooking();
}
async function submitBooking(){
  const btn = $('#submitbtn'); if (btn) { btn.disabled = true; btn.textContent = 'Wysyłanie…'; }
  const f = S.form;
  const {ok, status, data} = await api('book', {body:{
    service:S.sel.service, date:S.sel.date, time:S.sel.time,
    name:f.name, phone:f.phone, email:f.email, note:f.note, consent:f.consent,
    company: $('#f-company')?.value || ''
  }});
  if (!ok) {
    if (btn) { btn.disabled = false; btn.innerHTML = ICON.send + 'Wyślij prośbę o rezerwację'; }
    if (status === 422 && data.errors) { S.errors = data.errors; renderBooking(); $('#f-' + Object.keys(data.errors)[0])?.focus(); return; }
    if (data.taken) { clearCal(); S.sel.time = null; await goStep(2); toast('Ktoś właśnie zajął tę godzinę — wybierz inną.'); return; }
    toast(data.error || 'Nie udało się wysłać. Spróbuj ponownie za chwilę.'); return;
  }
  clearCal();
  S.created = data.booking; S.step = 4;
  safeSet('salon.lastCode', data.booking.id);
  S.form = {name:'',phone:'',email:'',note:'',consent:false};
  renderBooking(); renderLast(); renderNext();
  $('#rezerwacja').scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
}

/* ---------- sprawdzanie statusu ---------- */
function renderLast(){
  const c = safeGet('salon.lastCode');
  $('#last-code').innerHTML = c ? `Twoja ostatnia rezerwacja: <button type="button" data-lookup="${esc(c)}" style="border:0;background:none;color:var(--gold-ink);font-weight:600;padding:4px;min-height:32px;cursor:pointer">${esc(c)}</button>` : '';
}
function renderResult(b){
  const r = $('#result');
  if (!b) { r.innerHTML = `<p class="eyebrow">Nie znaleziono</p><h3>Brak rezerwacji o tym kodzie</h3><p class="muted">Sprawdź, czy kod ma 6 znaków — znajdziesz go w e-mailu z potwierdzeniem.</p>`; return; }
  const s = svcById(b.service), future = b.date >= isoToday(), act = b.status === 'pending' || b.status === 'accepted';
  const last = (b.emails || [])[b.emails.length-1];
  r.innerHTML = `<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center"><span class="eyebrow">Rezerwacja ${esc(b.id)}</span>${pill(b.status)}</div>
    <h3>${esc(s?.name || '')}</h3>
    <p class="muted">${esc(longDate(b.date))}, godz. ${esc(b.time)} · ${durTxt(b.dur)}${s ? ' · ' + price(s) : ''}</p>
    ${b.reason ? `<p style="margin-top:10px"><b>Powód:</b> ${esc(b.reason)}</p>` : ''}
    ${last ? `<div class="mail"><div class="h">${ICON.mail}Ostatni e-mail: ${esc(last.subj)}</div><p>${esc(last.body)}</p></div>` : ''}
    ${act && future ? `<div class="row-actions" style="justify-content:flex-start"><button type="button" class="btn btn-danger btn-sm" data-cancel="${esc(b.id)}">Odwołaj wizytę</button></div>` : ''}
    ${(b.status==='rejected'||b.status==='cancelled') ? `<div class="row-actions" style="justify-content:flex-start"><a class="btn btn-gold btn-sm" href="#rezerwacja">Wybierz inny termin</a></div>` : ''}`;
}
async function lookup(code){
  code = String(code||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  $('#code-input').value = code;
  if (code.length < 4) { toast('Wpisz kod z e-maila (6 znaków).'); return; }
  $('#result').innerHTML = `<p class="muted">Szukam rezerwacji…</p>`;
  const {data} = await api('status', {query:`&code=${encodeURIComponent(code)}`});
  S.lookup = code;
  renderResult(data.booking);
}

/* ---------- toast ---------- */
let tt;
function toast(text){
  const el = $('#toast');
  $('#toast-t').textContent = text; $('#toast-a').hidden = true;
  el.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => el.classList.remove('show'), 3600);
}

/* ---------- zdarzenia ---------- */
document.addEventListener('click', async e => {
  const t = e.target.closest('button, a'); if (!t) return;
  const d = t.dataset;
  if (d.quick) { const [sid,ds,tm] = d.quick.split('|'); S.sel = {service:sid, date:ds, time:tm}; await calendarFor(sid); S.step = 3; renderBooking(); $('#rezerwacja').scrollIntoView(); return; }
  if (d.pick) { S.sel = {service:d.pick, date:null, time:null}; await goStep(2); $('#rezerwacja').scrollIntoView(); return; }
  if (d.svc) { if (S.sel.service !== d.svc) S.sel = {service:d.svc, date:null, time:null}; await goStep(2); return; }
  if (d.date) { S.sel.date = d.date; S.sel.time = null; renderBooking(); return; }
  if (d.time) { S.sel.time = d.time; renderBooking(); return; }
  if (d.step && !t.disabled) { await goStep(+d.step); return; }
  if (t.id === 'again') { S.created = null; S.sel = {service:null,date:null,time:null}; clearCal(); S.step = 1; renderBooking(); renderNext(); return; }
  if (d.lookup) { e.preventDefault(); await lookup(d.lookup); $('#status').scrollIntoView(); return; }
  if (d.cancel) {
    if (!confirm('Na pewno odwołać tę wizytę?')) return;
    t.disabled = true;
    const {ok, data} = await api('cancel', {body:{code:d.cancel}});
    if (!ok) { t.disabled = false; toast(data.error || 'Nie udało się odwołać.'); return; }
    clearCal(); renderNext(); renderResult(data.booking); toast('Wizyta odwołana. Termin jest znów wolny.');
    return;
  }
});
document.addEventListener('input', e => {
  const el = e.target; if (!el.closest('#bkform') || el.name === 'company') return;
  S.form[el.name] = el.type === 'checkbox' ? el.checked : el.value;
  if (S.errors[el.name]) { delete S.errors[el.name]; const f = el.closest('.field'); f?.classList.remove('invalid'); f?.querySelector('.err')?.remove(); }
});
document.addEventListener('change', e => { if (e.target.id === 'f-consent') S.form.consent = e.target.checked; });
document.addEventListener('submit', e => {
  if (e.target.id === 'bkform') { e.preventDefault(); submitBooking(); }
  if (e.target.id === 'codeform') { e.preventDefault(); lookup($('#code-input').value); }
});

/* ---------- ustawienia salonu z serwera ---------- */
function renderStatic(){
  const { salon, texts, hours, booking } = CFG;
  document.title = `${salon.name} — rezerwacje online`;
  $('#brand').textContent = salon.name;
  $('#brand-sub').textContent = salon.tagline || '';
  $('#footer-brand').textContent = `© ${new Date().getFullYear()} ${salon.name}`;
  $('#hero-eyebrow').textContent = `Pracownia fryzjerska${salon.city ? ' · ' + salon.city : ''}`;
  const [a, b] = String(texts.heroTitle || '').split('|');
  $('#hero-title').innerHTML = esc(a) + (b ? `<br><em>${esc(b)}</em>` : '');
  $('#hero-lead').textContent = texts.heroLead || '';
  const ph = $('#hero-phone');
  ph.href = 'tel:' + String(salon.phone).replace(/\s/g,''); ph.textContent = 'Zadzwoń: ' + salon.phone;
  $('#booking-note').textContent = booking.autoAccept
    ? 'Termin rezerwuje się od razu — potwierdzenie dostaniesz e-mailem.'
    : 'Rezerwacja trafia do mnie do akceptacji. Zwykle odpowiadam w ciągu kilku godzin.';

  $('#menu').innerHTML = SERVICES.map(s => `
    <div class="mi"><span class="n">${esc(s.name)}</span><span class="p">${price(s)}</span>
      <span class="meta">${ICON.clock}${durTxt(s.dur)} · ${esc(s.desc)}</span>
      <button type="button" class="go" data-pick="${esc(s.id)}">Zarezerwuj →</button></div>`).join('');

  $('#about-title').textContent = texts.aboutTitle || '';
  $('#about-1').textContent = texts.about1 || '';
  $('#about-2').textContent = texts.about2 || '';
  $('#facts').innerHTML = (texts.facts || []).map(([big, small]) => `<div><b>${esc(big)}</b><span>${esc(small)}</span></div>`).join('');
  $('#portrait-slot').outerHTML = texts.photo
    ? `<img class="portrait" src="${esc(texts.photo)}" alt="${esc(salon.name)}" style="object-fit:cover">`
    : `<div class="portrait" role="img" aria-label="Miejsce na zdjęcie fryzjera"><span>tu Twoje zdjęcie</span></div>`;

  const td = new Date().getDay();
  $('#htable').innerHTML = [1,2,3,4,5,6,0].map(d => {
    const h = hours[d];
    const nm = WD[d].charAt(0).toUpperCase() + WD[d].slice(1);
    return `<tr class="${d===td?'today':''}"><td>${nm}${d===td?' · dziś':''}</td><td>${h ? `${pad(h[0])}:00 – ${pad(h[1])}:00` : 'zamknięte'}</td></tr>`;
  }).join('');

  $('#contact').innerHTML = `
    <div><svg class="i" viewBox="0 0 24 24"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/></svg>${esc(salon.address)}</div>
    <a href="tel:${esc(String(salon.phone).replace(/\s/g,''))}">${ICON.phone}${esc(salon.phone)}</a>
    <a href="mailto:${esc(salon.email)}">${ICON.mail}${esc(salon.email)}</a>`;
  $('#note-hours').textContent = texts.noteHours || '';
}

/* ---------- start ---------- */
(async () => {
  const {ok, data} = await api('config');
  if (!ok || !data.services) { $('#bk-body').innerHTML = `<div class="empty">Nie mogę wczytać ustawień salonu. Odśwież stronę za chwilę.</div>`; return; }
  CFG = data; SERVICES = data.services;
  renderStatic(); renderBooking(); renderLast(); renderNext();
  const last = safeGet('salon.lastCode');
  if (location.hash === '#status' && last) lookup(last);
})();
})();
