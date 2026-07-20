# Guard-first safe slice: urgency guard + validated DB read boundary — Implementation Plan

## Overview

Domykamy najgroźniejszy nieosłonięty szew wskazany w analizie M4L3/④: **granicę odczytu z DB w `src/lib/db.ts`**, która dziś rzutuje surowe wiersze (`as Product[]` / `as SalesEntry[]`) bez żadnej walidacji runtime i bez testów. Robimy to wąskim, odwracalnym wycinkiem w duchu lekcji M4L4: **guard najpierw, test przed dotknięciem, mechanizm ląduje na zielono, egzekwowanie włącza się osobno.** Przy okazji dokładamy tani guard-test dla świadomego ograniczenia `urgency()` (G1) — ubezpieczenie na przyszłą zmianę `classify()`.

To NIE jest pełny refaktor kontraktu danych (C1). Ranking (`research.md` §4) postawił C1 na #1, ale przy złożoności MEDIUM świadomie zawężamy do **granicy odczytu ścieżki krytycznej** — jedno źródło prawdy budujemy tam, gdzie realnie domyka dziurę, a migrację całego `types.ts` (16 konsumentów) odkładamy.

## Current State Analysis

- `src/lib/db.ts:14` (`getProductsByUser`) i `:86` (`getSalesEntriesByUser`) zwracają `data as Product[]` / `data as SalesEntry[]` — cast `as` **nie sprawdza nic w runtime** i aktywnie tłumi typecheck. `[research.md §2 C2, zweryfikowane ast-grep]`
- Zapisy SĄ walidowane zodem (`productSchema` / `salesEntrySchema`) w warstwie API; odczyty NIE. Kontrast systematyczny — granica leży na styku `db.ts` ↔ Supabase.
- **Brak `db.test.ts`** — te funkcje mają ZERO testów. `db.ts` przyjmuje `supabase: SupabaseClient` jako parametr (DI), więc mock jest trywialny.
- **Brak generacji typów Supabase** (`createServerClient` bez generyka) — `types.ts` pisany ręcznie w 1 commicie (`bec03c4`), fan-in 16.
- Input-schematy pomijają kolumny serwerowe: `productSchema` = `{name, stock_quantity, lead_time_days, buffer_days}` (brak `id, user_id, created_at, updated_at`); `salesEntrySchema` = `{units_sold, start_date, end_date}` (brak `id, product_id, user_id, created_at`) i jest `ZodEffects` z regułą wejścia „end_date nie w przyszłości" — reguła walidacji _wejścia_, nie inwariant zapisanego wiersza.
- `urgency()` (`restocking.ts:45-48`, funkcja prywatna) ma guard `+Infinity` dla null-facts; branch **nietrafiony** żadnym testem, choć jest **świadomym ograniczeniem** (`context/archive/2026-06-17-restocking-plan-decision-support/plan.md:16,48`). Werdykt ④: guard, nie przebudowa.
- Reguła zespołu (`context/foundation/lessons.md`): wywołania throw-on-error db-helperów na granicy SSR/API są opakowane w try/catch — API zwraca `Response.json({error},500)`, SSR degraduje do `groups=[]`. Walidacja na odczycie musi rzucać na **tej samej** granicy.
- Jedyna bramkująca warstwa testowa to **vitest** (`npm test` w CI); Stryker (tylko `classification.ts`) i Playwright są poza CI. Każdy nowy `src/**/*.test.ts` staje się bramką za darmo.

## Desired End State

- `getProductsByUser` i `getSalesEntriesByUser` walidują wiersze zwrócone z DB przez zod row-schema; uszkodzony/zdryfowany wiersz **rzuca**, propaguje do istniejącego `catch` (API → 500 `{error}`, dashboard → `groups=[]`). Cichy dryf schematu staje się głośny.
- Istnieje jedno, jawne źródło prawdy kształtu wiersza (`productRowSchema` / `salesEntryRowSchema`), spięte z `types.ts` **testem typów** — dryf w którąkolwiek stronę wywraca test/typecheck.
- `db.ts` ma testy charakteryzujące (happy path + `error→throw` + `zły wiersz→throw`).
- Kontrakt „missing facts sort last" w `urgency()` jest przybity testem.
- Weryfikacja: `npm test` zielone (nowe testy przechodzą), `npm run typecheck` + `npm run build` + `npm run lint` zielone; ręcznie — dashboard i „Generate plan" działają bez regresji na poprawnych danych.

### Key Discoveries:

- `db.ts` używa DI (`supabase` jako parametr) → mock chainable `from().select().eq().order()` resolvujący `{data,error}`. `[db.ts:6-15,78-87]`
- Row-schema MUSI być osobny od input-schema: input ma reguły wejścia (`no future date`, `.default(null)`), których nie stosuje się do zapisanego wiersza; row-schema opisuje kolumny wiersza (typy + `>=0` + format daty). `[validation/sales-entry.ts:38-51]`
- `productSchema` to czysty `z.object` (można `.extend`), ale `salesEntrySchema` to `ZodEffects` (`.refine`) — `.extend` nie zadziała; row-schema budujemy jako świeży `z.object`.
- Fail-closed jest zgodne z obecnym `if (error) throw error` w `db.ts` i z `lessons.md`.

## What We're NOT Doing

- **Pełne C1**: NIE zamieniamy `types.ts` na `z.infer` i NIE ruszamy 16 konsumentów — typy zostają ręczne, spięte testem.
- **Supabase gen types** / Docker w toolchainie — poza zakresem.
- Walidacja na odczycie dla `getProductById` (`db.ts:58`) i `getSalesEntriesByProduct` (`db.ts:75`) — poza ścieżką krytyczną restockingu; osobny follow-up.
- Zmiękczanie do `safeParse`/drop/warn — świadomie **fail-closed** (odrzucone w wywiadzie planera).
- Testy `summarizeRestockPlan` i endpointu `POST /api/restocking-plan` — to największe _ryzyko_ w repo, ale praca siatki bezpieczeństwa (`/10x-test-plan`/tdd/e2e), nie ten refaktor.
- Wpinanie Stryker/Playwright w CI.
- Jakiekolwiek zmiany ścieżki zapisu (`create*`/`update*`).
- Zmiana kształtu `urgency()` — tylko guard-test (świadome ograniczenie).

## Implementation Approach

Cztery fazy ułożone guard-first / od najtańszej i najbardziej samodzielnej, każda = osobny, odwracalny commit. Fazy 1-2 to czyste dodatki testowe (0 zmian produkcyjnych). Faza 3 dokłada mechanizm (row-schema) na zielono, bez zmiany zachowania. Dopiero Faza 4 zmienia zachowanie odczytu — pod osłoną testów z Faz 2-3.

## Phase 1: Guard-test dla `urgency()` (G1)

### Overview

Przybij kontrakt „missing facts sort last" w `selectRestockCandidates`, testując prywatny `urgency()` przez publiczne API. Zero zmian w kodzie produkcyjnym.

### Changes Required:

#### 1. Test guardu urgency

**File**: `src/lib/restocking.test.ts`

**Intent**: Dodać test charakteryzujący do istniejącego `describe("selectRestockCandidates")`: kandydat z null-facts trafia na koniec listy (branch `+Infinity`), niezależnie od dzisiejszej osiągalności — ubezpieczenie na przyszłą zmianę `classify()`.

**Contract**: Nowy test-case wołający `selectRestockCandidates` z co najmniej dwoma kandydatami Understocked/Watch — jeden z pełnymi faktami, jeden z `leadTime: null` (infra `makeProduct` już to wspiera; `daysOfStock` w `ItemOpts` jest `number`, więc null-facts wymuszamy przez `leadTime: null`). Asercja: kandydat z null-facts jest ostatni w wyniku. Bez zmian w `src/lib/restocking.ts`.

### Success Criteria:

#### Automated Verification:

- Nowy test przechodzi: `npm test`
- Lint czysty: `npm run lint`

#### Manual Verification:

- Brak (zmiana wyłącznie testowa).

**Implementation Note**: Po zielonym `npm test` zatrzymaj się na potwierdzenie przed Fazą 2.

---

## Phase 2: Testy charakteryzujące `db.ts` (przed dotknięciem)

### Overview

Przybij OBECNE zachowanie dwóch batchy odczytu zanim je zmienimy: happy path zwraca dane, błąd Postgrest rzuca. Zero zmian produkcyjnych — to siatka pod Fazę 4.

### Changes Required:

#### 1. Nowy plik testowy db.ts

**File**: `src/lib/db.test.ts` (nowy)

**Intent**: Charakteryzacja `getProductsByUser` i `getSalesEntriesByUser` na zmockowanym kliencie Supabase, żeby Faza 4 miała czerwony test przy regresji zachowania.

**Contract**: Mock `SupabaseClient` jako chainable stub — `from(table)` → obiekt z `select`/`eq`/`order` zwracającymi `this`, awaitowalny (thenable) do `{ data, error }`. Testy: (a) happy path — `error: null`, `data` = tablica poprawnych wierszy → funkcja zwraca tę tablicę; (b) `error` = PostgrestError → funkcja rzuca. **Nie** przybijamy dziś zachowania „zły wiersz przechodzi po cichu" (to stan, który Faza 4 świadomie zmienia — nie utrwalamy go jako pożądanego).

### Success Criteria:

#### Automated Verification:

- `db.test.ts` przechodzi: `npm test`
- Typecheck czysty: `npm run typecheck`
- Lint czysty: `npm run lint`

#### Manual Verification:

- Brak (zmiana wyłącznie testowa).

**Implementation Note**: Po zielonym `npm test` zatrzymaj się na potwierdzenie przed Fazą 3.

---

## Phase 3: Row-schema jako jedno źródło (mechanizm, na zielono)

### Overview

Dodaj jawne zod-schematy kształtu wiersza (`productRowSchema`, `salesEntryRowSchema`) i spinaj je z `types.ts` testem typów. Sama abstrakcja — bez zmiany zachowania odczytu (jeszcze nie używamy jej w `db.ts`). 0 call-site.

### Changes Required:

#### 1. Schematy wierszy

**File**: `src/lib/validation/rows.ts` (nowy)

**Intent**: Zdefiniować kształt wiersza DB (superset kolumn ponad input-schema o pola serwerowe) jako jedno, jawne źródło prawdy do walidacji na odczycie.

**Contract**: `productRowSchema` = świeży `z.object` z polami `id`, `user_id` (uuid/string), `name`, `stock_quantity` (int ≥0), `lead_time_days` (int >0 nullable), `buffer_days` (int >0), `created_at`, `updated_at` (string). `salesEntryRowSchema` = `z.object` z `id`, `product_id`, `user_id`, `units_sold` (int ≥0), `start_date`, `end_date` (format `YYYY-MM-DD`), `created_at`. Row-schema NIE zawiera reguł wejścia (`no future date`, `.default(null)`). Budowane jako świeży `z.object` (nie `.extend` `salesEntrySchema`, bo to `ZodEffects`).

#### 2. Test zgodności typów

**File**: `src/lib/validation/rows.test.ts` (nowy)

**Intent**: Wywrócić test/typecheck, gdy `z.infer<rowSchema>` rozjedzie się z `types.ts` w którąkolwiek stronę — to spina dwa ręczne miejsca w jeden kontrakt.

**Contract**: Dwukierunkowa asercja przypisywalności typów (`Product` ↔ `z.infer<typeof productRowSchema>`, analogicznie SalesEntry) — np. `expectTypeOf` z vitest lub wzajemne przypisania kompilacyjne. Opcjonalnie jeden runtime `parse` reprezentatywnego wiersza (smoke).

### Success Criteria:

#### Automated Verification:

- Testy zgodności przechodzą: `npm test`
- Typecheck czysty (dowód spięcia typów): `npm run typecheck`
- Lint czysty: `npm run lint`

#### Manual Verification:

- Brak (dodatek mechanizmu, bez zmiany zachowania).

**Implementation Note**: Po zielonym `npm test` + `npm run typecheck` zatrzymaj się na potwierdzenie przed Fazą 4.

---

## Phase 4: Walidacja na odczycie (właściwa zmiana C2)

### Overview

Włącz egzekwowanie: podmień casty w dwóch batchach na `parse` przez row-schema. Uszkodzony wiersz rzuca → istniejący `catch` degraduje (API 500 / dashboard `groups=[]`). Dołóż test nowego zachowania „zły wiersz → throw".

### Changes Required:

#### 1. Walidacja w batch-odczytach

**File**: `src/lib/db.ts`

**Intent**: Zastąpić niesprawdzany cast walidacją runtime na granicy I/O ścieżki krytycznej, zachowując sygnatury i kontrakt throw-on-error.

**Contract**: `db.ts:14` — `return data as Product[]` → `return productRowSchema.array().parse(data)`; `db.ts:86` — `return data as SalesEntry[]` → `return salesEntryRowSchema.array().parse(data)`. Sygnatury (`Promise<Product[]>` / `Promise<SalesEntry[]>`) i `if (error) throw error` bez zmian. `parse` rzuca `ZodError` przy dryfcie → fail-closed, propaguje do istniejącego `catch`. `getProductById`/`getSalesEntriesByProduct` bez zmian (poza zakresem).

#### 2. Test nowego zachowania

**File**: `src/lib/db.test.ts`

**Intent**: Przybić, że po zmianie zły wiersz z DB rzuca (a nie przechodzi po cichu).

**Contract**: Nowy case: mock zwraca `error: null` i `data` z wierszem łamiącym row-schema (np. brak pola / zły typ) → funkcja rzuca. Istniejące happy/error cases z Fazy 2 dalej zielone.

### Success Criteria:

#### Automated Verification:

- Wszystkie testy (w tym nowy „zły wiersz → throw") przechodzą: `npm test`
- Typecheck czysty: `npm run typecheck`
- Build SSR przechodzi: `npm run build`
- Lint czysty: `npm run lint`

#### Manual Verification:

- Dashboard renderuje siatkę klasyfikacji na poprawnych danych bez błędu (brak regresji).
- „Generate plan" (`POST /api/restocking-plan`) zwraca plan na poprawnych danych.
- (Opcjonalnie) ręcznie zasymulowany zły wiersz → API zwraca 500 `{error}`, dashboard degraduje do pustej siatki, nie hard-500.

**Implementation Note**: Po zielonych automatach zatrzymaj się na ręczne potwierdzenie (dashboard + generate plan) przed uznaniem planu za zrealizowany.

---

## Testing Strategy

### Unit Tests:

- `restocking.test.ts`: null-facts sortuje last (G1).
- `db.test.ts`: happy path zwraca dane; `error→throw`; po Fazie 4 `zły wiersz→throw`.
- `rows.test.ts`: zgodność `z.infer<rowSchema>` ↔ `types.ts` (dwukierunkowo).

### Integration Tests:

- Brak nowych E2E w tym wycinku (Playwright poza CI; ścieżka krytyczna weryfikowana ręcznie w Fazie 4).

### Manual Testing Steps:

1. `npm run dev`, zaloguj się, wejdź na `/dashboard` — siatka renderuje się na poprawnych danych.
2. Kliknij „Generate plan" — plan wraca (source `empty`/`ai`/`fallback`).
3. (Opcjonalnie) tymczasowo wprowadź niezgodny wiersz w danych testowych → potwierdź degradację (500 `{error}` / pusta siatka), nie hard-500.

## Performance Considerations

`parse` na batchu odczytu dokłada walidację O(n) po liczbie wierszy raz na request — pomijalne przy skali MVP (kilkadziesiąt–kilkaset produktów/wpisów na usera).

## Migration Notes

Brak migracji danych ani zmiany schematu DB. Wszystkie fazy odwracalne pojedynczym revertem commita; Fazy 1-3 nie zmieniają zachowania produkcyjnego.

## References

- Ranking i dowody: `context/changes/refactor-opportunities/research.md` (§4 #1 C1 / #2 C2, ⭐ G1; „Weryfikacja twierdzeń")
- Analiza źródłowa: `context/changes/restocking-flow-analysis/research.md` (M4L3 §2)
- Reguła granicy I/O: `context/foundation/lessons.md`
- Świadome ograniczenie G1: `context/archive/2026-06-17-restocking-plan-decision-support/plan.md:16,48`
- Wzorce: `src/lib/validation/{product,sales-entry}.ts` (zod), `src/lib/db.ts:6-15,78-87` (DI)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Guard-test dla urgency() (G1)

#### Automated

- [x] 1.1 Nowy test przechodzi: `npm test`
- [x] 1.2 Lint czysty: `npm run lint`

### Phase 2: Testy charakteryzujące db.ts (przed dotknięciem)

#### Automated

- [ ] 2.1 `db.test.ts` przechodzi: `npm test`
- [ ] 2.2 Typecheck czysty: `npm run typecheck`
- [ ] 2.3 Lint czysty: `npm run lint`

### Phase 3: Row-schema jako jedno źródło (mechanizm, na zielono)

#### Automated

- [ ] 3.1 Testy zgodności przechodzą: `npm test`
- [ ] 3.2 Typecheck czysty: `npm run typecheck`
- [ ] 3.3 Lint czysty: `npm run lint`

### Phase 4: Walidacja na odczycie (C2)

#### Automated

- [ ] 4.1 Wszystkie testy (w tym „zły wiersz → throw") przechodzą: `npm test`
- [ ] 4.2 Typecheck czysty: `npm run typecheck`
- [ ] 4.3 Build SSR przechodzi: `npm run build`
- [ ] 4.4 Lint czysty: `npm run lint`

#### Manual

- [ ] 4.5 Dashboard renderuje siatkę na poprawnych danych bez regresji
- [ ] 4.6 „Generate plan" zwraca plan na poprawnych danych
- [ ] 4.7 (Opcjonalnie) zły wiersz → API 500 `{error}` / dashboard pusta siatka, nie hard-500
