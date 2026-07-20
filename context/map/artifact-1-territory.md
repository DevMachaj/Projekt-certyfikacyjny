# Artifact 1 — Territory (mapa aktywności z historii gita)

> Analiza wykonana: 2026-07-01. Źródło: `git log` całego repo.
> Metoda: częstotliwość zmian plików/folderów, rozkład czasowy, analiza współzmian (co-change coupling).

## Zakres danych — uwaga kluczowa

Cała historia repo mieści się w **~5 tygodniach** (2026-05-30 → 2026-07-01, **69 commitów**).
Filtr „ostatnie 12 miesięcy" obejmuje więc **całą historię projektu** — to młody projekt w fazie budowy MVP.
Podział kwartalny jest zdegenerowany (68 commitów w Q2 2026, 1 w Q3 2026); sensowną granulacją czasową jest **tydzień**.

Odfiltrowany szum: lockfile'e, configi (`*.json`, `astro.config.mjs`, `wrangler.jsonc`, `vitest.config.ts`, `eslint.config.js`, `tsconfig.json`),
dotenvy (`.env.example`, `.gitignore`), tooling AI (`.claude/**`), oraz artefakty procesu 10x (`context/**` — `plan.md`/`change.md`/`roadmap.md`).
Realny kod: `src/`, `supabase/migrations`, `e2e/`.

---

## a) TOP 10 folderów / modułów (realny kod)

| #   | Moduł                          | Zmiany | Charakter                                                  |
| --- | ------------------------------ | -----: | ---------------------------------------------------------- |
| 1   | `src/pages/api`                |     17 | API endpoints (auth, products, sales-entries, account)     |
| 2   | `src/lib` + `src/lib/services` |    ~24 | logika domenowa: classification, restocking, dashboard, db |
| 3   | `src/components/products`      |      8 | katalog produktów (CRUD)                                   |
| 4   | `src/components/auth`          |      6 | formularze logowania/rejestracji                           |
| 5   | `src/components/sales`         |      5 | wprowadzanie sprzedaży + panel klasyfikacji                |
| 6   | `src/components/dashboard`     |      5 | plan restockingu (UI)                                      |
| 7   | `supabase/migrations`          |      5 | schemat bazy                                               |
| 8   | `src/pages/auth`               |      3 | strony auth (signin/signup/confirm)                        |
| 9   | `src/lib/validation`           |      3 | schematy zod                                               |
| 10  | `src/components/account`       |      2 | usuwanie konta / retencja danych                           |

Obszary hands-on koncentrują się wokół trzech pionów biznesowych — **produkty (katalog)**, **sprzedaż + klasyfikacja**,
**restocking/dashboard** — plus przekrojowy fundament **API + auth + logika w `src/lib`**.

## b) TOP 10 plików (realny kod)

| #   | Plik                                                    | Zmiany | Rola                            |
| --- | ------------------------------------------------------- | -----: | ------------------------------- |
| 1   | `src/pages/dashboard.astro`                             |      7 | strona dashboardu (hot spot)    |
| 2   | `src/lib/db.ts`                                         |      5 | dostęp do bazy                  |
| 3   | `src/lib/classification.test.ts`                        |      5 | testy klasyfikacji              |
| 4   | `src/components/products/ProductCatalog.tsx`            |      5 | UI katalogu produktów           |
| 5   | `src/middleware.ts`                                     |      4 | auth middleware (guard tras)    |
| 6   | `src/lib/classification.ts`                             |      4 | logika klasyfikacji             |
| 7   | `src/components/dashboard/RestockingPlan.tsx`           |      4 | UI planu restockingu            |
| 8   | `src/pages/api/auth/signup.ts`                          |      3 | endpoint rejestracji            |
| 9   | `src/lib/services/restocking-summary.ts` (+ `.test.ts`) | 3 (+3) | serwis podsumowania restockingu |
| 10  | `src/lib/restocking.ts` (+ `.test.ts`)                  | 3 (+3) | logika restockingu              |

`classification` i `restocking` występują parami ze swoimi testami — najbardziej dojrzała, testowana logika domenowa (dyscyplina TDD w rdzeniu).

---

## Rozkład czasowy (nacisk pracy tydzień po tygodniu)

| Tydzień            | Commity | Dominujący obszar                       | Faza                                        |
| ------------------ | ------: | --------------------------------------- | ------------------------------------------- |
| W22 (30–31 maj)    |      14 | `components` + `pages` + migracje       | Scaffolding UI + pierwszy schemat DB        |
| W23 (1–7 cze)      |      12 | `lib` + `pages`                         | Logika domenowa + API                       |
| W24 (8–14 cze)     |       0 | —                                       | Przerwa                                     |
| W25 (15–21 cze)    |      14 | `lib` (mocno)                           | Serwisy + testy (restocking/classification) |
| W26 (22–28 cze)    |      28 | `components` + `pages` + wejście `e2e/` | Szczyt — UI finish + testy E2E              |
| W27 (29 cze–1 lip) |       1 | —                                       | Domknięcie                                  |

**Łuk pracy:** `UI/strony → logika/API → testy jednostkowe serwisów → UI finish + E2E`.
Projekt przeszedł od budowania wszerz do utwardzania w głąb; najświeższa aktywność to warstwa testowa
(spójne z gałęzią `test/e2e-playwright-setup`).

---

## Sprzężenia katalogów (co-change coupling)

Na 69 commitów **17 dotyka ≥2 modułów kodu**.

**Najsilniejsza para:** `api` + `lib` (6×).
**Najsilniejsza trójka:** `api` + `lib` + `lib/validation` (3×), następnie warianty z `db (migrations)`.

Dominujący klaster to pionowy stos backendowy — **„data plane"**:

```
db (migrations) ─ lib/validation ─ lib ─ api
```

Zmiana kontraktu danych propaguje się przez całą oś: migracja → walidacja (zod) → logika → endpoint.

### Wnioski dla TOP 3

1. **`src/pages/api` — hub sprzężeń, nie liść.** Najbardziej sprzężony moduł; końcówka pionowego łańcucha danych.
   Zmiana endpointu kaskaduje w dół (validation → logika → schemat). Dobre miejsce na testy kontraktowe.
2. **`src/lib` / `src/lib/services` — rdzeń, przez który wszystko przechodzi.** Sprzęga się z każdym klastrem
   (backend, db, validation, ale też `components/sales` i `components/dashboard`). Najbardziej ryzykowny obszar zmian —
   słusznie najlepiej otestowany.
3. **`src/components/products` — luźno sprzężony, pionowo izolowany.** Sprzęga się głównie wewnątrz własnego pionu
   (`+components/ui`), nie w poprzek architektury. Zdrowa granica modularna; refaktor UI jest lokalny i względnie bezpieczny.

**Syntetycznie:** ciężki, ciasno sprzężony **rdzeń danych** (`db→validation→lib→api`) + lekko sprzężona **skóra UI** (komponenty per-domena).

---

## „Wspólny mianownik" — pliki cross-cutting

Pliki sprzężone z największą liczbą obszarów to **config / pliki generowane / procesowe**, nie ukryta zależność kodu:
`package.json` + `package-lock.json`, `CLAUDE.md`, `.claude/.10x-cli-manifest.json`, `context/foundation/roadmap.md`.

**Zastrzeżenie metodologiczne:** te liczby są zawyżone przez **dwa mega-commity**:

- `Pierwsze zmiany` — **96 plików** (initial scaffold),
- `feat(product-catalog-crud) … p2` — **47 plików**.

W takich commitach każdy plik „współwystępuje" z każdym obszarem — to artefakt wielkości commita, nie realna zależność.

**Wnioski:**

- **Brak** ukrytego cross-cutting pliku typu bundle tłumaczeń / wygenerowany klient / globalny config. Aplikacja nie ma i18n ani warstwy generowanej.
- Jedyny prawdziwy hub w kodzie to `src/pages/dashboard.astro` — ale to **korzeń kompozycji** (strona agregująca), nie ukryta zależność. Sprzężenie oczekiwane i zdrowe.

## Weryfikacja istnienia plików

Wszystkie pliki z analizy sprzężeń **istnieją dziś w repo** — żaden nie został usunięty ani przeniesiony.
Jedyny `refactor` w historii (`extract classifyUserCatalog`) wydzielił funkcję wewnątrz `src/lib`, nie ruszając ścieżek.
Analiza opiera się na plikach aktualnych.

---

## Rekomendacja na przyszłość

Historia jest zdominowana przez initial scaffold (96 plików). Każda kolejna analiza współzmian na tym repo powinna
**odfiltrowywać commity powyżej ~40 plików** (albo traktować je osobno) — inaczej „sprzężenia" będą sztucznie napompowane.
Analizę warto powtórzyć, gdy repo urośnie i pojawią się realne refaktory przenoszące pliki.
