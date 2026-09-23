# Salon z rezerwacjami — wersja na Cloudflare Pages

Strona klienta + panel salonu + baza rezerwacji, wszystko w darmowym planie Cloudflare.
Twoja obecna strona zostaje nietknięta — stawiamy **osobny projekt** pod adresem `salon.twojadomena.pl`.

**Plan na 30–40 minut:** repo na GitHubie → baza D1 → projekt Pages → hasło i klucz do maili → subdomena → testy.

---

## Co jest w środku

| Plik / katalog | Do czego służy |
|---|---|
| `shared/config.js` | **Twoje ustawienia**: nazwa salonu, cennik, godziny, teksty |
| `public/` | to, co widzi przeglądarka: `index.html`, `panel.html`, `assets/` |
| `functions/api/[[route]].js` | logika serwera: terminy, rezerwacje, panel, e-maile |
| `schema.sql` | struktura bazy — wklejasz raz przy zakładaniu D1 |
| `wrangler.toml` | nazwa projektu i powiązanie z bazą |
| `test.mjs`, `serve-test.mjs` | testy lokalne (opcjonalne, nie wpływają na wdrożenie) |

Hasło do panelu i klucz do maili **nie są w plikach** — ustawiasz je w Cloudflare, więc nie trafiają na GitHuba.

---

## Krok 1. Ustaw swoje dane

Otwórz `shared/config.js` i zmień: `SALON` (nazwa, adres, telefon), `HOURS` (godziny otwarcia),
`SERVICES` (cennik i czasy usług), `TEXTS` (teksty na stronie). Resztę zostaw.

## Krok 2. Repo na GitHubie

Utwórz na GitHubie puste repo, np. `salon`, i z katalogu z tymi plikami:

```bash
git init
git add .
git commit -m "Strona salonu z rezerwacjami"
git branch -M main
git remote add origin https://github.com/TWOJ-LOGIN/salon.git
git push -u origin main
```

## Krok 3. Baza danych D1

W panelu Cloudflare: **Storage & Databases → D1 → Create database**, nazwa `salon`.
Wejdź w bazę → zakładka **Console**, wklej całą zawartość `schema.sql` i uruchom.

Alternatywnie z terminala: `npx wrangler d1 create salon`, a potem
`npx wrangler d1 execute salon --remote --file=schema.sql`.
Komenda `create` wypisze `database_id` — wklej go do `wrangler.toml` (i zrób commit).

## Krok 4. Projekt w Cloudflare Pages

**Workers & Pages → Create → Pages → Connect to Git** → wybierz repo `salon`.

- Framework preset: **None**
- Build command: **zostaw puste**
- Build output directory: **`public`**

Kliknij *Save and Deploy*. Dostaniesz adres typu `salon-abc.pages.dev` — strona już się pokaże,
ale rezerwacje jeszcze nie zadziałają, bo brakuje bazy i hasła.

## Krok 5. Powiąż bazę i ustaw sekrety

W projekcie: **Settings → Bindings → Add → D1 database**
→ Variable name: **`DB`** (dokładnie tak), Database: `salon`.

Potem **Settings → Variables and Secrets → Add**, typ **Secret**:

| Nazwa | Wartość |
|---|---|
| `PANEL_PASSWORD` | Twoje hasło do panelu (min. 12 znaków) |
| `SESSION_SECRET` | dowolny długi losowy ciąg (np. z menedżera haseł) |
| `RESEND_API_KEY` | klucz z Resend — krok 7 |
| `MAIL_FROM` | `rezerwacje@twojadomena.pl` |
| `OWNER_EMAIL` | Twój adres, na który mają przychodzić powiadomienia |

Na koniec **Deployments → Retry deployment**, żeby zmienne weszły w życie.

## Krok 6. Subdomena

**Custom domains → Set up a custom domain** → `salon.twojadomena.pl`.
Skoro domena jest w Cloudflare, rekord DNS doda się sam. Certyfikat HTTPS pojawia się w kilka minut.

Twoja strona główna dalej działa bez zmian — to osobny projekt.

## Krok 7. E-maile (Resend)

1. Załóż darmowe konto na resend.com (3000 maili/miesiąc, 100 dziennie).
2. **Domains → Add domain** → `twojadomena.pl`. Resend pokaże rekordy DNS (SPF, DKIM, zwykle też DMARC).
3. Dodaj je w Cloudflare: **DNS → Records → Add record**. Przy rekordach dla poczty zostaw chmurkę **szarą** (DNS only).
4. Poczekaj na status *Verified* przy domenie (zwykle kilka–kilkanaście minut).
5. **API Keys → Create API Key**, skopiuj klucz (`re_...`) i wklej jako `RESEND_API_KEY` w Cloudflare.
6. Zrób *Retry deployment*.

W panelu salonu masz przycisk **Wyślij testowy e-mail** — nim sprawdzisz, czy wszystko gra.

---

## Krok 8. Testy — po kolei

1. Wejdź na `salon.twojadomena.pl` — cennik i godziny zgadzają się z `config.js`.
2. Zarezerwuj wizytę na swój prawdziwy e-mail. Zapisz kod.
3. `salon.twojadomena.pl/panel.html` → zaloguj się hasłem z `PANEL_PASSWORD`.
4. Kliknij **Wyślij testowy e-mail**, sprawdź skrzynkę (także spam).
5. Kliknij **Akceptuj** → klient (czyli Ty) dostaje potwierdzenie.
6. Wróć na stronę → **Moja rezerwacja** → wpisz kod → status *Potwierdzona*.
7. Kliknij **Odwołaj wizytę** i sprawdź, czy termin wrócił do wolnych.
8. Sprawdź stronę i panel na telefonie. Panel możesz dodać do ekranu głównego — otworzy się jak aplikacja.
9. Na koniec w panelu: **Usuń przykłady**.

## Zmiany na co dzień

Cennik, godziny, teksty, dni wolne: edytujesz `shared/config.js`, robisz commit i push.
Cloudflare przebuduje stronę w kilkadziesiąt sekund. Rezerwacje w bazie zostają nienaruszone.

## Testy na własnym komputerze (opcjonalnie)

```bash
npm install
node test.mjs            # 17 testów logiki rezerwacji na lokalnej bazie
node serve-test.mjs      # strona pod localhost:8124, hasło do panelu: tajne123
```

Do pełnego trybu Cloudflare: skopiuj `.dev.vars.example` jako `.dev.vars`, potem
`npm run db:local` i `npm run dev`.

## Jak to wyłączyć albo cofnąć

Nic nie podmienialiśmy, więc nie ma czego cofać. Żeby zakończyć test: w projekcie Pages
usuń custom domain (albo cały projekt). Strona główna i tak nie była ruszana.
Dane rezerwacji możesz wcześniej pobrać: `npx wrangler d1 export salon --remote --output=kopia.sql`.

## Limity i koszty

Darmowy plan Cloudflare: 100 tys. żądań dziennie, D1 — 5 mln odczytów i 100 tys. zapisów dziennie,
5 GB bazy. Resend — 3000 maili miesięcznie, 100 dziennie. Dla jednoosobowego salonu to zapas
kilkadziesiąt razy większy niż potrzeba. Płacisz tylko za domenę.

## Czego jeszcze nie ma

- SMS-ów (potrzebna płatna bramka, np. SerwerSMS)
- synchronizacji z Kalendarzem Google
- przerw między wizytami (na razie blokujesz cały dzień przez `CLOSED_DATES`)
- obsługi kilku pracowników — strona jest pod jedno stanowisko

Napisz, czego brakuje po testach, to dorobię.
