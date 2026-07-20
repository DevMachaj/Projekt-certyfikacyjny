---
title: StockHelper — Niezmiennik #1 i agregat-strażnik (plan refaktoru)
created: 2026-07-20
type: refactor-plan
---

# StockHelper — Niezmiennik #1 i agregat-strażnik

> **Produkt tego dokumentu to PLAN, nie kod.** Niezmiennik #1 wybrano WŁASNĄ analizą
> (odkrycie → identyfikacja → klasyfikacja), a nie przez skopiowanie wniosku z
> `01-domain-distillation.md`. Każda teza o kodzie ma cytat `plik:linia` odczytany w tej sesji.
> Fail-fast: nielegalna operacja ma zatrzymywać, nie logować-i-jechać dalej.

---

## KROK 0 — Kontekst (odkrycie)

**Dokumenty źródłowe (znalezione):** `context/foundation/prd.md` (bogaty PRD z sekcjami _Functional
Requirements_, _Business Logic_, _NFR_, _Access Control_), `README.md`, `context/foundation/tech-stack.md`,
`context/foundation/lessons.md` (append-only rejestr reguł "load-bearing").

**Stack (ustalony z kodu):** Astro 6 SSR (`output: "server"`), React 19 wyspy, Supabase (Postgres + Auth +
RLS), Cloudflare Workers. Warstwy, w których żyje logika biznesowa:

| Warstwa          | Lokalizacja                                                                  | Rola                                                       |
| ---------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Domena (czysta)  | `src/lib/classification.ts`, `src/lib/restocking.ts`, `src/lib/dashboard.ts` | Silnik velocity/klasyfikacji, plan restockingu, grupowanie |
| Walidacja        | `src/lib/validation/{sales-entry,product,rows}.ts`                           | Schematy zod współdzielone API↔UI                          |
| Persystencja     | `src/lib/db.ts` + `supabase/migrations/*.sql`                                | Dostęp do Supabase + reguły DB (CHECK, EXCLUDE, RLS)       |
| API              | `src/pages/api/**`                                                           | Kontrakty HTTP, autoryzacja, orkiestracja                  |
| UI (SSR + wyspy) | `src/pages/**.astro`, `src/components/**`                                    | Widoki, wyspy React                                        |

**Dyscyplina testowa:** projekt jest test-first — istnieje runner `vitest`
(`vitest.config.ts:15` → `include: ["src/**/*.test.ts"]`) i pełny zestaw testów jednostkowych
(`src/lib/classification.test.ts`, `dashboard.test.ts`, `restocking.test.ts`, `db.test.ts`,
`validation/rows.test.ts`, `services/restocking-summary.test.ts`). Plan poniżej ma fazy test-first.

---

## KROK 1 — IDENTYFIKACJA niezmienników

Reguły, które w tej domenie MUSZĄ być zawsze prawdziwe — wyciągnięte z dokumentów ORAZ z kodu.

| #      | Niezmiennik (co MUSI zawsze zachodzić)                                                                                                                           | Źródło (dokument)                                                                                      | Życie w kodzie                                                                                                                                                           |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **I1** | Żadne dwa wpisy sprzedaży tego samego produktu nie mają nachodzących zakresów dat.                                                                               | FR-005 `prd.md:117`; reguła `prd.md:181`                                                               | DB `EXCLUDE USING gist` `supabase/migrations/20260531000001_sales_entries_no_overlap.sql:12`; API pre-check 409 `src/pages/api/products/[id]/sales-entries/index.ts:89`  |
| **I2** | Klasyfikacja/rekomendacja jest liczona z produktu ORAZ **kompletnego** zbioru jego wpisów; velocity = `Σunits ÷ dni kalendarzowe pokryte przez wszystkie wpisy`. | Formuły `prd.md:164`; "silently corrupt velocity" `prd.md:119`                                         | `classify(product, entries)` `src/lib/classification.ts:122`; `velocityOf` `:115`; `totalHistoryDays` `:103`                                                             |
| **I3** | Po KAŻDEJ mutacji wejścia (wpis dodany/usunięty, LUB edycja `stock_quantity`/`lead_time_days`/`buffer_days`) klasyfikacja jest przeliczona w <1s.                | US-02 AC "classification recalculates on save" `prd.md:110`; NFR-001 `prd.md:144`; Output `prd.md:187` | Eager recompute przy wpisach: POST `.../sales-entries/index.ts:108`, DELETE `.../[entryId].ts:37`. **Brak** przy edycji produktu: `src/pages/api/products/[id].ts:37-42` |
| **I4** | Klasyfikacja nie powstaje poniżej 7 dni historii — zamiast tego jawne "Insufficient data".                                                                       | FR-008 `prd.md:134`; reguła `prd.md:182`                                                               | `MIN_HISTORY_DAYS=7` `src/lib/classification.ts:21`; gałąź `:138`                                                                                                        |
| **I5** | Reorder quantity pokazywana tylko gdy `lead_time_days` ustawiony; wzór `ceil(velocity×(lead+buffer))`.                                                           | FR-007 `prd.md:130`; reguła `prd.md:183`                                                               | `leadTime != null` `src/lib/classification.ts:152`; fallback `set-lead-time` `:167`                                                                                      |
| **I6** | Usunięcie produktu kasuje wszystkie jego wpisy (atomowo).                                                                                                        | FR-011 `prd.md:112`                                                                                    | DB `ON DELETE CASCADE` `supabase/migrations/20260530000002_create_sales_entries.sql:3`                                                                                   |
| **I7** | Dane jednego właściciela nigdy widoczne dla innego konta, także w błędach (własność absolutna).                                                                  | NFR-003 `prd.md:146`                                                                                   | RLS `auth.uid()=user_id` (wszystkie migracje); guard `src/middleware.ts`                                                                                                 |
| **I8** | LLM nigdy nie zmienia `units`/`state`/`action`/kolejności — tylko przeredagowuje prozę streszczenia.                                                             | `src/lib/restocking.ts:8` (kod-only, brak FR)                                                          | Plan budowany z deterministycznych kandydatów `src/lib/restocking.ts:101`; merge tylko `reason`                                                                          |
| **I9** | `end_date` nie może być w przyszłości (reguła jakości danych chroniąca mianownik velocity).                                                                      | Komentarz `src/lib/validation/sales-entry.ts:12` (brak w PRD)                                          | zod `.refine(... <= todayUTC())` `:48`; **DB NIE egzekwuje**                                                                                                             |

---

## KROK 2 — KLASYFIKACJA i wybór #1

Trzy osie: **(a) rdzeniowość** (jak blisko sensu produktu), **(b) rozsmarowanie** (w ilu warstwach/plikach
żyje reguła), **(c) egzekwowanie** (EGZEKWOWANY / DEKLAROWANY / NARUSZALNY).

| #                                        | (a) Rdzeniowość                                                                   | (b) Rozsmarowanie                         | (c) Egzekwowanie                                                                                                                    |
| ---------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| I1 no-overlap                            | Wysoka (chroni mianownik velocity)                                                | 2 warstwy (DB+API)                        | **MOCNE** — DB `EXCLUDE` + API 409. Nie jest kandydatem #1.                                                                         |
| **I2 kompletność wejścia + I3 świeżość** | **Najwyższa — to JEST produkt** (`prd.md:24` "StockHelper decides what it means") | **Najszersze — 8+ miejsc** (patrz KROK 3) | **NAJSŁABSZE** — kompletność `entries` niewymuszona typem; recompute wpięty ręcznie w 2 z 3 tras mutacji, BRAK przy PATCH produktu. |
| I4 Insufficient data                     | Wysoka (guardrail wizji `prd.md:47`)                                              | 1 miejsce (czysta funkcja)                | Umiarkowane — spójne, bo jedyna droga to `classify()`.                                                                              |
| I5 reorder-only-with-lead                | Wysoka                                                                            | 2 (czysta funkcja + UI)                   | Mocne (kolejność gałęzi).                                                                                                           |
| I6 kaskada                               | Średnia                                                                           | 1 (DB)                                    | Mocne (DB).                                                                                                                         |
| I7 izolacja                              | Wysoka (absolutna)                                                                | 3 (RLS+guard+db)                          | Mocne (RLS).                                                                                                                        |
| I8 LLM read-only                         | Średnia-wysoka                                                                    | 2                                         | Mocne (architektura merge).                                                                                                         |
| I9 brak dat w przyszłości                | Średnia                                                                           | 1 (tylko zod)                             | Słabe, ale wąska ścieżka ataku.                                                                                                     |

### Wybór: **NIEZMIENNIK #1 = I2 ⊕ I3 — "Prowieniencja i świeżość klasyfikacji"**

> **Nazwana reguła domenowa (kandydat do rejestru):**
> **`CLASSIFICATION_PROVENANCE_FRESHNESS`** — _Każda klasyfikacja/rekomendacja, którą system emituje,
> jest czystą funkcją produktu ORAZ **kompletnego, niezachodzącego, aktualnego** zbioru jego wpisów
> sprzedaży — nigdy zbioru częściowego, obcego ani nieświeżego — i JEST przeliczana przy każdej mutacji
> dowolnego wejścia (wpis, `stock_quantity`, `lead_time_days`, `buffer_days`)._

**Uzasadnienie wyboru (rdzeniowy I najsłabiej egzekwowany jednocześnie):**

1. **Najbardziej rdzeniowy.** Klasyfikacja to nie funkcja poboczna — to CAŁY produkt: `prd.md:24`
   "The platform shows what sold; StockHelper decides what it means. That decision is the product".
   Klasyfikacja policzona z niekompletnego zbioru wpisów jest _cicho błędna_ — dokładnie ta krzywda,
   której PRD się boi ("overlapping date ranges silently corrupt velocity calculation" `prd.md:119`).
   Zły `state`/`units` to podważenie zaufania do algorytmu, który jest jedyną przewagą nad arkuszem
   (`prd.md:150`).

2. **Najsłabiej egzekwowany strukturalnie.** W przeciwieństwie do I1 (broniony fizycznie przez DB),
   I2/I3 nie ma ŻADNEGO strażnika strukturalnego:
   - Sygnatura `classify(product: Product, entries: SalesEntry[])` (`src/lib/classification.ts:122`)
     przyjmuje **dwie luźne tablice**. Nic w typie nie gwarantuje, że `entries` to KOMPLETNY zbiór
     wpisów należących do `product`. Można legalnie (typami) wywołać `classify(produktA, wpiszB)` albo
     `classify(product, [tylko_jeden_wpis])` — i dostać zafałszowaną velocity.
   - "Recompute-on-change" (I3) jest wpięty **ręcznie, per-trasa**: przy wpisach — tak
     (`sales-entries/index.ts:108`, `[entryId].ts:37`); przy **edycji produktu — NIE**
     (`products/[id].ts:37-42` zwraca sam produkt). To narusza wprost US-02 AC ("classification
     recalculates on save" `prd.md:110`) i NFR-001, bo `lead_time_days`/`stock_quantity` to
     BEZPOŚREDNIE wejścia do `classify()`.

3. **Najszerzej rozsmarowany** — reguła żyje w 8+ miejscach (KROK 3), a jej poprawność zależy wyłącznie
   od dyscypliny każdego wywołującego ("załaduj wszystkie wpisy → przelicz").

> **Rozgraniczenie względem `01-domain-distillation.md`:** dokument 01 zaproponował ogólne "wydzielić
> agregat Product domykający A1–A6". Moja analiza zawęża i uściśla wybór: **I1 (no-overlap) traktuję
> jako już-mocno-egzekwowaną pod-część**, a jako niezmiennik #1 wskazuję **kompletność wejścia + świeżość
> (I2⊕I3)** — bo to właśnie ta oś jest jednocześnie rdzeniowa i strukturalnie bezbronna. Agregat ma być
> strażnikiem prowieniencji i świeżości, a I1 wchodzi do niego jako precondition, nie jako sedno.

---

## KROK 3 — DIAGNOZA niezmiennika #1

Gdzie dziś żyje reguła `CLASSIFICATION_PROVENANCE_FRESHNESS` i gdzie pęka.

### 3.1 Gdzie reguła jest liczona (rozsmarowanie)

| Miejsce              | Cytat                                                        | Co robi z regułą                                                                                                                                                              |
| -------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Czysta funkcja       | `classify(product, entries)` `src/lib/classification.ts:122` | Sedno; ale przyjmuje luźne argumenty — **nie waliduje prowieniencji ani kompletności**.                                                                                       |
| Pomocnik katalogu    | `classifyUserCatalog` `src/lib/dashboard.ts:19-31`           | Grupuje płaską listę wpisów po `product_id` do `Map` i paruje z produktem. Kompletność zależy od tego, że `getSalesEntriesByUser` zwrócił WSZYSTKIE wiersze (brak paginacji). |
| SSR strony szczegółu | `src/pages/products/[id].astro:24-25`                        | `getSalesEntriesByProduct` → `classify`. Świeże przy renderze serwera.                                                                                                        |
| SSR dashboardu       | `src/pages/dashboard.astro:24`                               | `groupProductsByState(classifyUserCatalog(...))`.                                                                                                                             |
| API GET wpisów       | `.../sales-entries/index.ts:45-46`                           | Ładuje wpisy, przelicza.                                                                                                                                                      |
| API POST wpisu       | `.../sales-entries/index.ts:108`                             | `classify(product, [...existing, entry])` — **rekonstruuje zbiór ręcznie** zamiast przeładować.                                                                               |
| API DELETE wpisu     | `.../sales-entries/[entryId].ts:37-38`                       | Przeładowuje i przelicza.                                                                                                                                                     |
| API restocking       | `restocking-plan/index.ts:36`                                | `selectRestockCandidates(classifyUserCatalog(products, entries))`.                                                                                                            |
| Wyspa UI             | `ProductDetail` `src/components/sales/ProductDetail.tsx:45`  | Trzyma `classification` w stanie React; podmienia z odpowiedzi API przy mutacji wpisu.                                                                                        |

### 3.2 Gdzie reguła pęka (diagnoza)

**Pęknięcie A — świeżość NIE jest egzekwowana przy edycji produktu (naruszenie I3).**
`PATCH /api/products/[id]` zwraca **tylko** zmieniony produkt, bez przeliczonej klasyfikacji:

```
// src/pages/api/products/[id].ts:36-42
const product = await updateProduct(supabase, id, parsed.data);
if (!product) return Response.json({ error: "Product not found" }, { status: 404 });
return Response.json({ product }, { status: 200 });   // ← brak classify(), brak wpisów
```

Skutek: zmiana `lead_time_days` (np. `null → 5`, może przerzucić `OK → Understocked`) albo
`stock_quantity` — bezpośrednie wejścia `classify()` (`classification.ts:146-152`) — **nie**
skutkuje przeliczoną decyzją w odpowiedzi. Reguła US-02 AC `prd.md:110` ("classification recalculates
on save") jest złamana dla ścieżki edycji produktu; NFR-001 spełnione tylko pośrednio (dopiero przy
następnym pełnym renderze SSR strony). To **client jest jedynym strażnikiem świeżości** dla edycji
produktu — a i ten nie umie przeliczyć (silnik jest server-side-only, `classification.ts:8`).

**Pęknięcie B — kompletność zbioru nie jest wymuszona nigdzie w typie (naruszenie I2).**
`classify(product, entries)` (`classification.ts:122`) i `classifyUserCatalog(products, entries)`
(`dashboard.ts:19`) przyjmują luźne tablice. Poprawność opiera się na _konwencji wołania_
("załaduj wszystkie"). POST wpisu wręcz **rekonstruuje** zbiór arytmetycznie zamiast go przeładować:

```
// src/pages/api/products/[id]/sales-entries/index.ts:108
const classification = classify(product, [...existing, entry]);
```

Jeśli `existing` byłoby kiedyś przefiltrowane/spaginowane (dziś `getSalesEntriesByProduct` nie
paginuje — `db.ts:70-79`), velocity policzy się z niekompletnego mianownika — **cicho**, bez błędu.

**Pęknięcie C — brak bariery prowieniencji `product ↔ entries`.** Typy nie zapobiegają
`classify(produktA, wpisyProduktuB)`. Dziś ratuje to skopowanie zapytań po `product_id`
(`db.ts:70-79`) i po `id`+`product_id` przy DELETE (`db.ts:110-119`), ale to znów _dyscyplina zapytań_,
nie niezmiennik typu.

**Połykanie błędu.** Powyższe naruszenia nie zatrzymują operacji — dają _cicho złą liczbę_. To odwrotność
fail-fast: system nie krzyczy, tylko emituje błędną decyzję. Jedyne miejsce fail-closed to walidacja
wierszy DB (`db.ts:17`, `:90`) — ale ona chroni _kształt_ wiersza, nie _kompletność zbioru_.

---

## KROK 4 — PROJEKT agregatu-strażnika

Cel: jeden byt — **`ProductAggregate`** (root = `Product`) — jest **JEDYNYM** miejscem, w którym
klasyfikacja może powstać, i strukturalnie gwarantuje I2⊕I3 (oraz przyjmuje I1/I4/I5 jako preconditions).
Klasyfikacji nie da się policzyć inaczej niż przez załadowany agregat z kompletnym zbiorem.

### 4.1 Root agregatu — niezmienniki w konstruktorze (fail-fast)

```
// src/lib/domain/product-aggregate.ts   (NOWY — czysty, importuje tylko typy)

/** Rzucane, gdy próbuje się zbudować agregat z niespójnego zbioru wpisów. */
export class ProductAggregateInvariantError extends Error {
  constructor(public readonly code:
    | "FOREIGN_ENTRY"        // wpis nie należy do tego produktu (I2/prowieniencja)
    | "OVERLAPPING_ENTRIES"  // dwa wpisy nachodzą (I1)
    | "FUTURE_ENTRY",        // end_date w przyszłości (I9)
    message: string) { super(message); this.name = "ProductAggregateInvariantError"; }
}

export class ProductAggregate {
  private constructor(
    private readonly product: Product,
    private readonly entries: ReadonlyArray<SalesEntry>, // KOMPLETNY, posortowany, niezachodzący
  ) {}

  /**
   * JEDYNY konstruktor. `entries` MUSI być kompletnym zbiorem wpisów tego produktu.
   * Waliduje preconditions i rzuca nazwanym błędem — nie "poprawia po cichu".
   */
  static rehydrate(product: Product, entries: SalesEntry[]): ProductAggregate {
    for (const e of entries) {
      if (e.product_id !== product.id)
        throw new ProductAggregateInvariantError("FOREIGN_ENTRY",
          `Entry ${e.id} does not belong to product ${product.id}`);
    }
    const sorted = [...entries].sort((a, b) => a.start_date.localeCompare(b.start_date));
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].start_date <= sorted[i - 1].end_date) // '[]' inclusive, jak DB EXCLUDE
        throw new ProductAggregateInvariantError("OVERLAPPING_ENTRIES",
          `Entries ${sorted[i - 1].id} and ${sorted[i].id} overlap`);
    }
    return new ProductAggregate(product, sorted);
  }

  /** Klasyfikacja — jedyne wejście do silnika. Deleguje do istniejącej czystej reguły. */
  classify(): ClassificationResult { return classify(this.product, this.entries); }

  /**
   * Precondition + nowy stan: dodanie wpisu. Rzuca zamiast cicho akceptować nachodzący/przyszły wpis.
   * Zwraca NOWY agregat (immutable) — recompute jest nierozłączny z mutacją.
   */
  withNewEntry(candidate: NewSalesEntry, today: string): ProductAggregate {
    if (candidate.end_date > today)
      throw new ProductAggregateInvariantError("FUTURE_ENTRY", "end_date cannot be in the future");
    const overlaps = this.entries.some(e =>
      candidate.start_date <= e.end_date && e.start_date <= candidate.end_date);
    if (overlaps)
      throw new ProductAggregateInvariantError("OVERLAPPING_ENTRIES", OVERLAP_MESSAGE);
    return ProductAggregate.rehydrate(this.product, [...this.entries, materialize(candidate)]);
  }

  withoutEntry(entryId: string): ProductAggregate {
    return ProductAggregate.rehydrate(this.product, this.entries.filter(e => e.id !== entryId));
  }

  /** Zmiana pól produktu wpływających na klasyfikację → nowy agregat, świeżość wymuszona typem. */
  withPatchedProduct(patch: ProductUpdateInput): ProductAggregate {
    return ProductAggregate.rehydrate({ ...this.product, ...patch }, [...this.entries]);
  }

  get snapshot(): { product: Product; entries: readonly SalesEntry[] } { /* do zapisu/serializacji */ }
}
```

Kluczowy efekt: **nie istnieje ścieżka do `ClassificationResult`, która nie przeszła przez
`rehydrate`** — a `rehydrate` odrzuca obcy/nachodzący/niekompletny wkontekst. Pęknięcia B i C znikają
na poziomie typu; recompute (I3) jest _nierozłączny_ z mutacją, bo każda metoda mutująca zwraca nowy
agregat, z którego widok bierze `classify()`.

### 4.2 Repozytorium — ładuje/zapisuje CAŁY agregat

```
// src/lib/domain/product-aggregate-repo.ts   (NOWY — cienka warstwa nad db.ts)

/** Ładuje root + KOMPLETNY zbiór wpisów w jednej, spójnej operacji odczytu. */
export async function loadAggregate(
  supabase: SupabaseClient, productId: string,
): Promise<ProductAggregate | null> {
  const product = await getProductById(supabase, productId);        // db.ts:60 (RLS → izolacja I7)
  if (!product) return null;
  const entries = await getSalesEntriesByProduct(supabase, productId); // db.ts:70 — pełny zbiór
  return ProductAggregate.rehydrate(product, entries);              // I2/I1 walidowane tu
}
```

**Atomowość (I3 + I6).** Zapis mutacji wpisu + odczyt do przeliczenia musi być spójny. Docelowo:
opakować `insert/delete wpisu` i następujący po nim odczyt w **jedną transakcję** — w Supabase przez
RPC/`postgres function` (`SECURITY INVOKER`, żeby RLS dalej działała), np.
`create_sales_entry_and_return_set(product_id, entry) RETURNS SETOF sales_entries`. Wtedy warstwa API
nie rekonstruuje zbioru (`[...existing, entry]`), tylko dostaje kanoniczny, świeży zbiór z DB i wywołuje
`ProductAggregate.rehydrate(...).classify()`. I1 pozostaje dodatkowo broniony przez DB `EXCLUDE`
(backstop). Jeśli RPC uznamy za nadmiarowe na MVP — minimum: po mutacji **przeładować** pełny zbiór
(`loadAggregate`) zamiast rekonstruować go arytmetycznie.

### 4.3 Cienkie API/route — parse → metoda agregatu → mapowanie błędu

```
// PATCH /api/products/[id]  — po refaktorze (naprawia Pęknięcie A / I3):
const parsed = productUpdateSchema.safeParse(body);
if (!parsed.success) return Response.json({ error: "Validation failed", issues }, { status: 400 });
try {
  const agg = await loadAggregate(supabase, id);
  if (!agg) return Response.json({ error: "Product not found" }, { status: 404 });
  const next = agg.withPatchedProduct(parsed.data);
  const saved = await updateProduct(supabase, id, parsed.data);   // persist (db.ts:32)
  if (!saved) return Response.json({ error: "Product not found" }, { status: 404 });
  return Response.json({ product: saved, classification: next.classify() }, { status: 200 }); // ← świeżość
} catch (e) { /* mapuj ProductAggregateInvariantError → 409/422; reszta → 500 */ }
```

```
// POST /api/products/[id]/sales-entries — po refaktorze (naprawia Pęknięcia B/C):
try {
  const agg = await loadAggregate(supabase, id);
  if (!agg) return Response.json({ error: "Product not found" }, { status: 404 });
  let next: ProductAggregate;
  try { next = agg.withNewEntry(parsed.data, todayUTC()); }
  catch (e) {
    if (e instanceof ProductAggregateInvariantError && e.code === "OVERLAPPING_ENTRIES")
      return Response.json({ error: OVERLAP_MESSAGE }, { status: 409 });   // fail-fast, nie 201
    if (e instanceof ProductAggregateInvariantError && e.code === "FUTURE_ENTRY")
      return Response.json({ error: "End date cannot be in the future" }, { status: 422 });
    throw e;
  }
  const entry = await createSalesEntry(supabase, user.id, id, parsed.data); // persist; DB EXCLUDE = backstop
  return Response.json({ entry, classification: next.classify() }, { status: 201 });
} catch { return Response.json({ error: "Failed to create sales entry" }, { status: 500 }); }
```

**Egzekucja przenosi się z klienta na serwer.** Dziś jedynym strażnikiem świeżości po edycji produktu
jest brak (klient nie umie przeliczyć). Po refaktorze każda mutacja przechodzi przez metodę agregatu,
która zwraca świeżą klasyfikację w tej samej odpowiedzi — klient tylko renderuje.

### 4.4 Reguła I9 domknięta na DB (opcja towarzysząca)

`withNewEntry` egzekwuje "brak dat w przyszłości" w domenie, ale by domknąć I9 także dla ścieżek z
pominięciem API — dodać migrację `CHECK (end_date <= CURRENT_DATE)` (uwaga: `CURRENT_DATE` w CHECK jest
nie-immutable; alternatywa to trigger `BEFORE INSERT/UPDATE`). To poza rdzeniem #1, ale usuwa ostatnią
regułę egzekwowaną tylko przez zod (`sales-entry.ts:48`).

---

## KROK 5 — Before/after, plan faz, testy

### 5.1 Before / after (każde dzisiejsze miejsce reguły)

| Miejsce                                              | BEFORE                                                                  | AFTER                                                                                                  |
| ---------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `classification.ts:122` `classify(product, entries)` | Publiczny; luźne argumenty; brak walidacji prowieniencji                | Zostaje jako _wewnętrzna_ czysta reguła; jedyny publiczny wywołujący to `ProductAggregate.classify()`  |
| `products/[id].ts:37-42` PATCH                       | Zwraca sam produkt; **brak recompute** (Pęknięcie A)                    | `withPatchedProduct` → `classify()` w odpowiedzi (I3 spełnione)                                        |
| `sales-entries/index.ts:108` POST                    | `classify(product, [...existing, entry])` — rekonstrukcja (Pęknięcie B) | `agg.withNewEntry(...)` → świeży, kompletny zbiór; overlap/future → nazwany błąd → 409/422 (fail-fast) |
| `sales-entries/[entryId].ts:37-38` DELETE            | Przeładowuje ręcznie, przelicza                                         | `agg.withoutEntry(id).classify()`                                                                      |
| `dashboard.ts:19` `classifyUserCatalog`              | Grupuje płaską listę; kompletność per-produkt niewymuszona              | Buduje `ProductAggregate` per produkt (batch); grupowanie na `agg.classify()`                          |
| `sales-entries/index.ts:89` overlap pre-check        | Wolna funkcja `rangesOverlap` w route                                   | Przeniesiona do `withNewEntry` (jedno źródło reguły I1 w domenie)                                      |
| `db.ts:70/110` zapytania skopowane                   | Ręczne skopowanie po `product_id`                                       | Enkapsulowane w `loadAggregate`/repo                                                                   |
| `ProductDetail.tsx:45` stan klienta                  | Podmienia classification tylko przy mutacji wpisu                       | Bez zmian logiki; korzysta z tego, że PATCH produktu też zwraca classification                         |

### 5.2 Plan faz (test-first tam, gdzie logika jest testowalna jednostkowo)

- **Faza 0 — charakteryzacja (test-first).** Testy pinujące _obecne_ zachowanie `classify` +
  reprodukujące Pęknięcie A (PATCH nie zwraca classification). Czerwony dla A, zielony dla reszty.
- **Faza 1 — `ProductAggregate` + błąd domenowy (test-first).** Pełny zestaw testów (5.3) na czystym
  agregacie, zero I/O. To sedno wartości — idzie TDD (`vitest`).
- **Faza 2 — repo `loadAggregate` (test-first z mockiem supabase, wzorzec `db.test.ts`).**
- **Faza 3 — przepięcie tras API na agregat** (POST/DELETE wpisu, PATCH produktu). Zachować kontrakt
  `{ error }` JSON (lessons.md: opakować throw-on-error w try/catch). Mapowanie
  `ProductAggregateInvariantError` → 409/422.
- **Faza 4 — dashboard/detail SSR** przez agregat; testy `dashboard.test.ts` zaktualizowane.
- **Faza 5 (opcjonalna) — atomowość:** RPC transakcyjne dla mutacji wpisu; migracja I9 CHECK/trigger.

### 5.3 Przypadki testowe niezmiennika #1

**Legalne (mają przejść, zwrócić świeżą klasyfikację):**

1. `rehydrate(product, [])` → klasyfikuje "Insufficient data" (I4).
2. `rehydrate(product, kompletne_niezachodzące)` → poprawna velocity z pełnego mianownika.
3. `withNewEntry(przylegający_ale_nienachodzący)` (`Jan 1-5` + `Jan 6-10`) → OK, nowa klasyfikacja.
4. `withPatchedProduct({ lead_time_days: 5 })` przy `null→5` → klasyfikacja przelicza się (OK→Understocked
   jeśli runway < 5) — pin dla I3/Pęknięcie A.
5. `withPatchedProduct({ stock_quantity })` → daysOfStock i state przeliczone.
6. `withoutEntry` zbijające historię < 7 dni → powrót do "Insufficient data" (I4, US-03).

**Nielegalne (MUSZĄ rzucić nazwany błąd, nie zwrócić cichej liczby):** 7. `rehydrate(produktA, [wpis_z_product_id=B])` → `ProductAggregateInvariantError("FOREIGN_ENTRY")`. 8. `rehydrate(product, [nachodzące_wpisy])` → `"OVERLAPPING_ENTRIES"`. 9. `withNewEntry(nachodzący)` → `"OVERLAPPING_ENTRIES"` (a trasa → 409, NIE 201). 10. `withNewEntry(end_date > today)` → `"FUTURE_ENTRY"` (trasa → 422). 11. Trasa POST: po rzucie overlap odpowiedź to 409 i **żaden** wiersz nie został utrwalony (fail-fast).

### 5.4 Nowe nazwy "load-bearing" do rejestru (`context/foundation/lessons.md`)

- **`CLASSIFICATION_PROVENANCE_FRESHNESS`** — nazwana reguła domenowa (definicja w KROK 2).
- **`ProductAggregate`** — root; jedyne wejście do `classify()`.
- **`ProductAggregate.rehydrate` / `withNewEntry` / `withoutEntry` / `withPatchedProduct`** — metody z
  preconditions.
- **`ProductAggregateInvariantError`** z kodami `FOREIGN_ENTRY` / `OVERLAPPING_ENTRIES` / `FUTURE_ENTRY`.
- **`loadAggregate`** — repozytorium ładujące kompletny agregat (zastępuje rozsiane `getProductById` +
  `getSalesEntriesByProduct` w kontekście klasyfikacji).

---

## Ograniczenia dokumentu

- Cytowane wyłącznie ścieżki/linie realnie odczytane w tej sesji (`src/lib/*`, `src/pages/**`,
  `supabase/migrations/*`, `context/foundation/prd.md`, `context/foundation/lessons.md`,
  `vitest.config.ts`).
- Nie napisano kodu produkcyjnego — pseudokod w KROK 4 jest projektem, nie implementacją.
- Niezmiennik #1 wybrany własną analizą trzech osi; nie skopiowano wniosku z `01-domain-distillation.md`.
