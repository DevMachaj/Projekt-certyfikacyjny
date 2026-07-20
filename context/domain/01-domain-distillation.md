---
title: StockHelper — Destylacja domeny (Domain Distillation)
created: 2026-07-20
type: domain-distillation
---

# StockHelper — Destylacja domeny

> **Produkt tego dokumentu to MAPA domeny, nie kod.** Wszystkie nazwy bytów, reguł i wymagań
> zostały ODKRYTE z dokumentów źródłowych (`context/foundation/prd.md`, `README.md`,
> `context/foundation/tech-stack.md`) i zweryfikowane w kodzie (`src/`, `supabase/migrations/`).
> Każda teza jest opatrzona cytatem `plik:linia`.

## KROK 0 — Kontekst projektu (odkrycie)

**Dokumenty źródłowe (znalezione):**

- Wizja / wymagania: `context/foundation/prd.md` (PRD — pełny, status `draft`, `context_type: greenfield`).
- Narracja produktu: `README.md` (opis "co robi", wzory biznesowe, mapa routingu).
- Stack: `context/foundation/tech-stack.md` (`10x-astro-starter`: Astro 6 + React 19 + Supabase + Cloudflare).
- Uzupełniająco: `context/foundation/roadmap.md`, `context/foundation/test-plan.md`, katalogi
  `context/changes/*` i `context/archive/*` (historia zmian: `product-catalog-crud`,
  `sales-entry-and-classification`, `classification-dashboard`, `ai-weekly-restocking-plan`,
  `refactor-opportunities`).

**Ograniczenie:** nie ma braku dokumentów — PRD jest bogaty, więc destylacja opiera się na dokumentach

- kodzie (nie tylko README/kod). To sytuacja komfortowa dla mapowania model↔kod.

**Stack i struktura (ustalone z kodu):** SSR Astro (`output: "server"`), React-wyspy tylko dla
interakcji, Supabase (Postgres + Auth + RLS), Cloudflare Workers. Warstwy logiki biznesowej:

| Warstwa         | Lokalizacja                                                                  | Rola                                                         |
| --------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Domena (czysta) | `src/lib/classification.ts`, `src/lib/restocking.ts`, `src/lib/dashboard.ts` | Silnik klasyfikacji velocity, plan restockingu, grupowanie   |
| Serwis AI       | `src/lib/services/restocking-summary.ts`                                     | Streszczenie planu przez LLM z deterministycznym fallbackiem |
| Walidacja       | `src/lib/validation/{product,sales-entry,rows}.ts`                           | Schematy zod współdzielone API↔UI, schematy wierszy DB       |
| Persystencja    | `src/lib/db.ts` + `supabase/migrations/*.sql`                                | Dostęp do Supabase + reguły DB (CHECK, EXCLUDE, RLS)         |
| API             | `src/pages/api/**`                                                           | Kontrakty HTTP, autoryzacja, orkiestracja                    |
| UI              | `src/pages/**.astro`, `src/components/**`                                    | Widoki, wyspy React                                          |
| Auth guard      | `src/middleware.ts`                                                          | Ochrona `PROTECTED_ROUTES`, ustalenie `locals.user`          |

---

## KROK 1 — Ubiquitous Language

Pojęcia wyciągnięte z dokumentów ORAZ z kodu. Cytat = źródło definicji; "Kod" = gdzie termin żyje.

| Pojęcie                          | Definicja (z cytatem źródłowym)                                                                                                                    | Życie w kodzie                                                                                                                                                              |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Product** (produkt)            | Pozycja katalogu: `name, current stock quantity, supplier lead time (days), buffer days (default: 7)` — `prd.md:104`.                              | `src/types.ts:3` (`interface Product`), tabela `supabase/migrations/20260530000001_create_products.sql:1`                                                                   |
| **Sales entry** (wpis sprzedaży) | `units sold over a date range (start date to end date)` dla produktu — `prd.md:117`.                                                               | `src/types.ts:14` (`interface SalesEntry`), `supabase/migrations/20260530000002_create_sales_entries.sql:1`                                                                 |
| **Velocity** (tempo)             | `total units sold ÷ total calendar days covered by all non-overlapping entries` — `prd.md:164`.                                                    | `velocityOf()` `src/lib/classification.ts:115`; `totalHistoryDays()` `:103`                                                                                                 |
| **Days of stock**                | `current_stock_quantity ÷ velocity` — `prd.md:165`.                                                                                                | `src/lib/classification.ts:146`                                                                                                                                             |
| **Reorder quantity**             | `velocity × (lead_time_days + buffer_days)` — `prd.md:166`, `prd.md:130`.                                                                          | `Math.ceil(velocity * (leadTime + product.buffer_days))` `src/lib/classification.ts:153`                                                                                    |
| **Classification state**         | Zbiór stanów: `Understocked / Watch / OK / Slow-mover / Insufficient data` — `prd.md:126`.                                                         | typ `ClassificationState` `src/types.ts:1`; wyliczenie `classify()` `src/lib/classification.ts:122`                                                                         |
| **Insufficient data**            | `fewer than 7 days of non-overlapping sales history` — `prd.md:134`.                                                                               | stała `MIN_HISTORY_DAYS = 7` `src/lib/classification.ts:21`; gałąź `:138`                                                                                                   |
| **Understocked**                 | `days_of_stock < lead_time_days` — `prd.md:175`.                                                                                                   | `src/lib/classification.ts:152`                                                                                                                                             |
| **Watch**                        | `lead_time_days ≤ days_of_stock < 2 × lead_time_days` — `prd.md:175`.                                                                              | `src/lib/classification.ts:173`                                                                                                                                             |
| **OK**                           | `2 × lead_time_days ≤ days_of_stock < 90 days` — `prd.md:176`.                                                                                     | `src/lib/classification.ts:176`                                                                                                                                             |
| **Slow-mover**                   | `days_of_stock ≥ 90 days OR velocity < 0.1 units/day` — `prd.md:177`.                                                                              | stałe `SLOW_VELOCITY=0.1`, `SLOW_DAYS_OF_STOCK=90` `:23-25`; gałęzie `:159`,`:162`                                                                                          |
| **Recommended action**           | `"Order X units"` / `"Consider promotion"` / `"Set lead time..."` — `prd.md:130`.                                                                  | typ `Recommendation` `src/lib/classification.ts:29`; `recommendationText()` `:72`                                                                                           |
| **Threshold definition**         | UI musi pokazać definicję progu każdego stanu — `prd.md:126`.                                                                                      | `THRESHOLD_DEFINITIONS` `src/lib/classification.ts:53`                                                                                                                      |
| **No-overlap rule**              | `reject any entry whose date range overlaps with an existing entry for the same product` — `prd.md:117`.                                           | API `rangesOverlap()` `src/pages/api/products/[id]/sales-entries/index.ts:19`; DB `EXCLUDE USING gist` `supabase/migrations/20260531000001_sales_entries_no_overlap.sql:12` |
| **Dashboard grouping**           | Grupy w stałej kolejności `Understocked → Watch → OK → Slow-mover → Insufficient data`, w grupie alfabetycznie — `prd.md:139`.                     | `STATE_ORDER` `src/lib/classification.ts:65`; `groupProductsByState()` `src/lib/dashboard.ts:47`                                                                            |
| **Weekly restocking plan**       | Priorytetowy plan z AI-streszczeniem + deterministyczny fallback — `README.md:36`. Uwaga: NIE ma osobnego FR w PRD (patrz Non-Goals `prd.md:199`). | `src/lib/restocking.ts`; `src/lib/services/restocking-summary.ts`; API `src/pages/api/restocking-plan/index.ts`                                                             |
| **Restock candidate**            | Produkt w stanie `Understocked`/`Watch` wybrany do planu, z deterministyczną akcją — `src/lib/restocking.ts:10`.                                   | `RestockCandidate` `src/lib/restocking.ts:10`; `selectRestockCandidates()` `:59`                                                                                            |
| **Urgency (pilność)**            | `daysOfStock − leadTime`, mniejsze = pilniejsze — `src/lib/restocking.ts:41`. **BRAK w PRD** (kod-only heurystyka sortowania).                     | `urgency()` `src/lib/restocking.ts:45`                                                                                                                                      |
| **Data isolation**               | `each store owner's products, sales data, and recommendations are strictly isolated` — `prd.md:46`, NFR-003 `prd.md:146`.                          | RLS `auth.uid() = user_id` we wszystkich migracjach; guard `src/middleware.ts:32`                                                                                           |
| **Owner / Store operator**       | `Solo e-commerce store operator`, jedno konto = jeden sklep — `prd.md:32`, `prd.md:193`.                                                           | `context.locals.user` `src/middleware.ts:16`; `user_id` FK w tabelach                                                                                                       |

**Terminy w kodzie bez odpowiednika w PRD (kandydaci na dług językowy):**

- `urgency` / kolejność "most urgent first" — `src/lib/restocking.ts:45` — **BRAK w PRD**. PRD dla
  dashboardu świadomie odrzucił sortowanie po pilności na rzecz grupowania (`prd.md:140`), ale plan
  tygodniowy wprowadza pilność z powrotem — bez udokumentowanej reguły domenowej.
- `RestockCandidate.action = "Monitor"` dla Watch — `src/lib/restocking.ts:65` — **BRAK w PRD**
  (PRD nie definiuje akcji dla Watch; wynaleziona przez kod).
- `source: "ai" | "fallback" | "empty"` — `src/pages/api/restocking-plan/index.ts:40` — **BRAK w PRD**.

---

## KROK 2 — Klasyfikacja subdomen (Core / Supporting / Generic)

Uzasadnienie odwołane do wizji i success criteria: rdzeniem jest INTERPRETACJA danych sprzedaży
w decyzję ("velocity classification, not more charts" — `prd.md:24`; "That decision is the product"
— `prd.md:24`).

| Obszar / pojęcie                                                                       | Kategoria                                      | Uzasadnienie (odwołanie do celów)                                                                                                                                                                              |
| -------------------------------------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Silnik klasyfikacji velocity** (`classify`, `velocityOf`, `totalHistoryDays`, progi) | **CORE**                                       | To jest "the missing step" i przewaga produktu: `prd.md:24` "The platform shows what sold; StockHelper decides what it means". Primary success criterion `prd.md:38`.                                          |
| **Reorder recommendation** (ilość zamówienia, "Consider promotion")                    | **CORE**                                       | Decyzja-do-akcji to sens produktu: `prd.md:24`, FR-007 `prd.md:130`. Odróżnia od arkusza kalkulacyjnego (`prd.md:150`).                                                                                        |
| **No-overlap invariant wpisów sprzedaży**                                              | **CORE** (chroni rdzeń)                        | Overlap `silently corrupt velocity calculation` — `prd.md:119`. Bez tego mianownik velocity jest zafałszowany, więc cała decyzja rdzeniowa jest błędna.                                                        |
| **Honest uncertainty / Insufficient data (próg 7 dni)**                                | **CORE** (guardrail)                           | Guardrail wizji: `prd.md:47` "must show 'Insufficient data' explicitly rather than emit a misleading classification".                                                                                          |
| **Dashboard grouping po stanie**                                                       | **Supporting**                                 | Secondary success criterion `prd.md:42` — "whole catalog's health at a glance". Wspiera rdzeń, ale sam nie jest przewagą; to prezentacja wyników silnika.                                                      |
| **Product catalog CRUD**                                                               | **Supporting**                                 | Konieczny nośnik danych wejściowych (FR-003/004/011), ale generyczny CRUD — wartość powstaje dopiero po klasyfikacji.                                                                                          |
| **Sales entry CRUD**                                                                   | **Supporting**                                 | Dostarcza dane do velocity; wartość w regule no-overlap (Core), nie w samym zapisie.                                                                                                                           |
| **Weekly restocking plan + AI summary**                                                | **Supporting**                                 | Dodatkowa warstwa prezentacji decyzji rdzeniowych. Kluczowe: LLM `never alter a units, state, or action` (`src/lib/restocking.ts:8`) — rdzeń pozostaje deterministyczny. Poza pierwotnym PRD (`README.md:36`). |
| **Auth / rejestracja / logowanie**                                                     | **Generic**                                    | FR-001/002 (`prd.md:95`) — standardowa funkcja; dostarczona out-of-the-box przez Supabase (`tech-stack.md:24`).                                                                                                |
| **Data isolation / RLS**                                                               | **Generic (mechanizm) chroniący Core-wartość** | NFR-003 "absolute property" (`prd.md:146`) — realizowane generycznym mechanizmem RLS Supabase, ale wymaganie ma wagę bezwzględną.                                                                              |
| **Account management / usuwanie konta**                                                | **Generic**                                    | `src/pages/api/account.ts` — retencja/usuwanie danych; standardowa funkcja zgodności.                                                                                                                          |

---

## KROK 3 — Kandydaci na agregaty i ich niezmienniki

Agregat = granica spójności, w której niezmiennik MUSI zawsze zachodzić. StockHelper ma dwa
naturalne agregaty; kluczowa obserwacja: **niezmienniki żyją rozproszone (DB + API + czysta funkcja),
a nie w jednym typie domenowym.**

### Kandydat A — **Product (jako korzeń agregatu) z jego Sales Entries**

Produkt i jego wpisy sprzedaży tworzą jedną granicę spójności: velocity, klasyfikacja i rekomendacja
są funkcją produktu ORAZ pełnego, niezachodzącego zbioru jego wpisów.

| #   | Niezmiennik (cytat źródła)                                                                                                                    | Status egzekwowania                                                                                                                                                                                                                                             |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | **Brak nachodzących zakresów dat** dla tego samego produktu — `prd.md:117`, `prd.md:181`.                                                     | **EGZEKWOWANY podwójnie:** DB `EXCLUDE USING gist` (`...no_overlap.sql:12`) + API pre-check 409 (`sales-entries/index.ts:88`). Najmocniejszy niezmiennik w systemie.                                                                                            |
| A2  | **Klasyfikacja nie powstaje poniżej 7 dni historii** — `prd.md:134`, `prd.md:182`.                                                            | **EGZEKWOWANY** w czystej funkcji `classify()` `src/lib/classification.ts:138`. Ale nie w typie — każdy wywołujący musi pamiętać, by przeliczyć.                                                                                                                |
| A3  | **Kolejność ewaluacji stanów** (Understocked wygrywa nad Slow-mover przy zbliżającym się stockout) — oracle w `src/lib/classification.ts:13`. | **EGZEKWOWANY** kolejnością gałęzi `:152→159`. Reguła DEKLAROWANA w komentarzu, nie w PRD wprost — ryzyko dryfu, jeśli ktoś przestawi warunki.                                                                                                                  |
| A4  | **Reorder quantity tylko gdy lead time ustawiony** — `prd.md:130`, `prd.md:183`.                                                              | **EGZEKWOWANY** `leadTime != null` `:152`; fallback `set-lead-time` `:167`.                                                                                                                                                                                     |
| A5  | **Usunięcie produktu kasuje wszystkie jego wpisy** — `prd.md:112`, US-02 `prd.md:75`.                                                         | **EGZEKWOWANY** przez DB `ON DELETE CASCADE` (`...create_sales_entries.sql:3`); API polega na kaskadzie (`products/[id].ts:64`).                                                                                                                                |
| A6  | **Cała historia produktu musi być przeliczona po każdej zmianie wpisu** (NFR-001 <1s) — `prd.md:144`, `prd.md:59`.                            | **CZĘŚCIOWO / ROZPROSZONY.** Przy zapisie/usuwaniu wpisu API przelicza jawnie (`sales-entries/index.ts:108`, `[entryId].ts:38`). Przy **edycji produktu** (PATCH) klasyfikacja NIE jest przeliczana ani zwracana (`products/[id].ts:37-42`) — patrz rozjazd #1. |

**Wniosek dla A:** Agregat istnieje pojęciowo, ale w kodzie jest tylko **luźną parą argumentów**
`classify(product, entries)` (`src/lib/classification.ts:122`). Nie ma typu, który gwarantuje, że
`entries` to KOMPLETNY i niezachodzący zbiór dla `product`. Poprawność zależy od dyscypliny każdego
wywołującego (ładuj wszystkie wpisy → przelicz).

### Kandydat B — **RestockPlan (korzeń: katalog użytkownika w danym tygodniu)**

| #   | Niezmiennik (cytat)                                                                                                                    | Status                                                                                                                                                                                                           |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | **LLM nie może zmienić units / state / action / kolejności** — `src/lib/restocking.ts:8`, `src/lib/services/restocking-summary.ts:10`. | **EGZEKWOWANY** przez merge tylko po `product`+`reason` (`mergeAiReasons` `restocking-summary.ts:111`) i budowę planu z deterministycznych kandydatów jako źródła prawdy (`:135`). Silny, dobrze udokumentowany. |
| B2  | **Do planu trafiają tylko stany Understocked/Watch** — `src/lib/restocking.ts:37`.                                                     | **EGZEKWOWANY** `RESTOCK_STATES` filtr `:60`. **BRAK w PRD** (reguła kod-only).                                                                                                                                  |
| B3  | **Pilność: Understocked przed Watch, potem `daysOfStock−leadTime` rosnąco** — `src/lib/restocking.ts:41`.                              | **EGZEKWOWANY** `urgency()` sort `:78`. **BRAK w PRD** — niezmiennik istnieje wyłącznie w kodzie; brak oracle domenowego.                                                                                        |

### Kandydat C — **Owner (granica izolacji danych)**

| #   | Niezmiennik (cytat)                                                                                                                     | Status                                                                                                                                                                                |
| --- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | **Dane jednego właściciela nigdy widoczne dla innego konta, także w błędach** (własność absolutna) — NFR-003 `prd.md:146`, `prd.md:46`. | **EGZEKWOWANY** przez RLS `auth.uid() = user_id` (wszystkie migracje) + guard `middleware.ts:32`. `deleteSalesEntry` dodatkowo skopowany po `product_id` (`db.ts:110`). Bardzo mocny. |

---

## KROK 4 — Rozjazdy MODEL vs KOD

Najcenniejsza część: gdzie wiedza domenowa istnieje, a kod jej nie odwzorowuje (lub odwrotnie —
kod wprowadza reguły, których model nie zna).

| #   | Dokument mówi (MODEL)                                                                                                        | Kod robi (KOD)                                                                                                                                                                                                                                      | Dowód (plik:linia)                                                                                                         |
| --- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 1   | US-02 AC: `classification recalculates on save` po edycji produktu; NFR-001: aktualizacja w <1s (`prd.md:74`, `prd.md:144`). | PATCH produktu zwraca **tylko produkt**, bez przeliczonej klasyfikacji. Przeliczenie jest leniwe — dopiero przy następnym GET strony/dashboardu. Niezmiennik A6 spełniony tylko pośrednio.                                                          | `src/pages/api/products/[id].ts:37-42` vs eager recompute przy wpisach `.../sales-entries/index.ts:108`                    |
| 2   | Agregat "Produkt + jego wpisy" jako spójna całość z niezmiennikami (velocity liczona z KOMPLETNEGO zbioru).                  | Brak typu agregatu; `classify(product, entries)` przyjmuje luźne argumenty — kompletność `entries` nie jest wymuszona typem, tylko konwencją wywołania.                                                                                             | `src/lib/classification.ts:122`; wywołania: `dashboard.ts:29`, `sales-entries/index.ts:108`, `restocking-plan/index.ts:36` |
| 3   | PRD dashboard **odrzucił** sortowanie po pilności na rzecz grupowania po stanie (`prd.md:140`).                              | Plan tygodniowy wprowadza pilność (`urgency = daysOfStock − leadTime`) jako niezmiennik B3 — nieudokumentowany w żadnym FR.                                                                                                                         | `src/lib/restocking.ts:41-48` vs `prd.md:139-140`                                                                          |
| 4   | Cały moduł "Weekly restocking plan + AI" jest realną funkcją produkcyjną (README, testy, endpoint).                          | PRD go NIE zawiera jako FR, a Non-Goals mówią `No demand forecasting` (choć AI robi tylko streszczenie, nie prognozę — granica cienka). Wiedza domenowa dla tej funkcji żyje w kodzie, nie w PRD.                                                   | `README.md:36`, `src/lib/restocking.ts` vs brak FR w `prd.md:91-141`; Non-Goals `prd.md:199`                               |
| 5   | Reguła jakości: `end_date may not be in the future` (walidacja wejścia).                                                     | DB tej reguły NIE egzekwuje — tylko warstwa zod (API). Wpis w przyszłości wstawiony inną ścieżką ominąłby regułę i zawyżył dni/velocity.                                                                                                            | `src/lib/validation/sales-entry.ts:48` (komentarz `:14` przyznaje: "a data-quality rule the DB does not enforce")          |
| 6   | Formuła velocity liczy "total calendar days covered by all non-overlapping entries" (`prd.md:164`).                          | Kod liczy **kopertę kalendarzową** `max(end) − min(start) + 1`, więc dni w LUKACH między wpisami liczą się jako zero-sprzedaży. To rozstrzygnięcie oracle, nie dosłowna treść PRD ("covered by entries" można czytać jako sumę spanów).             | `totalHistoryDays()` `src/lib/classification.ts:103-112`, komentarz-oracle `:11`                                           |
| 7   | Akcja dla stanu **Watch** nie jest zdefiniowana w PRD (FR-007 opisuje tylko Understocked i Slow-mover — `prd.md:130`).       | Kod nadaje Watch akcję `"Monitor"` w planie restockingu.                                                                                                                                                                                            | `src/lib/restocking.ts:65`                                                                                                 |
| 8   | Term "recommendations" traktowany jak dane izolowane per-owner (NFR-003 `prd.md:146`).                                       | Rekomendacje/klasyfikacje NIE są przechowywane — są liczone w locie z produktu+wpisów. Izolacja "recommendations" jest emergentna (izolowane są wejścia), nie osobno egzekwowana. Zgodne z intencją, ale model sugeruje byt trwały, którego nie ma. | brak tabeli rekomendacji w `supabase/migrations/*`; liczone `classify()` `src/lib/classification.ts:122`                   |

---

## KROK 5 — Ranking refaktoru (wartość × ryzyko)

Wartość = jak rdzeniowy jest niezmiennik. Ryzyko = jak słabo dziś egzekwowany.

| Ranga  | Cel refaktoru                                                                                                                                                                                                                     | Wartość (rdzeń)                                                                       | Ryzyko (słabość egzekwowania)                                                                                                                                       |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **#1** | **Wydzielić agregat `Product` (korzeń) domykający swoje `SalesEntry` i niezmienniki A1–A6** — jeden typ, który liczy velocity/klasyfikację TYLKO z kompletnego, niezachodzącego zbioru i zwraca klasyfikację przy każdej mutacji. | **Najwyższa** — to jest rdzeń produktu (`prd.md:24`): interpretacja danych w decyzję. | **Wysokie** — niezmienniki rozproszone (DB+API+czysta funkcja), kompletność `entries` niewymuszona typem (rozjazd #2), a A6 pęka przy edycji produktu (rozjazd #1). |
| **#2** | **Udomowić plan tygodniowy: przenieść `urgency`/`Monitor`/`RESTOCK_STATES` do jawnej reguły domenowej i zapisać ją w PRD.**                                                                                                       | Średnia-wysoka — chroni rdzeniową obietnicę "priorytetowej decyzji".                  | Wysokie od strony językowej — trzy niezmienniki (B2, B3, akcja Watch) istnieją tylko w kodzie, bez oracle (rozjazdy #3, #4, #7).                                    |
| **#3** | **Domknąć niezmiennik "brak dat w przyszłości" na poziomie DB** (CHECK/trigger), a nie tylko zod.                                                                                                                                 | Średnia — chroni mianownik velocity (rdzeń), ale rzadka ścieżka ataku.                | Średnie — jedyna ścieżka to zapis z pominięciem API (rozjazd #5).                                                                                                   |

### Rekomendacja #1 do refaktoru

**Agregat `Product` + `SalesEntry`.** Uzasadnienie: to jednocześnie najbardziej rdzeniowy obszar
domeny (silnik klasyfikacji = "the product", `prd.md:24`) i najsłabiej domknięty strukturalnie —
`classify(product, entries)` (`src/lib/classification.ts:122`) jest czystą funkcją zależną od
DYSCYPLINY wołającego, że `entries` są kompletne i niezachodzące. Niezmiennik no-overlap (A1) jest
dziś broniony przez DB i API, ale przeliminacja velocity (A6) pęka przy edycji produktu
(`products/[id].ts:37`), a kompletność zbioru nie jest wymuszona nigdzie w typie. Wprowadzenie
korzenia agregatu (np. `ProductAggregate` z metodami `addEntry`/`removeEntry`/`classify()`, które
przyjmują pełny zbiór i zwracają nową klasyfikację) skupiłoby wszystkie sześć niezmienników A1–A6
w jednej granicy spójności i uczyniło "recompute-on-change" niemożliwym do pominięcia.

---

## Ograniczenia dokumentu

- Cytowane są wyłącznie ścieżki/linie realnie odczytane w tej sesji (`src/lib/*`, `src/pages/api/**`,
  `supabase/migrations/*`, `context/foundation/prd.md`, `README.md`, `tech-stack.md`).
- Nie napisano kodu produkcyjnego — dokument jest mapą, nie implementacją.
- Numeracja FR/NFR/US pochodzi z PRD (odkryta, nie założona).
