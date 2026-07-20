# Guard-first safe slice: urgency guard + validated DB read boundary — Plan Brief

> Full plan: `context/changes/refactor-opportunities/plan.md`
> Research: `context/changes/refactor-opportunities/research.md`

## What & Why

Domykamy najgroźniejszy nieosłonięty szew z analizy ④: **granicę odczytu z DB w `src/lib/db.ts`**, która rzutuje surowe wiersze (`as Product[]`/`as SalesEntry[]`) bez walidacji runtime i bez testów. Robimy to wąskim, odwracalnym wycinkiem w duchu M4L4 — guard najpierw, test przed dotknięciem, mechanizm na zielono, egzekwowanie osobno — plus tani guard-test dla świadomego ograniczenia `urgency()` (G1).

## Starting Point

Zdrowe MVP (0 cykli, dług testowo-wiedzowy). Zapisy walidowane zodem, ale odczyty `db.ts` ufają DB przez cast `as` (3 casty, `db.ts:14/75/86`), a `db.ts` ma ZERO testów. `urgency()` ma świadomy guard `+Infinity` dla null-facts, nietrafiony żadnym testem. Jedyna bramka testowa to vitest.

## Desired End State

Dwa batche ścieżki krytycznej (`getProductsByUser`, `getSalesEntriesByUser`) walidują wiersze row-schemą; uszkodzony/zdryfowany wiersz **rzuca** i degraduje na istniejącej granicy (API 500 / dashboard `groups=[]`). Kształt wiersza ma jedno jawne źródło (`*RowSchema`) spięte z `types.ts` testem typów. `db.ts` i guard `urgency()` mają testy. Cichy dryf schematu staje się głośny.

## Key Decisions Made

| Decision               | Choice                                             | Why                                                                                                     | Source          |
| ---------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------- |
| Który wycinek          | Guard-first: G1 + C2 (nie pełne C1)                | Domyka realną dziurę ZERO-coverage, odwracalne, 0 call-site; MVP nie potrzebuje migracji 16 konsumentów | Plan            |
| G1 guard-test          | Tak — testujemy „sort last"                        | Tanie ubezpieczenie na przyszłą zmianę `classify()`, mimo że branch dziś nieosiągalny                   | Plan            |
| Jedno źródło prawdy    | Nowy plik row-schema + test zgodności z `types.ts` | Wąskie, 0 call-site; typy zostają ręczne, spięte testem                                                 | Plan            |
| Błąd walidacji odczytu | `parse` rzuca → istniejący `catch` (fail-closed)   | Zgodne z `lessons.md` i throw-on-error `db.ts`; robi dryf głośnym                                       | Plan / Research |
| Zakres C2              | Tylko 2 batche ścieżki krytycznej (`db.ts:14,86`)  | Celny wycinek tam, gdzie `classify` liczy na danych                                                     | Plan            |

## Scope

**In scope:** guard-test `urgency()`; `db.test.ts` (happy/error/zły-wiersz); `productRowSchema`/`salesEntryRowSchema` + test typów; walidacja na odczycie w `getProductsByUser` + `getSalesEntriesByUser`.

**Out of scope:** pełne C1 (`types.ts`→`z.infer`, 16 konsumentów); Supabase gen types; walidacja `getProductById`/`getSalesEntriesByProduct`; `safeParse`/drop/warn; testy `summarizeRestockPlan`/endpointu; wpinanie Stryker/Playwright w CI; ścieżka zapisu; zmiana kształtu `urgency()`.

## Architecture / Approach

Row-schema (nowy plik zod) = superset input-schema o kolumny serwerowe, budowany jako świeży `z.object` (bo `salesEntrySchema` to `ZodEffects`; reguły wejścia typu „no future date" nie należą do wiersza). `db.ts` (DI: `supabase` jako parametr → trywialny mock) podmienia `as` na `rowSchema.array().parse(data)` wewnątrz funkcji — sygnatury bez zmian, blast radius call-site = 0. `parse` rzuca → istniejący `catch`.

## Phases at a Glance

| Phase                | What it delivers                                        | Key risk                                           |
| -------------------- | ------------------------------------------------------- | -------------------------------------------------- |
| 1. Guard urgency     | 1 test „null-facts sort last" (0 zmian kodu)            | Brak (test-only)                                   |
| 2. db.test.ts        | Charakteryzacja 2 batchy (happy + error→throw)          | Poprawność mocka chainable Supabase                |
| 3. Row-schema        | `*RowSchema` + test zgodności z `types.ts` (na zielono) | Rozjazd row-schema vs realny wiersz DB             |
| 4. Walidacja odczytu | `parse` w 2 batchach, zły-wiersz→throw                  | Fail-closed: 1 zły wiersz wywraca batch (świadome) |

**Prerequisites:** brak — działamy na istniejącym kodzie; Faza 4 zależy od row-schema (Faza 3).
**Estimated effort:** ~1 sesja, 4 małe odwracalne commity.

## Open Risks & Assumptions

- Fail-closed: jeden niezgodny wiersz wywraca cały batch (świadomy wybór — degradacja na istniejącej granicy, nie ukrywanie danych).
- Row-schema odwzorowuje realny kształt wiersza — smoke-parse reprezentatywnego wiersza w Fazie 3 to potwierdza.
- `[U]` z research: runtime-osiągalność null-facts G1 pozostaje otwarta; guard broni sortu niezależnie od niej.

## Success Criteria (Summary)

- Zły/zdryfowany wiersz z DB przestaje przechodzić po cichu — rzuca i degraduje kontrolowanie.
- `db.ts` i guard `urgency()` mają testy bramkujące (vitest w CI).
- Dashboard i „Generate plan" działają bez regresji na poprawnych danych.
