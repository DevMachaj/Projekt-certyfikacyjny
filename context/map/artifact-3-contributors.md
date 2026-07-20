# Artifact 3 — Contributors (mapa kontrybutorów z historii gita)

> Analiza wykonana: 2026-07-20. Źródło: `git log` / `git shortlog` całego repo.
> Metoda: identyfikacja obszarów z artifact-1 + artifact-2 → autorstwo per obszar (12 mies.) →
> filtr botów/agentów → klasyfikacja tematyczna aktywności.
> Punkt wyjścia: `context/map/artifact-1-territory.md`, `context/map/artifact-2-structure.md`.

## Ustalenie kluczowe — jeden kontrybutor

`git shortlog -sne --all` pokazuje 4 tożsamości, ale wszystkie należą do **jednej osoby**:

| Tożsamość                                          | Commity | Interpretacja                                                    |
| -------------------------------------------------- | ------: | ---------------------------------------------------------------- |
| `Maciej Machaj <maciejmachaj@192.168.1.20>`        |      39 | maszyna #1 (LAN)                                                 |
| `Maciej Machaj <maciejmachaj@192.168.1.27>`        |      25 | maszyna #2 (LAN)                                                 |
| `DevMachaj <151618975+…@users.noreply.github.com>` |       3 | konto GitHub — **wyłącznie merge'e własnych PR-ów** (#5, #6, #7) |
| `Maciej Machaj <maciejmachaj@MacBook-Pro-…>`       |       2 | MacBook lokalnie                                                 |

**Bus factor = 1 w każdym obszarze repo.** „Kontakt z kontrybutorami" oznacza tu w praktyce:
wydobyć/udokumentować wiedzę autora, zanim wyparuje.

## Filtr botów i agentów AI

- **Boty/automatyzacje:** brak (zero commitów `dependabot`, `github-actions`, `renovate` itp.).
- **Agenci AI:** **64 z 69 commitów** ma trailer `Co-Authored-By: Claude`
  (Opus 4.8 ×56, Opus 4.7 ×4, Sonnet 4.6 ×4). Żaden commit nie jest jednak autorstwa agenta
  _bez człowieka_ — każdy ma ludzkiego autora i komitera. Po filtrze „bez wyraźnego autorstwa
  człowieka" **nic nie odpada**; repo jest w całości human-authored z asystą AI.

---

## Top 5 obszarów wymagających potencjalnego kontaktu z kontrybutorami

Zidentyfikowane na przecięciu artifact-1 (hot-spoty, co-change) i artifact-2 (fan-in/fan-out):

1. **Rdzeń domenowy `src/lib`** — `classification.ts` + `restocking.ts` (+ `lib/services`).
   Hot-spoty historii (TOP 10 plików) **i** wysoki fan-in (Ca 9 i 5). Reguły biznesowe
   (progi klasyfikacji, kryteria restockingu) to wiedza nie do wyczytania z kodu.
2. **Oś kontraktu danych** — `supabase/migrations` → `lib/validation` → `lib/db.ts` → `src/pages/api`.
   Najsilniejszy klaster co-change (para `api`+`lib` 6×). Intencje migracji (RLS) i kształt
   schematów zod to wiedza projektowa.
3. **`src/types.ts`** — najwyższy fan-in (Ca 13, realnie zaniżony — `.astro` nieparsowane).
   Najszerszy blast radius zmiany; niejasne, które typy są stabilnym kontraktem, a które implementacją.
4. **Warstwa auth** — `src/lib/supabase.ts` + `src/middleware.ts` + `pages/api/auth/*`.
   „Ukryte API aplikacji" (10 importerów), wrażliwe bezpieczeństwem (sesje cookie, `PROTECTED_ROUTES`).
5. **Korzeń kompozycji UI** — `src/pages/dashboard.astro` (7 zmian, najczęściej zmieniany plik)
   - komponenty o wysokim fan-out (`ProductCatalog.tsx` Ce 8, `ProductDetail.tsx` Ce 7,
     `RestockingPlan.tsx`). Martwy punkt obu analiz (`.astro` nieparsowane), pamięć autora
     jedynym źródłem prawdy.

Wspólny wzorzec: obszary 1–4 to jeden pionowy „data plane" o największej koncentracji wiedzy;
obszar 5 to miejsce najsłabszego wglądu narzędzi analitycznych.

## Kluczowi kontrybutorzy per obszar (ostatnie 12 miesięcy = cała historia)

| Obszar                                                           | Kontrybutorzy | Commity |
| ---------------------------------------------------------------- | ------------- | ------: |
| 1. Rdzeń domenowy `src/lib`                                      | Maciej Machaj |      18 |
| 2. Oś danych (migrations → validation → db.ts → api)             | Maciej Machaj |      14 |
| 3. `src/types.ts`                                                | Maciej Machaj |       1 |
| 4. Auth (`supabase.ts`, `middleware.ts`, `api/auth`)             | Maciej Machaj |       7 |
| 5. UI (`dashboard.astro`, components/{products,sales,dashboard}) | Maciej Machaj |      17 |

---

## Klasyfikacja tematyczna aktywności — Maciej Machaj

Grupy tematyczne z komunikatów commitów, wskazujące realne kompetencje supportowe:

### Silniki domenowe i ich poprawność (najgłębsza wiedza)

Silnik klasyfikacji z harnessem Vitest; silnik restockingu z deterministycznym uzasadnieniem
i porządkiem pilności; dedykowana kampania `testing-velocity-engine-correctness` — poprawki
OG-1/OG-2, pokrycie brzegowe, bramka mutacyjna Stryker. Jedyny obszar z osobnym cyklem
utwardzania — autor zna nie tylko kod, ale i jego znane słabości.

### Kontrakt danych end-to-end

Schemat Supabase + typy domenowe (`supabase-schema-and-types`); warstwa dostępu i walidacji zod;
constraint nakładania się okresów sprzedaży; typowane helpery w `db.ts`; endpointy API produktów
i sales-entries. Zmiany prowadzone przez całą oś migracja→walidacja→logika→endpoint
(potwierdza sprzężenia z artifact-1).

### Bezpieczeństwo i sesje

Lokalna weryfikacja JWT przez `getClaims` w middleware (fix perf); fabryka klienta admin
z service-role; route guard dla usuwania konta; udokumentowana postawa CSRF/SameSite (impl-review).
Wiedza o kompromisach, nie tylko o kodzie.

### Integracja AI

Moduł serwisu Anthropic + wiring sekretów; rozszerzenie kontraktu AI o `prioritize + explain`;
rename `weekly_summary → headline` po impl-review.

### UI i UX

React islands katalogu; bulk-delete z raportowaniem częściowych błędów i guardem współbieżności;
selection UI; loading skeleton; dialog usuwania konta; a11y.

### Proces i testy E2E (najświeższe)

Scaffold Playwright przez skill 10x-e2e; spec przekierowania tras chronionych; bramka typecheck
w pre-commit; CI z bramką unit.

---

## Wniosek — „linia wsparcia" przy bus factor 1

Mapa kontrybutorów nie odpowiada tu na pytanie „kogo zapytać", lecz „**co udokumentować,
zanim wiedza wyparuje**". Największa asymetria: obszar 3 (`types.ts`) ma najwyższy fan-in (13+)
przy **jednym commicie** — kontrakt typów powstał raz, na początku, a wiedza o jego intencjach
istnieje tylko w głowie autora i w `plan.md` zmiany `supabase-schema-and-types`.

Realną „drugą linią wsparcia" są artefakty procesu 10x — `context/archive/*/plan.md`
i zapisy impl-review dokumentujące decyzje. To one zastępują rozmowę z kontrybutorem
i powinny pozostać aktualne w obszarach 1–4 (data plane), gdzie koncentracja wiedzy jest największa.
