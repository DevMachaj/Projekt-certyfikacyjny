---
date: 2026-07-20T11:24:18+02:00
researcher: Claude (10x-research)
git_commit: 1224de1e5076add38d19586140a982c44b984192
branch: test/e2e-playwright-setup
repository: Projekt certyfikacyjny
topic: "Refactor opportunities (element ④): ranking szans refaktoryzacji ugruntowany w kodzie i historii — na bazie analizy przepływu restockingu (M4L3)"
tags: [research, codebase, refactor-opportunities, restocking, classification, data-contract, guard, m4l4, verified]
status: complete
last_updated: 2026-07-20
last_updated_by: Claude (10x-research)
last_updated_note: "Weryfikacja twierdzeń strukturalnych rankingu ast-grep + grep (krok m4l4-3); commit weryfikacji 1224de1 — wszystkie potwierdzone, zero obalonych"
---

# Research: Refactor opportunities (element ④)

**Data**: 2026-07-20T11:24:18+02:00 · **Commit**: `1224de1` · **Branch**: `test/e2e-playwright-setup`
**Researcher**: Claude (10x-research)

## Research Question

Analiza `context/changes/restocking-flow-analysis/research.md` (M4L3: ② Feature overview + ③ Technical debt, zweryfikowana ast-grep/grep) celowo zostawiła otwarte pytanie: **KTÓRE z zapisanych problemów warto naprawić, w jakim docelowym kształcie i w jakiej kolejności.** Ta eksploracja wypisuje każdy problem, klasyfikuje go (kandydat strukturalny vs wejście do oceny wykonalności) i prześwietla kandydatów trzema soczewkami — obecny kształt, historia/intencjonalność, wykonalność migracji — kończąc rankingiem opcji z trade-offami.

> **Granice (z kontraktu m4l4-2).** To eksploracja, nie refaktor i nie decyzja. Żadnych zmian w kodzie. Ranking to **propozycja** dla osobnej sesji planowania po lekturze — nie prośba o zatwierdzenie. Dowody przed interpretacją; `[E]` evidence (file:line), `[I]` inference, `[U]` unknown. Priory raportu M4L3 traktowane jako zebrane dowody (budujemy na nich, nie wyprowadzamy od nowa). Metoda: 3 równoległe sub-agenty eksploracyjne (read-only).

---

## 1. Enumeracja i klasyfikacja (do audytu)

Wypisane są **wszystkie** problemy odnotowane w raporcie M4L3 (§1.5, §2.1, §2.2, §2.3) oraz mapie repo, niezależnie od etykiety. **KANDYDAT** = problem, którego naprawa zmieniłaby **strukturę kodu**. Reszta = wejście do oceny wykonalności/kosztu (najczęściej luka testowa, CI, wiedza, narzędzie).

| #      | Problem (źródło)                                                                                                                                             | Klasyfikacja                                              |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| **C1** | Szew kontraktu danych bez jednego źródła prawdy: migracja SQL → `types.ts` → `validation/*` (zod) → `db.ts` casty → konsumenci; ręczna synchronizacja (§2.2) | **KANDYDAT** (strukturalny)                               |
| **C2** | Niewalidowana granica odczytu z DB: `db.ts` rzutuje `as Product[]`/`as SalesEntry[]` bez walidacji runtime (§2.2 pkt 1)                                      | **KANDYDAT** (strukturalny)                               |
| **G1** | `urgency()` null-facts: gałąź `+Infinity`, refaktor guardu mógłby cicho zepsuć „most urgent first" bez czerwonego testu (§2.1, Open Q#2)                     | **KANDYDAT → przekwalifikowany na GUARD** (patrz werdykt) |
| —      | `summarizeRestockPlan` ZERO testów — cały łańcuch fallbacku + `source:"ai"` (§2.1)                                                                           | wejście (luka testowa)                                    |
| —      | `POST /api/restocking-plan` ZERO testów — 5 kontraktów statusu (§2.1)                                                                                        | wejście (luka testowa)                                    |
| —      | `deterministicReason` / `isConfigured` null-branche nietestowane (§2.1)                                                                                      | wejście (luka testowa)                                    |
| —      | Stryker pokrywa tylko `classification.ts` i **nie jest w CI** (§2.1)                                                                                         | wejście (CI/proces)                                       |
| —      | Pułapka diffu: `create_sales_entries.sql` wciąż pokazuje `CHECK (units_sold > 0)`, nadpisane późniejszą migracją (§2.2)                                      | wejście (właściwość migracji append-only)                 |
| —      | `.astro` martwy punkt dependency-cruiser — fan-in zaniżony (§2.3)                                                                                            | wejście (narzędzie)                                       |
| —      | `dashboard.astro` hot-spot / korzeń kompozycji; bus factor = 1; `types.ts` w 1 commicie (mapa §4)                                                            | wejście (wiedza/dokumentacja)                             |
| —      | Klaster kontraktu AI: `restocking.ts` → `restocking-summary.ts` → `RestockingPlan.tsx` co-change (§2.2 pkt 2)                                                | rozważony → **odrzucony** (sprzężenie istotne)            |
| —      | Duplikacja glue klasyfikacji między `dashboard.astro` a endpointem (hipoteza)                                                                                | rozważony → **odrzucony** (już wydzielony)                |
| —      | Niespójność rozmieszczenia `services/` vs `lib/`                                                                                                             | rozważony → **odrzucony** (kosmetyczny)                   |

**Materiału pod osobną analizę DDD (przeprojektowanie pojęć biznesowych) nie stwierdzono.** C1/C2 to strukturalny dług kodu, G1 to guard+test — żaden nie wymaga przedefiniowania pojęć domeny. To odróżnia tę analizę od granicy z M4L5.

---

## 2. Kandydaci — obecny kształt, intencjonalność, wykonalność

### C1 — Szew kontraktu danych bez jednego źródła prawdy

**Obecny kształt (soczewka 1).** Kształt szerszy niż zakładała enumeracja: **5 warstw lustrzanych**, nie 4 (dla `units_sold` de facto 6 — dwie migracje):

1. Migracja SQL `[E supabase/migrations/20260530000001_create_products.sql:1-10]`
2. Typ TS `[E types.ts:3-12]` (`interface Product`)
3. Zod (zapis) `[E validation/product.ts:16-26]` — komentarz „Rules mirror the DB CHECK constraints" `[E validation/product.ts:7-14]`
4. Cast odczytu `[E db.ts:14]` (`as Product[]`, plus `:22,41,58`)
5. Konsumenci pól `[E classification.ts:146,147,153; restocking.ts:72]`

**Brak jakiejkolwiek generacji typów Supabase** — zero `export type Database`, `createServerClient` bez parametru generycznego → klient nietypowany, stąd casty. `[E supabase.ts:10, grep=0]` Jedyna cząstkowa „single source of truth" to zod — ale tylko dla **wejścia** (DTO), same schematy deklarują, że są ręcznym lustrem CHECK-ów. `[E validation/product.ts:3-14]`

**Werdykt intencjonalności (soczewka 2): świadome ograniczenie — ale jedyny realny kandydat na przyszły refaktor.** `types.ts` powstał w **1 commicie** `bec03c4` (2026-05-30) i nigdy potem nie był ruszony (`git log --follow` = 1 wpis). Szew realnie „strzela" **zdyscyplinowanie**: commit `088aa63` (2026-06-06, „allow zero-sales units") zsynchronizował w jednym ruchu migrację + zod (`.positive()`→`.nonnegative()`) + silnik, „so client and server agree". Ręczne lustro to świadoma dyscyplina MVP przy małej schemie. **Ale** to właśnie C1 jest najbliżej „przypadkowej złożoności": jego świadome założenie (mała, stabilna schema) słabnie z czasem — ryzyko cichego dryfu skaluje się liniowo z liczbą pól.

**Wykonalność (soczewka 3).** Abstrakcja: istniejące zod-schematy **nie nadają się** — opisują DTO wejściowe, pomijają kolumny serwerowe (`id, user_id, created_at, updated_at`), więc `z.infer` z nich ≠ `Product`/`SalesEntry`. Trzeba **nowej row-schema** (superset). Blast radius: `types.ts` fan-in = **16** (najwyższy hub). Osłony dziś: typecheck (pre-commit) + build (CI) łapią niezgodność sygnatur, ale **nie** rozjazd typ↔runtime-kształt-wiersza (bo `as` tłumi typecheck). **Pierwszy krok-prerekwizyt (odwracalny, 0 call-site):** row-schema w nowym pliku + `Product`/`SalesEntry` jako `z.infer<>` z niej — jeśli inferowany typ jest strukturalnie identyczny, 16 konsumentów się nie zmienia. To zarazem prerekwizyt dla C2.

### C2 — Niewalidowana granica odczytu z DB

**Obecny kształt (soczewka 1).** Kontrast ostry i systematyczny:

- **Odczyty — surowy cast, zero walidacji:** `db.ts:14` (`as Product[]`), `db.ts:75`, `db.ts:86` (`as SalesEntry[]`); rzutowany jest wynik `select("*")`. `[E]`
- **Zapisy — walidowane zodem przed wejściem** przez `ProductInput`/`SalesEntryInput` (`z.infer`), walidacja żyje w warstwie API. `[E db.ts:3-4,17,29; api/products/*]`

Granica leży na styku `db.ts` ↔ Supabase: wejście bramkowane zodem, **wyjście z DB niewalidowane wcale** — `as` nie sprawdza nic w runtime. Ryzyko realne przy dryfcie schematu (kolumna zmieniona/usunięta, migracja niezaaplikowana zdalnie): typ TS twierdzi jedno, wiersz zawiera drugie, klasyfikacja liczy na uszkodzonych danych bez czerwonej flagi. `[I]`

**Werdykt intencjonalności (soczewka 2): świadome ograniczenie — jawnie zaakceptowane w review.** `git blame`: casty od `0190d29` (2026-05-30) i `f76a54c` (2026-06-06), nigdy potem nie kwestionowane. `context/changes/supabase-schema-and-types/reviews/impl-review.md` finding **F2**: „the cast asserts shape rather than verifying it … **Fine for MVP** … Fix: **None required — accepted by plan.**" Plan (`supabase-schema-and-types/plan.md:140`) zaprojektował cast jako wzorzec do skopiowania. To zaakceptowany kompromis, nie niedopatrzenie — ale **nie „decyzja nośna" o wysokiej wartości**: realizuje się jako ryzyko dopiero razem z C1, gdy schema się rozjeżdża.

**Wykonalność (soczewka 3).** Abstrakcja: ta sama row-schema co C1 (prerekwizyt). Blast radius: `db.ts` fan-in = **8**, ale walidacja **wewnątrz** funkcji (bez zmiany sygnatury `Promise<Product[]>`) = **0 call-site** — czysto wewnętrzna, odwracalna zmiana zachowania. Osłony dziś: **praktycznie żadne** — **brak `db.test.ts`** (potwierdzone), a `as` aktywnie tłumi typecheck (osłona iluzoryczna). Uwaga na `lessons.md`: walidacja na odczycie dołoży drugie źródło rzutów — musi degradować na tej samej granicy co obecny `throw` (route `catch`→500, dashboard `catch`→`groups=[]`). **Pierwszy krok-prerekwizyt:** `db.test.ts` charakteryzujący 3 read-funkcje (mock Supabase, happy + `error→throw`) — **niezależny** od C1, buduje siatkę pod jedno i drugie; dopiero drugim krokiem podmiana `as` na `rowSchema.array().parse(data)`.

### G1 — `urgency()` null-facts → **GUARD, nie przebudowa**

**Obecny kształt (soczewka 1).** `restocking.ts:45-48` — `urgency(c)`: `if (c.daysOfStock == null || c.leadTime == null) return +Infinity;` inaczej `daysOfStock − leadTime`. Sort rosnący `[E restocking.ts:78]` → null-facts na koniec („Missing facts sort last" `[E restocking.ts:43]`). Gałąź `+Infinity` jest **strukturalnie nieosiągalna przez normalny przepływ**: silnik nadaje Understocked/Watch tylko gdy `leadTime != null && daysOfStock` skończony `[E classification.ts:152,167,173]`. **Test tej gałęzi — BRAK** `[E restocking.test.ts]` (`makeItem` domyślnie `daysOfStock=10, leadTime=5`; żaden test nie podaje null).

**Werdykt intencjonalności (soczewka 2): świadome ograniczenie — jednoznaczne.** `urgency()` nie istniała pierwotnie; guard dodany w `9a51075` (2026-06-17) wraz z funkcją i polem `leadTime`. Plan tej zmiany (`context/archive/2026-06-17-restocking-plan-decision-support/plan.md`):

- `:16` — „candidates … so an urgency metric … is always well-defined for candidates."
- `:48` — „**Guard the null case defensively (sort nulls last) even though candidates always have both fields.**"
- `plan-brief.md:43` — rejestr ryzyka: „Urgency metric edge cases (nulls)".

Autor policzył, że gałąź jest nieosiągalna, i **mimo to świadomie postawił guard defensywnie** — dokładna analogia z lekcji (pozycyjne tablice Mattermosta: wygląda na złożoność przypadkową, jest świadomym ograniczeniem). Zamyka to Open Question #2 z M4L3: `+Infinity` **projektowo nieosiągalny dla kandydatów** (`[U]` co do przyszłych zmian `classify`).

**Wykonalność (soczewka 3).** Blast radius: **0** (funkcja prywatna modułu). Infra testowa już wspiera null (`makeItem`/`makeProduct`). **Najtańszy guard (0 zmian w kodzie chronionym):** jeden test charakteryzujący w istniejącym `describe("selectRestockCandidates")` — kandydat z null-facts trafia na koniec listy. Bramkuje przez vitest w CI od razu, w pełni odwracalny.

---

## 3. Mapa CI / siatki bezpieczeństwa (kontekst dla każdej ścieżki)

**Bramkuje merge (CI, `.github/workflows/ci.yml`, tylko push/PR do `main`):** `npm run lint` (ESLint type-checked), `npm test` (`vitest run`), `npm run build` (astro SSR). `[E ci.yml:4-25]`
**Bramkuje lokalnie (husky pre-commit):** `lint-staged` (`eslint --fix`) + `npm run typecheck` (`astro check`) — typecheck jest bramką **pre-commit, nie CI**. `[E .husky/pre-commit, package.json:10]`
**Istnieje, ale NIE wpięte:** Stryker (`mutate: classification.ts` tylko, „NOT wired into CI") `[E stryker.conf.json:3,7]`; Playwright/E2E (config jest, **brak w CI**, pokrywa tylko auth) `[E playwright.config.ts, e2e/*]`; brak progu coverage.

**Wniosek osłonowy:** jedyna bramkująca warstwa testowa to **vitest**. Każdy nowy `src/**/*.test.ts` staje się bramką **za darmo**, bez dotykania CI — to najtańsza dostępna dźwignia dla wszystkich trzech ścieżek (C1/C2/G1).

---

## 4. Refactor opportunities (ranked)

> Ranking oceniany dowodami (koszt długu vs koszt zmiany). To **propozycja** dla sesji planowania, nie decyzja. Kluczowy kontekst z mapy i historii: to zdrowe, młode MVP — „główny dług nie jest strukturalny, lecz testowalny i wiedzowy" (repo-map §TL;DR), a **wszystkie trzy kandydatury to świadome ograniczenia**, nie zaniedbania. Dlatego ranking jest zarazem ćwiczeniem w **right-sizingu**: guard tam, gdzie ograniczenie jest nośne; refaktor tylko tam, gdzie założenie ograniczenia realnie słabnie.

### 🥇 #1 — C1: jedno źródło prawdy dla kontraktu danych

- **Obecny → docelowy kształt:** 5-warstwowe ręczne lustro (SQL/types/zod/cast/konsumenci), zero generacji → **row-schema jako jedno źródło**, `Product`/`SalesEntry` inferowane (`z.infer`), a docelowo walidacja na odczycie (domyka C2).
- **Czemu #1 (koszt długu vs zmiany):** to jedyny kandydat, którego świadome założenie (mała, stabilna schema) **słabnie liniowo z czasem** — każde nowe pole mnoży ryzyko cichego dryfu przez 5 miejsc. Koszt pierwszego kroku jest przy tym **niski** (0 call-site), więc krzywa koszt/wartość jest korzystna.
- **Blast radius:** `types.ts` fan-in = **16** (najwyższy). Pierwszy krok ma jednak blast radius efektywny 0 (kształt niezmieniony).
- **Szkic inkrementalnej ścieżki:** (1) row-schema w nowym pliku; (2) `types.ts` = `z.infer` z niej, weryfikacja że kształt identyczny (typecheck 16 konsumentów zielony); (3) [→ C2] walidacja na odczycie w `db.ts`.
- **Pierwszy krok-prerekwizyt:** nowy plik row-schema + zamiana definicji w `types.ts` na `z.infer`, bez zmiany kształtu — odwracalne jednym revertem.

### 🥈 #2 — C2: walidacja granicy odczytu z DB

- **Obecny → docelowy kształt:** `return data as Product[]` (3 miejsca) → `rowSchema.array().parse(data)` **wewnątrz** funkcji `db.ts` (sygnatury bez zmian), degradacja na istniejącej granicy `throw`/`catch`.
- **Czemu #2:** domyka dziurę, którą zostawia C1 (`as` = brak sprawdzenia runtime), i eliminuje jedyny obszar o **ZERO osłon** wśród kandydatów. Niżej niż C1, bo (a) jego pełna wersja **zależy** od row-schema z C1, (b) ryzyko realizuje się dopiero przy dryfcie schematu.
- **Blast radius:** `db.ts` fan-in = **8**; walidacja wewnątrz funkcji = **0 call-site**.
- **Szkic inkrementalnej ścieżki:** (1) `db.test.ts` charakteryzujący 3 read-funkcje (mock Supabase) — **niezależny, można pierwszy**; (2) po row-schema (C1) podmiana `as` na `parse`.
- **Pierwszy krok-prerekwizyt:** `src/lib/db.test.ts` (charakteryzacja przed dotknięciem — zgodnie z regułą „dodaj test, zanim dotkniesz").

### ⭐ Rekomendacja niezależna od rankingu — G1: tani guard (nie refaktor)

Analogicznie do C2-Mattermosta z lekcji: **świadomemu ograniczeniu nie zmienia się kształtu — dokłada mu się tani, deterministyczny guard.** G1 to jeden test charakteryzujący (null-facts sortuje na koniec), **0 zmian w `restocking.ts`, blast radius 0, infra już gotowa**. Najtańszy, w pełni samodzielny — dobry „warm-up" i szybki zysk niezależnie od tego, którą opcję strukturalną wybierze planowanie.

---

## 5. Kandydaci rozważeni i odrzuceni

| Kandydat                                              | Dlaczego odrzucony                                                                                                                                                                                  | Dowód                                                          |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **Duplikacja glue klasyfikacji**                      | Już wydzielony do `classifyUserCatalog`, wołany przez oba wejścia; rozjazd dopiero na projekcji końcowej (naturalny podział)                                                                        | `[E dashboard.ts:19-31; dashboard.astro:24; index.ts:36]`      |
| **Klaster kontraktu AI** (restocking → summary → tsx) | Sprzężenie **istotne** (natura problemu): trzy moduły dzielą jeden byt domenowy (`RestockPlan`), typy płyną jednokierunkowo z `restocking.ts`; to nośnik gwarancji „AI nie zmienia decyzji silnika" | `[E restocking.ts:10-34; restocking-summary.ts:2,111-120,135]` |
| **Niespójność `services/` vs `lib/`**                 | Kosmetyczna: reguła „I/O → services/" i tak łamana (`db.ts` robi I/O w `lib/`), CLAUDE.md dopuszcza obie ścieżki; brak twardej granicy odpowiedzialności                                            | `[E CLAUDE.md; find src/lib]`                                  |
| **Pułapka `units_sold > 0` w migracji tworzącej**     | Właściwość migracji append-only (świadomy wzorzec Supabase), nie dług strukturalny; realny stan = ostatnia migracja                                                                                 | `[E create_sales_entries.sql:5 vs allow_zero_units]`           |

**Wejścia do wykonalności, NIE kandydatów strukturalnych (ale to one niosą największe RYZYKO w repo):** ZERO testów na `summarizeRestockPlan` i `POST /api/restocking-plan` (najgroźniejszy szew wg M4L3 §2.1), Stryker poza CI, brak progu coverage. To praca **siatki bezpieczeństwa** (test-plan/tdd/e2e), nie refaktor — ale przy decyzji planistycznej warto pamiętać, że dla tego repo najwyższą wartość/ryzyko ma domknięcie tych luk testowych, nie restrukturyzacja.

---

## Weryfikacja twierdzeń (ast-grep + grep)

> Krok `m4l4-3`. Zasada z lekcji: **licz ast-grepem dla precyzji, każde zero/lukę zderz z grepem.** Weryfikacja na commicie `1224de1` (ten sam co eksploracja). Sekcji „Refactor opportunities (ranked)" i werdyktów intencjonalności **nie zmieniano**. Wynik: **wszystkie twierdzenia potwierdzone, zero obalonych, żadna liczba nie wymagała korekty in-place.**

| #   | Twierdzenie strukturalne (na którym stoi ranking)                                    | Werdykt          | Dowód (plik:linia)                                                                                                                 | Metoda                                                     |
| --- | ------------------------------------------------------------------------------------ | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 1   | Fan-in `types.ts` = 16 (10 prod + 3 `.astro` + 3 test)                               | **potwierdzone** | 16 importerów `from "@/types"` (m.in. `ProductCard.astro:5`, `products/[id].astro:7`, `db.ts:2`)                                   | grep (ast-grep `-l ts` ślepy na `.astro`)                  |
| 2   | Fan-in `db.ts` = 8 (5 prod + 3 `.astro`)                                             | **potwierdzone** | 5 prod (`api/**`) + `dashboard.astro:6`, `products.astro:4`, `products/[id].astro:4`                                               | grep                                                       |
| 3   | Fan-in `classification.ts` = 11 (6 prod + 2 `.astro` + 3 test)                       | **potwierdzone** | m.in. `ProductCard.astro:2`, `products/[id].astro:5`, `dashboard.ts:1`                                                             | grep                                                       |
| 4   | Fan-in `restocking.ts` = 5 (3 prod + 2 test, brak `.astro`)                          | **potwierdzone** | `RestockingPlan.tsx:4`, `restocking-summary.ts:2`, `index.ts:5` + 2 test                                                           | grep                                                       |
| 5   | Fan-in `dashboard.ts` = 5 (2 prod + 1 `.astro` + 2 test)                             | **potwierdzone** | `index.ts:4`, `dashboard.astro:7` + `restocking.ts:2` (typ) + 2 test                                                               | grep                                                       |
| 6   | **C2:** dokładnie **3** casty `as Product[]`/`as SalesEntry[]` w `db.ts`             | **potwierdzone** | `db.ts:14` (`as Product[]`), `db.ts:75`, `db.ts:86` (`as SalesEntry[]`)                                                            | ast-grep `$A as Product[]` / `$A as SalesEntry[]` (= grep) |
| 7   | **Glue wydzielony** (odrzucenie): `classifyUserCatalog` def 1×, prod call-sites = 2  | **potwierdzone** | def `dashboard.ts:19`; call `index.ts:36` (ast-grep) + `dashboard.astro:24` (grep)                                                 | ast-grep [ts] złapał 2/3; grep dołożył `.astro`            |
| 8   | `urgency()` nieeksportowana, 1 call-site (sort)                                      | **potwierdzone** | `restocking.ts:45` (`function urgency`, brak `export`), wołana tylko `:78`                                                         | ast-grep `urgency($$$)` + grep (brak `export`)             |
| 9   | **G1:** branch `+Infinity` nietrafiony — żaden test nie podaje null-facts jako input | **potwierdzone** | `restocking.test.ts:28` default `daysOfStock=10, leadTime=5`; jedyne `null` = typ infra (`:10,14`) + asercja `units:null` (`:136`) | grep                                                       |
| 10  | `RestockPlan` definiowany **raz** (klaster kontraktu AI, jedno źródło)               | **potwierdzone** | jedyna definicja `restocking.ts:30`; konsumenci: `restocking-summary.ts:2`, `RestockingPlan.tsx:4`                                 | ast-grep + grep (1 definicja w src)                        |
| 11  | **C1 crux:** brak generacji typów Supabase                                           | **potwierdzone** | ZERO `export type Database`; `createServerClient` bez generyka `supabase.ts:10`                                                    | grep (zero → backstop OK)                                  |

**Meta-obserwacja (ast-grep vs grep) — sedno lekcji, spójne z M4L3:**

- **ast-grep precyzyjny:** casty złapał jako węzeł AST co do linii; `urgency($$$)` odróżnił wywołanie od definicji; `classifyUserCatalog` odróżnił od `classify`.
- **ast-grep ślepy na `.astro`/`.tsx` przy `-l ts`:** pominął call-site `dashboard.astro:24` (glue) oraz wszystkie importery `.astro` w fan-inach — dokładnie ta granica, dla której `grep` jest uczciwym backstopem. Gdyby czytać samo ast-grep, fan-iny i liczba call-site'ów byłyby zaniżone.

**Wniosek:** ranking wchodzi w planowanie **bez kredytu zaufania** — liczby są teraz potwierdzone, nie inferowane. Żaden werdykt nie został podważony, więc brak adnotacji „do decyzji na etapie planowania" z tej weryfikacji (poza już zapisanymi Open Questions #1/#2, które są runtime/przyszłościowe, nie strukturalne).

## Code References

- `src/types.ts:3-22` — ręczny hub kontraktu (1 commit `bec03c4`, fan-in 16)
- `src/lib/validation/{product,sales-entry}.ts` — zod tylko dla DTO wejściowego („mirror the DB CHECK")
- `src/lib/db.ts:14,75,86` — casty odczytu `as Product[]`/`as SalesEntry[]` (C2), brak `db.test.ts`
- `src/lib/restocking.ts:45-48,78` — `urgency()` guard `+Infinity` (G1), sort „most urgent first"
- `src/lib/dashboard.ts:19-31` — `classifyUserCatalog` (wspólny rdzeń, glue już wydzielony)
- `.github/workflows/ci.yml:4-25` — bramka: lint + vitest + build (tylko `main`)
- `stryker.conf.json:3,7` — mutacja tylko `classification.ts`, poza CI

## Historical Context (from prior changes)

- `context/changes/restocking-flow-analysis/research.md` — raport M4L3 (② + ③), bezpośredni prior tej eksploracji
- `context/archive/2026-06-17-restocking-plan-decision-support/plan.md:16,48` — dowód świadomego guardu G1 („even though candidates always have both fields")
- `context/changes/supabase-schema-and-types/{plan.md:140, reviews/impl-review.md F2}` — cast jako zaprojektowany wzorzec, „Fine for MVP, none required" (C2)
- commit `088aa63` — szew C1 odpalony zdyscyplinowanie (migracja+zod+silnik razem)
- `context/map/repo-map.md` — „główny dług nie jest strukturalny, lecz testowalny i wiedzowy; 0 cykli"

## Open Questions

1. **[U] runtime-osiągalność G1** (Watch/Understocked z `daysOfStock=null`) — pytanie o dane produkcyjne / przyszłe zmiany `classify`, nierozstrzygalne statycznie. Guard broni zachowania sortu niezależnie od osiągalności. **Do decyzji na etapie planowania.**
2. **[U] czy schema urośnie** na tyle, by C1 przekroczył próg opłacalności kodegenu — dziś świadome ograniczenie jest nośne przy małej schemie. **Do decyzji na etapie planowania.**

## Następny krok

✅ Raport przeczytany, ✅ twierdzenia strukturalne rankingu zweryfikowane ast-grep + grep (sekcja „Weryfikacja twierdzeń" — wszystkie potwierdzone). Pozostaje **Krok 3 lekcji: decyzja w wywiadzie planera** — `/10x-plan refactor-opportunities`. Pierwsze pytanie powinno dotyczyć **wyboru opcji** (to decyzja, nie potwierdzenie rankingu); warto przetestować ⭐ rekomendację (G1 guard) kontrpytaniem i trzymać wąski wycinek (jedna opcja + ewentualny tani, szybki zysk + jawne „czego NIE robimy").
