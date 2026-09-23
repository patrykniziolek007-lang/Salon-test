/* ==========================================================================
   USTAWIENIA SALONU — to jedyny plik, który edytujesz na co dzień.
   Po zapisaniu zmian zrób commit i push — Cloudflare przebuduje stronę sam.
   Hasło do panelu i klucz do maili NIE są tutaj — siedzą w ustawieniach
   Cloudflare (Settings → Variables and Secrets), żeby nie trafiły na GitHuba.
   ========================================================================== */

export const SALON = {
  name:    'Nożyce Studio',
  tagline: 'studio fryzur',
  address: 'ul. Kwiatowa 8, 33-100 Tarnów',
  city:    'Tarnów',
  phone:   '500 000 000',
  email:   'kontakt@nozyce.pl',   // adres widoczny na stronie
};

/* Godziny otwarcia. 0 = niedziela, 1 = poniedziałek … 6 = sobota.
   [9, 18] = od 9:00 do 18:00. null = zamknięte. */
export const HOURS = {
  0: null,
  1: null,
  2: [9, 18],
  3: [9, 18],
  4: [10, 19],
  5: [9, 18],
  6: [8, 14],
};

/* Dni wolne: urlop, święta. Format 'RRRR-MM-DD'. */
export const CLOSED_DATES = [];

/* Usługi. dur = czas w minutach (decyduje o wolnych godzinach),
   from: true → cena pokaże się jako „od X zł”. */
export const SERVICES = [
  { id:'dam', name:'Strzyżenie damskie',   desc:'mycie, strzyżenie, modelowanie',      dur:60,  price:90 },
  { id:'mes', name:'Strzyżenie męskie',    desc:'maszynka i nożyczki, mycie',           dur:30,  price:50 },
  { id:'bro', name:'Strzyżenie + broda',   desc:'strzyżenie i trymowanie brody',        dur:45,  price:75 },
  { id:'dz',  name:'Strzyżenie dziecięce', desc:'do 12 lat',                            dur:30,  price:40 },
  { id:'mod', name:'Modelowanie',          desc:'mycie i stylizacja na okazję',         dur:45,  price:70 },
  { id:'kol', name:'Koloryzacja',          desc:'jeden kolor, z modelowaniem',          dur:120, price:220, from:true },
  { id:'bal', name:'Balayage / refleksy',  desc:'rozjaśnianie, tonowanie, modelowanie', dur:180, price:350, from:true },
  { id:'reg', name:'Regeneracja',          desc:'zabieg odbudowujący + modelowanie',    dur:60,  price:120 },
];

export const BOOKING = {
  step: 30,            // co ile minut pokazywać godziny
  daysAhead: 28,       // na ile dni naprzód można rezerwować
  leadMinutes: 120,    // minimalne wyprzedzenie rezerwacji
  autoAccept: false,   // true = rezerwacja potwierdza się sama, bez Twojej akceptacji
};

export const TEXTS = {
  heroTitle: 'Twoje włosy.|Twój termin.',   // znak | robi nowy wiersz (druga linia na złoto)
  heroLead:  'Umów się bez dzwonienia. Wybierz usługę i godzinę, a ja potwierdzę wizytę — dostaniesz e-mail i kod, którym sprawdzisz status.',
  aboutTitle:'Jeden fryzjer, cała uwaga dla Ciebie',
  about1:    'Pracuję sam, więc w salonie nie ma tłoku ani pośpiechu. Każdą wizytę zaczynam od krótkiej rozmowy o tym, jak układasz włosy na co dzień — dopiero potem sięgam po nożyczki.',
  about2:    'Korzystam z kosmetyków profesjonalnych marek i doradzę, jak dbać o fryzurę w domu, żeby wyglądała dobrze także tydzień po wizycie.',
  facts:     [['12','lat doświadczenia'], ['1','klient naraz'], ['4,9','średnia ocen']],
  photo:     '',   // np. 'assets/fryzjer.jpg' — wrzuć zdjęcie do public/assets/
  noteHours: 'Parking przy budynku. Jeśli spóźnisz się ponad 15 minut, wizyta może zostać skrócona.',
};

/* To, co strona wysyła do przeglądarki (bez sekretów). */
export function publicConfig() {
  return { salon: SALON, hours: HOURS, services: SERVICES, booking: { autoAccept: BOOKING.autoAccept }, texts: TEXTS };
}
