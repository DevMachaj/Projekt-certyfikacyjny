# Raport architektoniczny — Moduł 4 (ścieżka 10xArchitect)

> Two-pager zbudowany **wyłącznie** z artefaktów M4. Każde twierdzenie strukturalne (liczby, „tylko tutaj")
> pochodzi z artefaktu wskazanego w nawiasie, nie z pamięci o kodzie. Data: 2026-07-20.
>
> **Źródła (wszystkie z jednego repo — patrz §1):**
> L2 `context/map/repo-map.md` · L3 `context/changes/restocking-flow-analysis/research.md` ·
> L4 `context/changes/refactor-opportunities/{research,plan}.md` · L5 `context/domain/{01,02,03}-*.md`

---

## 1. Opisane projekty

**Wszystkie cztery artefakty (L2–L5) powstały na tym samym repozytorium.** Nie ma miksu projektów — więc
poniżej jedno repo, przypisane do każdej lekcji.

| Repo                                     | Stack                                                                                                                           | Skala (orientacyjnie)                                                                                                     | Artefakty                                                                                     |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **Projekt certyfikacyjny / StockHelper** | Astro 6 SSR + React 19 (wyspy) + Supabase (Postgres + Auth + RLS) + Tailwind 4, deploy Cloudflare Workers (L2 §1; L5-01 KROK 0) | Młode MVP: ~5 tygodni historii (2026-05-30 → 2026-07-01), **69 commitów**, **bus factor = 1** (Maciej Machaj) (L2 §7, §5) | **L2** (mapa) · **L3** (research ficzera) · **L4** (plan refaktoru) · **L5** (3× notatka DDD) |

---

## 2. Mapa projektu (z L2)

1. **Dwa światy sprzężenia.** Ciasno sprzężony _rdzeń danych_ (`migrations → validation → db → lib → api`)
   vs luźno sprzężona _skóra UI_ (komponenty per-pion). Najsilniejsza para co-change: `api`+`lib` (6×) (L2 §2–3).
2. **Dług NIE jest strukturalny.** 0 cykli, 0 martwego kodu (poza 1 stubem) — główny dług jest
   **testowalny i wiedzowy**, nie architektoniczny (L2 §1, §4).
3. **Entry pointy myfią drzewo katalogów.** `dashboard.astro` leży jak zwykła strona, a jest **korzeniem
   kompozycji** i najczęściej zmienianym plikiem (7 zmian), spinającym 3 piony; `pages/api` to hub sprzężeń,
   nie liść (L2 §3).
4. **6 stref ryzyka** — top: #1 rdzeń domenowy `lib/{classification,restocking}`, #2 oś kontraktu danych
   `migrations→validation→db→api`, #3 `types.ts` (blast radius Ca 13+, powstał w 1 commicie) (L2 §4).
5. **Kluczowy unknown — martwy punkt narzędzi.** dependency-cruiser nie parsuje `.astro`, więc fan-in
   `types.ts`/`supabase.ts` jest **zaniżony**; powiązania stron = `unknown`, nie zero. Drugi unknown:
   bus factor = 1 (cała wiedza w głowie autora + `plan.md`) (L2 §3, §7).

## 3. Analiza ficzera (z L3)

**Który przepływ i dlaczego.** „Tygodniowy plan restockingu + klasyfikacja" — od `POST /api/restocking-plan`
i renderu `dashboard.astro` w głąb `lib/{classification, restocking, dashboard, services/restocking-summary}`.
Wybrany, bo mapa wskazała ten obszar jako **strefę ryzyka 1+2** (core o najwyższym fan-in, najsilniejszy
co-change, częściowo w martwym punkcie `.astro`) (L3 nagłówek celu).

**Feature overview.** Input: `locals.user` (middleware) → **2 batch queries** `getProductsByUser` +
`getSalesEntriesByUser` (bez N+1, RLS skopowane po userze). Stan liczy **deterministyczny silnik**:
`classifyUserCatalog` → `classify` per produkt → `selectRestockCandidates` (filtr `Understocked`+`Watch`,
sort wg `urgency = daysOfStock − leadTime`). LLM (`claude-haiku-4-5`, timeout 10 s) nakłada **wyłącznie prozę**
(headline + „dlaczego") — nie zmienia produktu, ilości ani kolejności. Wraca `source: empty | ai | fallback`
(L3 §1.1–1.3).

**Technical debt (3 najważniejsze):**

1. **Nietestowany szew AI↔HTTP (WYSOKIE).** `summarizeRestockPlan` i `POST /api/restocking-plan` mają
   **ZERO testów** — a to dokładnie szew, na którym żyje gwarancja „AI nie zmienia decyzji silnika" i kontrakt
   5 statusów (401/503×2/500/200) (L3 §2.1). _Klocki_ (`parsePlanResponse`, `mergeAiReasons`) są testowane, ich
   kompozycja + wiring fetch/abort — nie.
2. **Kruchy szew kontraktu danych.** Zmiana pola wymaga ręcznej synchronizacji przez 4–5 warstw lustrzanych
   (migracja → `types.ts` → zod → cast `as` w `db.ts` → konsumenci); odczyty z DB są rzutowane bez walidacji
   runtime (L3 §2.2).
3. **Zaniżony blast radius `.astro` — potwierdzony ast-grep/grep (§3).** Realny fan-in wyższy niż w mapie:
   `types.ts` **16** (nie 13), `db.ts` **8** (nie 5), `classification.ts` **11** (nie 9). `classify()` =
   **5 call-site'ów prod**, casty odczytu = **3** (`db.ts:14,75,86`). _(≥1 potwierdzone ast-grepem — L3 §3.)_

## 4. Plan refaktoryzacji (z L4)

**Co refaktoryzowane (wybrana opcja).** Ranking L4 postawił na #1 **C1** (jedno źródło prawdy kontraktu
danych), ale plan świadomie **zawęził wycinek** do **C2 — walidacji granicy odczytu z DB** + tani guard **G1**,
z fragmentem C1 (row-schema). Docelowy kształt: `db.ts` waliduje wiersze przez `productRowSchema`/
`salesEntryRowSchema` (jedno jawne źródło, spięte z `types.ts` **testem typów**), uszkodzony wiersz **rzuca**
(fail-closed → API 500 / dashboard `groups=[]`) (L4 plan Overview, Desired End State).

**Czego świadomie NIE robimy.** Pełne C1 (nie migrujemy `types.ts`/16 konsumentów na `z.infer`); Supabase gen
types; **testy `summarizeRestockPlan` i endpointu** (największe _ryzyko_ w repo, ale praca siatki
bezpieczeństwa, nie ten refaktor); zmiękczanie do `safeParse` (świadomie fail-closed); zmiany ścieżki zapisu;
zmiana kształtu `urgency()` (tylko guard-test) (L4 plan „What We're NOT Doing").

**Fazy (status: implemented — wszystkie [x]):**

- **Faza 1** — guard-test `urgency()` null-facts „sort last", 0 zmian produkcyjnych → **auto** (`npm test`, lint).
- **Faza 2** — testy charakteryzujące `db.ts` (happy + `error→throw`) przed dotknięciem → **auto** (test, typecheck, lint).
- **Faza 3** — row-schema jako jedno źródło + test zgodności `z.infer ↔ types.ts` → **auto** (test + typecheck).
- **Faza 4** — podmiana castów na `rowSchema.array().parse(data)` + test „zły wiersz→throw" → **auto** (test/typecheck/build/lint) **+ ręcznie** (dashboard renderuje, „Generate plan" zwraca plan, zły wiersz→degradacja nie hard-500) (L4 plan Phases 1–4 + Progress).

## 5. Domena wg DDD (z L5)

**Ubiquitous language (kluczowe pojęcia).** _Product_, _Sales entry_, _Velocity_ (`Σunits ÷ dni kalendarzowe`),
_Classification state_ (`Understocked / Watch / OK / Slow-mover / Insufficient data`), _Restock candidate_,
_Urgency_ (L5-01 KROK 1).

**Najważniejsze rozjazdy model-vs-kod (L5-01 KROK 4):**

- **`urgency` / „most urgent first" — BRAK w PRD.** PRD dla dashboardu świadomie _odrzucił_ sortowanie po
  pilności na rzecz grupowania, a plan tygodniowy wprowadza je z powrotem, bez reguły domenowej (rozjazd #3).
- **Akcja `"Monitor"` dla stanu Watch — BRAK w PRD** (wynaleziona przez kod) (rozjazd #7).
- **PATCH produktu nie przelicza klasyfikacji** — narusza US-02 AC „classification recalculates on save"
  (rozjazd #1).

**Niezmiennik #1 i agregat (L5-02).** Własną analizą (3 osie: rdzeniowość / rozsmarowanie / egzekwowanie)
wybrano **niezmiennik #1 = `CLASSIFICATION_PROVENANCE_FRESHNESS`** (I2 ⊕ I3): każda klasyfikacja jest czystą
funkcją produktu ORAZ **kompletnego, niezachodzącego, aktualnego** zbioru jego wpisów, i jest przeliczana przy
każdej mutacji wejścia. Należy do agregatu **`ProductAggregate`** (root = `Product`, domyka swoje `SalesEntry`) —
dziś reguła jest najsłabiej egzekwowana (sygnatura `classify(product, entries)` przyjmuje dwie luźne tablice;
recompute wpięty ręcznie w 2 z 3 tras, brak przy PATCH) (L5-02 KROK 2–4).

**Anti-Corruption Layer (L5-03).** Przeciekająca zależność #1 = **Supabase** — przez **4 warstwy / 16 plików**:
`SupabaseClient` w **9 sygnaturach** `db.ts`, typ wire `PostgrestError` wypływa aż do warstwy API, fabryka
`createClient` + guard 503 skopiowana w **11 miejscach**, słownik `supabase.auth.*` rozsmarowany po middleware
i trasach. Cel: jeden katalog `infrastructure/supabase/` importujący `@supabase/*`, a reszta zna tylko wąskie
porty (`SalesDataStore`, `AuthGateway`, `AccountAdminGateway`) (L5-03 KROK 1–4).

**Spięcie L4 ↔ L5.** To nie dwa konkurencyjne rankingi, lecz dwie warstwy tego samego długu: L4 celuje w dług
**kodu/struktury** (jedno źródło prawdy dla wiersza, walidacja granicy odczytu — C1/C2), a L5 w dług
**pojęciowy/domenowy** (agregat `ProductAggregate` domykający niezmiennik prowieniencji, ACL na Supabase) — przy
czym oba schodzą się w tym samym miejscu: `db.ts` i granica `classify(product, entries)`, gdzie row-schema z L4
jest zarazem cegłą, na której L5 stawia agregat i port persystencji (L4 §4; L5-02 KROK 4; L5-03 §3.4).

## 6. Decyzje, które należą do mnie

AI (ranking L4) rekomendowało **C1 jako #1**; ja świadomie zrobiłem **right-sizing** — wziąłem wąski, odwracalny
wycinek **C2 + guard G1**, odkładając migrację `types.ts` (16 konsumentów) do czasu, aż schema realnie urośnie
(L4 §4, Open Q#2). Rozstrzygnąłem też **fail-closed vs `safeParse`** na rzecz twardego `throw` — bo cichy dryf
schematu ma być głośny, spójnie z regułą granicy I/O z `lessons.md`. W warstwie DDD **zawęziłem niezmiennik #1**
względem ogólnej propozycji z L5-01 („agregat A1–A6") do konkretu **prowieniencji + świeżości (I2⊕I3)**, bo to ta
oś jest jednocześnie najbardziej rdzeniowa i strukturalnie bezbronna. Świadomie **nie tknąłem największego
ryzyka** (zero testów `summarizeRestockPlan`/endpointu) w tym refaktorze — to praca siatki bezpieczeństwa
(test-plan/tdd/e2e), nie restrukturyzacja. Ranking i mapa były **priorem, nie wyrocznią** — decyzja o wyborze
opcji zapadła w wywiadzie planera, po weryfikacji twierdzeń ast-grep/grep (zero obalonych).
