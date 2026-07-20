---
title: StockHelper — Anti-Corruption Layer dla przeciekającej zależności (plan refaktoru)
created: 2026-07-20
type: refactor-plan
---

# StockHelper — Anti-Corruption Layer

> **Produkt tego dokumentu to PLAN, nie kod.** Najgorszy przeciek wybrano WŁASNĄ analizą
> manifestu (`package.json`) i grafu importów w `src/` — nie przez skopiowanie wniosku z
> `01-domain-distillation.md` / `02-invariant-aggregate-refactor.md`. Każda teza o kodzie ma
> cytat `plik:linia` odczytany w tej sesji. Zasada: JEDNO miejsce ma znać kształt biblioteki;
> reszta zna tylko wąski port domenowy.

---

## KROK 0 — Kontekst (odkrycie)

**Dokumenty źródłowe (znalezione):** `context/foundation/tech-stack.md`, `README.md`,
`context/foundation/prd.md`, oraz artefakty grafu zależności (`dependency-archi.svg`,
`dependency-focus-supabase.svg`, konfiguracja `.dependency-cruiser.cjs`).

**Deklaracje o wymienialności — uczciwe ustalenie.** Dokumenty **NIE deklarują**, że Supabase ma
być odseparowana "żeby dało się ją wymienić". Przeciwnie — `tech-stack.md:24` wplata ją w rdzeń
("Supabase delivers PostgreSQL + auth out of the box … eliminates auth plumbing, database setup"),
a `README.md:127` mówi wprost: _"This project uses Supabase for authentication **and** the
database."_ Nie ma więc silnego sygnału _rozjazd-intencja-vs-kod_ z tej osi. Zamiast tego mocnym
sygnałem jest **istnienie osobnego artefaktu `dependency-focus-supabase.svg`** — ktoś już raz
wyodrębnił graf skupiony na Supabase, co potwierdza, że to najgęściej powiązana zależność w projekcie.
Wybór #1 opieram więc na osiach (a) liczba warstw/plików i (b) koszt/ryzyko wymiany — nie na
zadeklarowanej wymienialności.

**Stack i warstwy (ustalone z kodu):** Astro 6 SSR (`output: "server"`), React 19 wyspy, Supabase
(Postgres + Auth + RLS), Cloudflare Workers.

| Warstwa         | Lokalizacja                                        | Rola                                                |
| --------------- | -------------------------------------------------- | --------------------------------------------------- |
| Auth guard      | `src/middleware.ts`                                | Rozwiązanie użytkownika, ochrona `PROTECTED_ROUTES` |
| Persystencja    | `src/lib/db.ts` + `supabase/migrations/*`          | Dostęp do Postgres                                  |
| Adapter infra   | `src/lib/supabase.ts`                              | Fabryki klientów Supabase                           |
| API             | `src/pages/api/**`                                 | Kontrakty HTTP, autoryzacja                         |
| UI (SSR)        | `src/pages/**.astro`                               | Widoki server-rendered                              |
| Domena (czysta) | `src/lib/{classification,restocking,dashboard}.ts` | Silnik velocity (BEZ Supabase — czysty)             |

**Zależności zewnętrzne (z `package.json`):** `@supabase/ssr`, `@supabase/supabase-js`, `zod`,
`lucide-react`, `radix-ui`/`@radix-ui/react-slot`, `class-variance-authority`, `clsx`,
`tailwind-merge`. Plus zależność AI wywoływana po HTTP: Anthropic (`api.anthropic.com`,
`restocking-summary.ts:4`).

---

## KROK 1 — IDENTYFIKACJA przeciekających zależności

Przeanalizowałem trzy zależności o realnym potencjale przeciekania przez granice warstw. Dla każdej
wyliczam WSZYSTKIE pliki, które ją dziś "znają".

### Zależność P1 — **Supabase** (`@supabase/supabase-js` + `@supabase/ssr`)

Przecieka na **dwa różne sposoby jednocześnie**:

**(P1a) Typ biblioteki w sygnaturach persystencji + typ błędu wire.** `db.ts` przyjmuje
`SupabaseClient` w **9 sygnaturach** i importuje `PostgrestError` — czyli warstwa persystencji
eksponuje typ SDK w swoim publicznym kontrakcie, a `PostgrestError` (typ wire biblioteki) wypływa
nawet do warstwy API:

- `src/lib/db.ts:1` — `import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js"`.
- `SupabaseClient` w sygnaturach: `db.ts:7`, `:20`, `:33`, `:50`, `:60`, `:70`, `:81`, `:94`, `:110`.
- `PostgrestError` w castach: `db.ts:25`, `:44`, `:52`, `:62`, `:103`, `:121`.
- **Przeciek do API:** `src/pages/api/products/[id]/sales-entries/index.ts:2` —
  `import type { PostgrestError } from "@supabase/supabase-js"` (typ biblioteki w warstwie HTTP).
- `src/lib/db.test.ts:2`, `:17`, `:24` — test też musi znać `SupabaseClient` (mock `as unknown as SupabaseClient`).

**(P1b) Ta sama fabryka SDK rekonstruowana po obu stronach granicy + zduplikowany guard.** Wywołanie
`createClient(context.request.headers, context.cookies)` + null-guard `503` jest **skopiowane w 11
miejscach** — w każdej trasie API ORAZ w każdej stronie SSR. To dokładnie ten sam obiekt biblioteki
budowany w warstwie API i w warstwie UI:

- `src/lib/supabase.ts:1-2` — źródło (`createServerClient`, `parseCookieHeader`, `createSupabaseClient`).
- API: `products/index.ts:14`,`:33`; `products/[id].ts:14`,`:54`;
  `sales-entries/index.ts:29`,`:59`; `sales-entries/[entryId].ts:14`;
  `restocking-plan/index.ts:24`; `auth/signin.ts:9`; `auth/signout.ts:5`; `auth/signup.ts:9`;
  `account.ts:28`,`:29` (+ `createAdminClient`).
- SSR (UI): `dashboard.astro:14`; `products.astro:13`; `products/[id].astro:15`.

**(P1c) SDK Auth wołany bezpośrednio w wielu warstwach.** Słownik auth biblioteki
(`.auth.getClaims`, `.auth.getUser`, `.auth.signInWithPassword`, `.auth.signUp`, `.auth.signOut`,
`.auth.admin.deleteUser`) leży rozsmarowany po middleware i trasach:

- `src/middleware.ts:2` (import), `:15` (`getClaims`), `:23` (`getUser`).
- `src/pages/api/auth/signin.ts:13` (`signInWithPassword`).
- `src/pages/api/auth/signup.ts:13` (`signUp`).
- `src/pages/api/auth/signout.ts:7` (`signOut`).
- `src/pages/api/account.ts:40` (`getUser`), `:51` (`admin.deleteUser`), `:61` (`signOut`).

**Pełna lista plików, które dziś "znają" Supabase (16):**

| #   | Plik                                                     | Warstwa      | Co wie o Supabase                                            | Cytat               |
| --- | -------------------------------------------------------- | ------------ | ------------------------------------------------------------ | ------------------- |
| 1   | `src/lib/supabase.ts`                                    | Infra        | Fabryki `createClient`/`createAdminClient`                   | `:1`, `:6`, `:33`   |
| 2   | `src/lib/db.ts`                                          | Persystencja | `SupabaseClient` + `PostgrestError` w sygnaturach            | `:1`, `:7`… `:110`  |
| 3   | `src/lib/db.test.ts`                                     | Test         | Mock `SupabaseClient`                                        | `:2`, `:24`         |
| 4   | `src/middleware.ts`                                      | Auth guard   | `createClient`, `.auth.getClaims/getUser`                    | `:7`, `:15`, `:23`  |
| 5   | `src/pages/api/auth/signin.ts`                           | API          | `createClient`, `.auth.signInWithPassword`                   | `:9`, `:13`         |
| 6   | `src/pages/api/auth/signout.ts`                          | API          | `createClient`, `.auth.signOut`                              | `:5`, `:7`          |
| 7   | `src/pages/api/auth/signup.ts`                           | API          | `createClient`, `.auth.signUp`                               | `:9`, `:13`         |
| 8   | `src/pages/api/account.ts`                               | API          | `createClient`+`createAdminClient`, `.auth.admin.deleteUser` | `:28`, `:29`, `:51` |
| 9   | `src/pages/api/products/index.ts`                        | API          | `createClient`, wątek `supabase` do db                       | `:2`, `:14`, `:33`  |
| 10  | `src/pages/api/products/[id].ts`                         | API          | `createClient`                                               | `:14`, `:54`        |
| 11  | `src/pages/api/products/[id]/sales-entries/index.ts`     | API          | `createClient` + import `PostgrestError`                     | `:2`, `:29`, `:59`  |
| 12  | `src/pages/api/products/[id]/sales-entries/[entryId].ts` | API          | `createClient`                                               | `:14`               |
| 13  | `src/pages/api/restocking-plan/index.ts`                 | API          | `createClient`                                               | `:24`               |
| 14  | `src/pages/dashboard.astro`                              | UI/SSR       | `createClient`, wątek do db                                  | `:14`, `:20-21`     |
| 15  | `src/pages/products.astro`                               | UI/SSR       | `createClient`                                               | `:13`, `:17`        |
| 16  | `src/pages/products/[id].astro`                          | UI/SSR       | `createClient`                                               | `:15`, `:22`, `:24` |

→ **4 warstwy (auth-guard, persystencja, API, UI/SSR), 16 plików.**

### Zależność P2 — **Anthropic / LLM** (`api.anthropic.com`)

- `src/lib/services/restocking-summary.ts:1` (`ANTHROPIC_API_KEY`), `:4` (URL), `:6` (`MODEL`),
  wywołanie przez `fetch`.
- **Znana tylko w JEDNYM pliku.** Trasa `restocking-plan/index.ts` importuje z serwisu funkcje
  domenowe, nie SDK Anthropic. To jest **wzorzec docelowy** — biblioteka schowana za wąskim serwisem.

### Zależność P3 — **zod** (walidacja)

- `src/lib/validation/{product,sales-entry,rows}.ts`. Współdzielona API↔UI **celowo** (jeden schemat
  prawdy). To pożądane współdzielenie kontraktu, nie przeciek biblioteki przez granicę domeny.

---

## KROK 2 — KLASYFIKACJA i wybór #1

| Oś                            | P1 Supabase                                                      | P2 Anthropic          | P3 zod                                            |
| ----------------------------- | ---------------------------------------------------------------- | --------------------- | ------------------------------------------------- |
| (a) warstwy / pliki dotknięte | **4 warstwy / 16 plików**                                        | 1 plik                | 1 warstwa (walidacja)                             |
| (b) ryzyko/koszt wymiany dziś | **Bardzo wysokie** — dotyka persystencji, auth, API i UI naraz   | Niskie — jeden serwis | Niskie — biblioteka „szkieletowa”, nie wymieniana |
| (c) deklarowana wymienialność | Brak (patrz KROK 0) — ale gęstość powiązań to samodzielny sygnał | n/d                   | n/d, świadome współdzielenie                      |

**Wybór: NAJGORSZY PRZECIEK #1 = Supabase (P1).**

**Uzasadnienie.** Na osi (a) i (b) Supabase wygrywa bezapelacyjnie: jedyna zależność, której typ
(`SupabaseClient`), typ błędu (`PostgrestError`) i fabryka (`createClient`) przebijają się przez
**cztery** warstwy i **szesnaście** plików. P2 (Anthropic) jest wręcz _dowodem, jak to robić dobrze_ —
schowana za jednym serwisem — więc nie jest kandydatem; posłuży jako wzorzec docelowy. P3 (zod) to
świadomie współdzielony kontrakt walidacji, nie przeciek. Dodatkowo Supabase łączy **dwie rozłączne
odpowiedzialności** w jednym SDK — **Auth** (P1c) i **dostęp do Postgres** (P1a/b) —
`README.md:127` mówi to wprost ("authentication **and** the database"). To woła o **dwa wąskie porty**,
nie jeden. Brak zadeklarowanej wymienialności nie osłabia wyboru: to najgęstszy węzeł sprzężenia w
projekcie, a osobny `dependency-focus-supabase.svg` pokazuje, że już wcześniej wymagał osobnej analizy.

---

## KROK 3 — DIAGNOZA (duplikacja i przecieki przez granice)

### 3.1 Duplikacja — ta sama konstrukcja klienta w 11 miejscach

Identyczny blok (rekonstrukcja klienta biblioteki + guard `503`) skopiowany w warstwie API **i** UI:

```
// src/pages/api/products/index.ts:14
const supabase = createClient(context.request.headers, context.cookies);
if (!supabase) return Response.json({ error: "Supabase is not configured" }, { status: 503 });
```

```
// src/pages/dashboard.astro:14   (ta sama biblioteka, warstwa UI)
const supabase = createClient(Astro.request.headers, Astro.cookies);
```

```
// src/pages/api/products/[id]/sales-entries/index.ts:59   (i kolejne 9 kopii)
const supabase = createClient(context.request.headers, context.cookies);
```

Każda trasa/strona najpierw czyta domenowego `context.locals.user` (`products/index.ts:9`), po czym
**mimo to** rekonstruuje klienta Supabase, żeby przekazać go w dół do `db.ts`. Klient biblioteki
przecieka więc do 11 punktów wywołania tylko po to, by go „przenieść" do persystencji.

### 3.2 Przeciek typu biblioteki do sygnatur persystencji i do API

`db.ts` udaje repozytorium (chowa zapytania, waliduje wiersze do domenowych `Product`/`SalesEntry`
przez `rows.ts` — `db.ts:17`, `:90`), ale **eksponuje `SupabaseClient` w każdej sygnaturze**
(`db.ts:20`, `:33`, `:60`, `:70`, `:81`, `:110`…). Skutek: żeby zawołać persystencję, trzeba znać i
mieć klienta Supabase — więc wiedza o bibliotece jest wymuszana we wszystkich wywołujących.
Gorzej: **typ wire biblioteki wypływa aż do warstwy HTTP** —
`src/pages/api/products/[id]/sales-entries/index.ts:2` importuje `PostgrestError` z
`@supabase/supabase-js`.

### 3.3 Przeciek SDK serwerowego — ryzyko dla bundla klienta

`src/lib/supabase.ts` importuje **oba** pakiety serwerowe i tworzy klienta **service-role**
(`createAdminClient`, `:33-39`) używającego `SUPABASE_SERVICE_ROLE_KEY` — klienta **z pominięciem
RLS**. Ten sam moduł `@/lib/supabase` jest importowany zarówno przez kod czysto serwerowy
(`middleware.ts:2`, trasy API), jak i przez frontmatter stron `.astro`. Choć `astro:env/server`
i SSR trzymają sekret po stronie serwera, **jedno źródło importu dla klienta anon i klienta
service-role** to krucha granica: każdy przyszły import `@/lib/supabase` z modułu, który trafi do
wyspy React, ryzykuje wciągnięcie SDK (i ścieżki do klucza service-role) do bundla klienta. Komentarz
w kodzie sam to sygnalizuje jako zagrożenie: _"must NEVER be used outside trusted server code and the
key must never reach the browser bundle"_ (`supabase.ts:29-31`).

### 3.4 Co już DZIŚ działa jak mini-ACL (na tym budujemy)

- **Auth-user jest już zmapowany do VO domenowego.** Middleware konwertuje surowy payload Supabase na
  domenowy kształt: `context.locals.user = { id: data.claims.sub, email: data.claims.email ?? null }`
  (`middleware.ts:17`, `:24`), a typ `App.Locals.user` = `{ id: string; email: string | null }`
  (`env.d.ts:3`). To jest zalążek portu Auth — trasy czytają `locals.user`, nie `supabase.auth`.
- **Wiersze DB są już zmapowane do encji domenowych** przez `productRowSchema`/`salesEntryRowSchema`
  (`db.ts:17`, `:90`). Mapowanie persystencja→domena istnieje; brakuje tylko schowania samego
  _uchwytu_ klienta i typu błędu.

**Wniosek diagnozy:** przeciekają trzy kształty biblioteki — **uchwyt** (`SupabaseClient` + fabryka
`createClient`), **błąd wire** (`PostgrestError`) i **słownik Auth** (`supabase.auth.*`). Domena
(`classification.ts`, `restocking.ts`) jest już czysta. Wystarczy odciąć te trzy kształty jednym ACL.

---

## KROK 4 — PROJEKT ACL

Cel: **JEDEN katalog** (`src/lib/infrastructure/supabase/`) jest jedynym miejscem, które importuje
`@supabase/*`. Reszta kodu zna wyłącznie **wąskie porty domenowe** i **domenowe value objecty**.
Supabase = jedno z wielu połączeń dwóch odpowiedzialności (Auth + Postgres) → **dwa porty**.

### 4.1 Value objecty / encje — jedyne miejsca wiedzy o kształcie zależności

```
// src/lib/domain/authenticated-user.ts   (NOWY — czysty, zero @supabase)
/** Domenowa tożsamość operatora sklepu. JEDYNY dozwolony kształt „użytkownika" w domenie/UI. */
export interface AuthenticatedUser {
  readonly id: string;
  readonly email: string | null;
}
// Mapowanie z payloadu biblioteki NIE żyje tu — żyje w adapterze (4.3). VO zna tylko swój kształt.
```

```
// src/lib/domain/persistence-error.ts   (NOWY — czysty)
/** Domenowy błąd persystencji. Adapter mapuje PostgrestError → PersistenceError; reszta kodu
 *  łapie TYLKO ten typ i nigdy nie widzi PostgrestError. */
export type PersistenceErrorKind = "conflict" | "not_found" | "unavailable" | "unknown";
export class PersistenceError extends Error {
  constructor(public readonly kind: PersistenceErrorKind, message: string, public readonly cause?: unknown) {
    super(message); this.name = "PersistenceError";
  }
}
```

Reguły domenowe (velocity/klasyfikacja) już operują na `Product`/`SalesEntry` z `types.ts` — nie
wymagają zmian; ACL tylko gwarantuje, że te encje są JEDYNYM, co przekracza granicę (nigdy surowy
wiersz Postgrest ani `SupabaseClient`).

### 4.2 Dwa WĄSKIE porty (interfejsy domenowe)

```
// src/lib/domain/ports.ts   (NOWY — czysty, zero @supabase)

/** Port persystencji katalogu. Zero typów biblioteki w sygnaturach. */
export interface SalesDataStore {
  getProductsByUser(userId: string): Promise<Product[]>;
  getProductById(id: string): Promise<Product | null>;
  createProduct(userId: string, input: ProductInput): Promise<Product>;
  updateProduct(id: string, patch: ProductUpdateInput): Promise<Product | null>;
  deleteProduct(id: string): Promise<boolean>;
  getSalesEntriesByProduct(productId: string): Promise<SalesEntry[]>;
  getSalesEntriesByUser(userId: string): Promise<SalesEntry[]>;
  createSalesEntry(userId: string, productId: string, input: SalesEntryInput): Promise<SalesEntry>;
  deleteSalesEntry(id: string, productId: string): Promise<boolean>;
}

/** Port uwierzytelniania. Zwraca VO domenowy, nie typy Supabase. */
export interface AuthGateway {
  resolveUser(): Promise<AuthenticatedUser | null>;   // dawne getClaims/getUser (middleware)
  signIn(email: string, password: string): Promise<{ error: string | null }>;
  signUp(email: string, password: string): Promise<{ needsConfirmation: boolean; error: string | null }>;
  signOut(): Promise<void>;
}

/** Port administracyjny (service-role). Osobny, by NIGDY nie mieszał się z AuthGateway per-request. */
export interface AccountAdminGateway {
  deleteUser(userId: string): Promise<{ error: string | null }>;
}
```

Kluczowe: **żadna sygnatura portu nie zawiera `SupabaseClient`, `PostgrestError` ani `supabase.auth`**.
Trasy i strony wołają `store.getProductsByUser(user.id)`, nie `getProductsByUser(supabase, user.id)`.

### 4.3 Adaptery — jedyne pliki importujące `@supabase/*`

```
// src/lib/infrastructure/supabase/client.ts   (przeniesione z src/lib/supabase.ts)
//   → createServerClient/createAdminClient; jedyny import @supabase/ssr + @supabase/supabase-js.

// src/lib/infrastructure/supabase/sales-data-store.ts   (NOWY)
export class SupabaseSalesDataStore implements SalesDataStore {
  constructor(private readonly sb: SupabaseClient) {}           // uchwyt zamknięty w polu prywatnym
  async getProductsByUser(userId: string): Promise<Product[]> {
    const { data, error } = await this.sb.from("products").select("*").eq("user_id", userId).order("name");
    if (error) throw toPersistenceError(error);                // PostgrestError → PersistenceError
    return productRowSchema.array().parse(data);               // wiersz → encja domenowa (jak dziś db.ts:17)
  }
  // …pozostałe metody: ciała ~1:1 z dzisiejszego db.ts, bez `supabase` w sygnaturze publicznej.
}

// src/lib/infrastructure/supabase/auth-gateway.ts   (NOWY)
export class SupabaseAuthGateway implements AuthGateway {
  constructor(private readonly sb: SupabaseClient) {}
  async resolveUser(): Promise<AuthenticatedUser | null> {
    const { data, error } = await this.sb.auth.getClaims();     // logika z middleware.ts:15-27
    if (data?.claims) return { id: data.claims.sub, email: data.claims.email ?? null };
    if (error) { const { data: { user } } = await this.sb.auth.getUser();
      return user ? { id: user.id, email: user.email ?? null } : null; }
    return null;
  }
  async signIn(email, password) { const { error } = await this.sb.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null }; }
  // signUp / signOut analogicznie — mapują wynik SDK na kształt portu.
}
// toPersistenceError(): PostgrestError.code '23P01' (exclusion) → kind:"conflict", itd. — decyzja
// zakodowana TU (w ACL), nie w trasie API.
```

### 4.4 Wstrzyknięcie portów przez `locals` — usuwa 11 rekonstrukcji klienta

Middleware (jedyny punkt, który dziś już buduje klienta na każdy request) tworzy adaptery raz i
wystawia je jako porty na `context.locals`. Trasy/strony przestają wołać `createClient`:

```
// src/middleware.ts  (po refaktorze)
import { createClient } from "@/lib/infrastructure/supabase/client";
const sb = createClient(context.request.headers, context.cookies);
if (sb) {
  const auth = new SupabaseAuthGateway(sb);
  context.locals.auth  = auth;
  context.locals.store = new SupabaseSalesDataStore(sb);
  context.locals.user  = await auth.resolveUser();     // dawne getClaims/getUser, teraz w porcie
} else { context.locals.user = null; context.locals.store = null; context.locals.auth = null; }
```

```
// src/env.d.ts  (po refaktorze — Locals zna tylko PORTY, nie Supabase)
declare namespace App {
  interface Locals {
    user: import("@/lib/domain/authenticated-user").AuthenticatedUser | null;
    store: import("@/lib/domain/ports").SalesDataStore | null;
    auth: import("@/lib/domain/ports").AuthGateway | null;
  }
}
```

```
// src/pages/api/products/index.ts  (po refaktorze — zero @supabase)
const { user, store } = context.locals;
if (!user || !store) return Response.json({ error: "Unauthorized/unavailable" }, { status: 401 });
const products = await store.getProductsByUser(user.id);
```

---

## KROK 5 — Dowód izolacji + before/after

### 5.1 Dowód: wymiana biblioteki dotyka WYŁĄCZNIE adaptera

Gdyby jutro zamienić Supabase na inny Postgres+Auth (albo rozdzielić Auth od DB), zmiana ogranicza
się do `src/lib/infrastructure/supabase/*` — bo tylko te pliki implementują porty i importują SDK.
**Nietknięte pozostają:**

- **Tabele / migracje** — `supabase/migrations/*` (schemat i RLS to osobna decyzja infrastrukturalna).
- **API** — trasy wołają `store.*` / `locals.auth.*`; nie znają biblioteki (dziś znają: 8 tras).
- **UI/SSR** — `.astro` wołają `store.*`; nie znają biblioteki (dziś znają: 3 strony).
- **Domena** — `classification.ts`, `restocking.ts`, `dashboard.ts` — już czyste, bez zmian.
- **Kontrakt HTTP** — kształt JSON odpowiedzi bez zmian (porty zwracają te same encje domenowe).

### 5.2 Before / after (każde dzisiejsze miejsce przecieku)

| Miejsce                                                       | BEFORE                                            | AFTER                                                                                      |
| ------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `src/lib/supabase.ts`                                         | Fabryki w `lib/` importowane przez UI i API       | Przeniesione do `infrastructure/supabase/client.ts`; import tylko z adapterów              |
| `db.ts` (9 sygnatur z `SupabaseClient`)                       | Publiczne funkcje z typem biblioteki w sygnaturze | Ciała → `SupabaseSalesDataStore`; `db.ts` znika lub staje się cienkim re-exportem adaptera |
| `db.ts:1` / `sales-entries/index.ts:2` (`PostgrestError`)     | Typ wire biblioteki w persystencji i w API        | Zamknięty w `toPersistenceError`; reszta łapie `PersistenceError`                          |
| `middleware.ts:15,:23` (`supabase.auth.*`)                    | Słownik Auth SDK w warstwie guard                 | `SupabaseAuthGateway.resolveUser()`; middleware zna port                                   |
| `auth/{signin,signup,signout}.ts` (`.auth.*`)                 | `createClient` + wywołania SDK w trasie           | `context.locals.auth.signIn/signUp/signOut`                                                |
| `account.ts:29,:51` (`createAdminClient`, `admin.deleteUser`) | Klient service-role w trasie API                  | `AccountAdminGateway.deleteUser()` w adapterze                                             |
| 11× `createClient(...)` + guard `503` (API+SSR)               | Rekonstrukcja klienta biblioteki w każdym punkcie | `context.locals.store` / `locals.auth` wstrzyknięte przez middleware                       |
| `dashboard.astro:20`, `products.astro:17`, `[id].astro:22`    | `getProductsByUser(supabase, …)` — surowy uchwyt  | `store.getProductsByUser(…)` — UI dostaje gotowe encje domenowe                            |
| `db.test.ts` (`SupabaseClient` mock)                          | Test persystencji zna typ SDK                     | Test adaptera w `infrastructure/`; testy tras mockują PORT (`SalesDataStore`)              |

**UI dostaje dane domenowe, nie surowy obiekt biblioteki:** dziś strony trzymają uchwyt `supabase` i
przekazują go do db (`dashboard.astro:14→20`); po refaktorze wołają `store.getProductsByUser(...)`
i otrzymują `Product[]` — nigdy nie widzą `SupabaseClient` ani `PostgrestError`.

### 5.3 Otwarte pytania zależne od kontraktu Supabase — gdzie zakodować decyzję

- **Mapowanie kodu błędu overlap (I1) na status HTTP.** Naruszenie `EXCLUDE USING gist`
  (`...no_overlap.sql`) zwraca Postgrest z kodem `23P01`. Decyzję „`23P01` → `PersistenceError("conflict")`
  → 409" zakodować w **`toPersistenceError` w ACL**, nie w trasie (dziś trasa robi pre-check ręcznie:
  `sales-entries/index.ts:88`). Trasa mapuje już tylko `PersistenceError.kind → status`.
- **`getClaims()` vs `getUser()`.** Optymalizacja wydajności (lokalna weryfikacja JWKS,
  `middleware.ts:10-14`) to szczegół biblioteki — należy do `SupabaseAuthGateway.resolveUser()`, nie do
  middleware. Zmiana strategii weryfikacji nie może już dotykać warstwy guard.
- **Klient service-role.** Trzymany w osobnym porcie `AccountAdminGateway`, budowanym tylko na trasie
  `account.ts` (nie w globalnym `locals`), by klucz service-role nigdy nie wszedł w ścieżkę renderu UI.

---

## KROK 6 — Weryfikacja i plan faz

### 6.1 Kryterium sukcesu (mierzalne)

```
# Po refaktorze MUSI zwracać wyłącznie pliki spod katalogu adaptera:
grep -rn "@supabase/" src --include=*.ts --include=*.tsx --include=*.astro
#   → tylko: src/lib/infrastructure/supabase/*   (+ ewentualnie *.test.ts w tym katalogu)
```

Dodatkowo (opcjonalna reguła `.dependency-cruiser.cjs`): **forbidden** — `from: { pathNot:
["^src/lib/infrastructure/supabase"] }` → `to: { path: "node_modules/@supabase" }`, severity `error`.
To zamienia kryterium sukcesu w barierę egzekwowaną w CI (dziś config nie ma reguły o Supabase).

### 6.2 Kto zna zależność DZIŚ vs PO refaktorze

| Plik                                                                                             | Dziś zna `@supabase` | Po refaktorze                                                          |
| ------------------------------------------------------------------------------------------------ | -------------------- | ---------------------------------------------------------------------- |
| `src/lib/supabase.ts` → `infrastructure/supabase/client.ts`                                      | TAK                  | **TAK (adapter)**                                                      |
| `src/lib/infrastructure/supabase/{sales-data-store,auth-gateway}.ts`                             | — (nowe)             | **TAK (adapter)**                                                      |
| `db.ts`, `db.test.ts`                                                                            | TAK                  | **NIE** (logika → adapter; test → test adaptera)                       |
| `middleware.ts`                                                                                  | TAK                  | **NIE** (używa portów; import `client` tylko jak trzeba — patrz niżej) |
| `auth/{signin,signup,signout}.ts`, `account.ts`                                                  | TAK                  | **NIE**                                                                |
| `products/index.ts`, `[id].ts`, `sales-entries/{index,[entryId]}.ts`, `restocking-plan/index.ts` | TAK                  | **NIE**                                                                |
| `dashboard.astro`, `products.astro`, `products/[id].astro`                                       | TAK                  | **NIE**                                                                |

> Uwaga: `middleware.ts` nadal importuje fabrykę `client` (bo ktoś musi ją zbudować raz na request),
> ale nie woła już `supabase.auth.*` — cała wiedza o SDK Auth przechodzi do adaptera. Jeśli wymagamy
> **zero** importu z middleware, można dodać `infrastructure/supabase/factory.ts:createGateways(headers,
cookies)` zwracające parę portów — wtedy middleware zna tylko fabrykę portów, a `grep @supabase`
> jest czysty co do jednego katalogu.

### 6.3 Plan faz (konwencja projektu: test-first, `vitest`; kontrakt `{ error }` JSON zachowany)

- **Faza 1 — porty + VO (test-first, czyste).** `domain/ports.ts`, `authenticated-user.ts`,
  `persistence-error.ts`. Testy typów/kontraktu, zero I/O.
- **Faza 2 — `SupabaseSalesDataStore` (test-first, wzorzec `db.test.ts`).** Przeniesienie ciał z
  `db.ts` 1:1 + `toPersistenceError`. Testy mockują `SupabaseClient` (jak dziś), ale to jedyne miejsce,
  które go zna. Charakteryzacja: te same wyniki co obecne `db.test.ts`.
- **Faza 3 — `SupabaseAuthGateway` + `AccountAdminGateway`.** Przeniesienie logiki `getClaims/getUser`
  z `middleware.ts` i wywołań `.auth.*` z tras auth/account.
- **Faza 4 — wstrzyknięcie przez `locals`.** Rozszerzyć `env.d.ts` (`store`, `auth`), zaktualizować
  `middleware.ts`. Trasy/strony przepiąć na `context.locals.store` / `locals.auth` — usunąć 11 kopii
  `createClient` + guard. Kontrakty HTTP bez zmian.
- **Faza 5 — sprzątanie + bariera.** Usunąć `src/lib/db.ts` (lub re-export), przenieść
  `src/lib/supabase.ts` → `infrastructure/supabase/client.ts`, dodać regułę dependency-cruiser (6.1)
  i uruchomić `grep` jako bramkę.

### 6.4 Nowe nazwy „load-bearing" do rejestru (`context/foundation/lessons.md`)

- **`SalesDataStore` / `AuthGateway` / `AccountAdminGateway`** — porty domenowe; jedyny kontrakt, jaki
  zna kod poza adapterem.
- **`AuthenticatedUser`** — VO tożsamości (formalizacja dzisiejszego `locals.user`).
- **`PersistenceError` + `toPersistenceError`** — granica, za którą `PostgrestError` nie wychodzi.
- **`src/lib/infrastructure/supabase/`** — JEDYNY katalog importujący `@supabase/*`.

---

## Ograniczenia dokumentu

- Cytowane wyłącznie ścieżki/linie realnie odczytane w tej sesji (`src/lib/*`, `src/pages/**`,
  `src/middleware.ts`, `src/env.d.ts`, `.dependency-cruiser.cjs`, `package.json`,
  `context/foundation/tech-stack.md`, `README.md`).
- Nie napisano kodu produkcyjnego — bloki w KROK 4 to projekt (pseudokod), nie implementacja.
- Najgorszy przeciek (Supabase) wybrano własną analizą manifestu i grafu importów; uczciwie
  odnotowano, że dokumenty NIE deklarują wymienialności — wybór opiera się na liczbie warstw/plików
  i koszcie wymiany, nie na rozjeździe intencja-vs-kod.
