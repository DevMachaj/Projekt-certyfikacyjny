# Artifact 2 — Structure (mapa strukturalna z dependency-cruiser)

> Analiza wykonana: 2026-07-05. Narzędzie: `dependency-cruiser` v18 + GraphViz 15.
> Metoda: statyczny graf zależności `src/`, metryki stabilności (fan-in/fan-out), walidacja reguł `forbidden`.
> Punkt wyjścia: `context/map/artifact-1-territory.md` (mapa aktywności z historii gita).

## Zakres i konfiguracja — uwaga kluczowa

Config `.dependency-cruiser.cjs` dostrojony pod ten stack (Astro 6 SSR + React 19 + TS):
resolwuje alias `@/*` → `./src/*`, liczy importy type-only (`tsPreCompilationDeps`),
ignoruje moduły wirtualne `astro:`/`virtual:` (nie są to realne naruszenia).

**Caveat metodologiczny — `.astro` nie są parsowane.** dependency-cruiser nie ma
natywnego parsera `.astro`, więc importy zapisane wewnątrz frontmattera stron `.astro`
**nie są ekstrahowane**. Skutek: fan-in (Ca) modułów konsumowanych wyłącznie przez strony
`.astro` jest **zaniżony**. W pełni przeanalizowany jest graf `.ts/.tsx` (lib, services,
api, komponenty React) — czyli tam, gdzie żyje ryzyko strukturalne. Realna waga hubów
(`types.ts`, `supabase.ts`) jest **większa** niż w tabelach poniżej.

Zakres cruise'a: **49 modułów, 104 zależności**.

---

## Wynik walidacji

| Reguła                   | Severity | Wynik                                                                |
| ------------------------ | -------- | -------------------------------------------------------------------- |
| `no-circular`            | warn     | ✅ **0 cykli**                                                       |
| `not-to-unresolvable`    | error    | ✅ 0 (moduły `astro:` na allowliście)                                |
| `not-to-dev-dep`         | error    | ✅ 0                                                                 |
| `no-non-package-json`    | error    | ✅ 0                                                                 |
| `no-test-imports-in-app` | error    | ✅ 0                                                                 |
| `no-orphans`             | info     | 1 × `src/test/astro-env-server.stub.ts` (stub testowy, nieblokujące) |

**Podsumowanie: 0 błędów, 0 ostrzeżeń.** Struktura jest czysta — brak zależności
cyklicznych, brak martwego kodu (poza jednym stubem), brak zepsutych importów/aliasów.
To spójne z młodym wiekiem repo i dyscypliną TDD w rdzeniu (patrz artifact-1, §b).

---

## a) Huby zmian — wysokie fan-in (Ca)

Moduły importowane przez wielu → zmiana w nich promieniuje na całe repo. **Ruszaj ostrożnie, otocz testami.**

| #   | Moduł                           | Ca (ilu zależy) | Znaczenie przy zmianie                                                      |
| --- | ------------------------------- | --------------: | --------------------------------------------------------------------------- |
| 1   | `src/types.ts`                  |              13 | zmiana kontraktu typów = ryzyko w 13 miejscach; fundament DTO/encji         |
| 2   | `src/components/ui/button.tsx`  |              11 | zmiana propsów/wariantów dotknie 11 komponentów (skóra UI)                  |
| 3   | `src/lib/supabase.ts`           |              10 | klient auth/DB — sercówka; importuje go middleware + **każdy** endpoint API |
| 4   | `src/lib/classification.ts`     |               9 | logika domenowa z szerokim zasięgiem                                        |
| 5   | `src/lib/validation/product.ts` |               5 | schematy zod dla produktów                                                  |
| 6   | `src/lib/utils.ts`              |               5 | helpery (m.in. `cn()`)                                                      |
| 7   | `src/lib/restocking.ts`         |               5 | logika restockingu                                                          |
| 8   | `src/lib/db.ts`                 |               5 | dostęp do bazy                                                              |

**Powiązanie z artifact-1:** huby fan-in pokrywają się z hot-spotami historii gita —
`db.ts`, `classification.ts`, `restocking.ts` były w TOP 10 najczęściej zmienianych plików.
Wysoka zmienność **i** wysokie sprzężenie = najwyższy priorytet dla testów regresyjnych.
`src/lib` jest tu potwierdzone dwiema niezależnymi metodami jako rdzeń, przez który wszystko przechodzi.

## b) Moduły trudne do testu w izolacji — wysokie fan-out (Ce)

Moduły ciągnące dużo importów → dużo mockowania w teście jednostkowym. Kandydaci na test **integracyjny / e2e**.

| #   | Moduł                                            | Ce (ile ciągnie) | Rekomendacja testowa                                 |
| --- | ------------------------------------------------ | ---------------: | ---------------------------------------------------- |
| 1   | `components/products/ProductCatalog.tsx`         |                8 | e2e/integracyjny — za dużo zależności na czysty unit |
| 2   | `components/sales/ProductDetail.tsx`             |                7 | e2e/integracyjny                                     |
| 3   | `pages/api/restocking-plan/index.ts`             |                5 | test kontraktowy endpointu (spina wiele serwisów)    |
| 4   | `pages/api/products/[id]/sales-entries/index.ts` |                5 | test kontraktowy endpointu                           |
| 5   | `components/products/ProductForm.tsx`            |                5 | integracyjny (formularz + walidacja)                 |
| 6   | `components/sales/SalesEntryForm.tsx`            |                4 | integracyjny                                         |
| 7   | `components/sales/ClassificationPanel.tsx`       |                4 | integracyjny                                         |

**Powiązanie z artifact-1:** `ProductCatalog.tsx` to hot-spot historii (5 zmian, TOP 4 plików)
**i** najwyższy fan-out — łączy częstą zmienność z trudną testowalnością → najlepszy kandydat
na pokrycie testem E2E (spójne z gałęzią `test/e2e-playwright-setup`). Endpointy API o wysokim
fan-out potwierdzają wniosek z artifact-1: `src/pages/api` to hub sprzężeń, dobry cel testów kontraktowych.

---

## Podgraf: `--focus src/lib/supabase.ts`

Render: `dependency-focus-supabase.svg`. Klient Supabase jest importowany przez:

```
src/middleware.ts                                  → src/lib/supabase.ts
src/pages/api/account.ts                           → src/lib/supabase.ts
src/pages/api/auth/{signin,signout,signup}.ts      → src/lib/supabase.ts
src/pages/api/products/index.ts                    → src/lib/supabase.ts
src/pages/api/products/[id].ts                     → src/lib/supabase.ts
src/pages/api/products/[id]/sales-entries/*.ts     → src/lib/supabase.ts
src/pages/api/restocking-plan/index.ts             → src/lib/supabase.ts
(sam supabase.ts) → astro:env/server               (moduł wirtualny)
```

**Obserwacja:** każdy endpoint tworzy klienta bezpośrednio przez `supabase.ts`. Gdyby kiedyś
zaszła potrzeba zmiany sposobu inicjalizacji klienta (np. pooling, dodatkowy kontekst),
zmiana dotknie punktowo wszystkich ~10 importerów. To przewidywalne i zdrowe (jeden punkt prawdy),
ale zarazem powód, by `supabase.ts` traktować jak API — stabilne, dobrze przetestowane.

---

## Granice warstw (adaptacja do tego stacku)

Prompt m4l2-2 opisuje warstwy innego repo (`platform/types`, `channels/src`). Odpowiednik tutaj:

```
types.ts / lib/validation   (fundament: typy + schematy)
        ↑
lib / lib/services          (logika domenowa)
        ↑
pages/api + middleware      (warstwa HTTP)   |   components/* (warstwa UI)
```

Graf potwierdza **czystą hierarchię, bez zaskoczeń:**

- brak importów „w górę" (fundament nie zależy od HTTP/UI),
- brak cykli między warstwami,
- `components/ui` jest liściem współdzielonym (button, dialog) — nie sięga do `lib/services`,
- `pages` i `components` spływają do `lib`/`types` (widać na `dependency-archi.svg`).

Jedyny „wyciek" na zewnątrz to moduły wirtualne Astro (`astro:env/server`, `astro:middleware`) —
oczekiwane, rozwiązywane w czasie builda.

---

## Wygenerowane artefakty wizualne

| Plik                            | Zawartość                                       |
| ------------------------------- | ----------------------------------------------- |
| `dependency-archi.svg`          | widok architektury (30 węzłów, wysokopoziomowy) |
| `dependency-graph.svg`          | pełny graf modułów (174 węzły/krawędzie)        |
| `dependency-focus-supabase.svg` | podgraf `--focus` klienta Supabase              |

Regeneracja: `npm run depcruise:archi` / `:graph`, mermaid bez GraphViz: `npm run depcruise:mermaid`.

---

## Synteza — 3 wnioski strukturalne

1. **Rdzeń = `src/lib` + `types.ts`.** Potwierdzony i przez historię (artifact-1), i przez graf
   (fan-in). Wszystko przez niego przechodzi; najwyższy priorytet dla testów, każda zmiana kontraktu ma szeroki blast radius.
2. **`supabase.ts` to ukryte API aplikacji.** 10 importerów, w tym middleware guardujący trasy.
   Traktować jak stabilny interfejs — zmiany inicjalizacji dotkną całej warstwy HTTP.
3. **Struktura jest zdrowa jak na ten etap.** 0 cykli, 0 martwego kodu (poza stubem), czysta
   hierarchia warstw. Główny dług nie jest strukturalny, lecz **testowalny**: komponenty o wysokim
   fan-out (`ProductCatalog`, `ProductDetail`) należy pokrywać E2E, nie unitami.

## Co sprawdzić dalej

- Powtórzyć analizę, gdy `.astro` zyskają parser (lub dodać ekstraktor) — odblokuje realny fan-in stron.
- Rozważyć regułę `forbidden` egzekwującą granicę „`components/ui` nie importuje z `lib/services`",
  by utwardzić obecnie zdrowy stan.
- Przy wzroście repo: monitorować `no-circular` w CI (`npm run depcruise`) — teraz 0, warto tak utrzymać.
