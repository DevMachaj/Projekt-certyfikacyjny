# Deploy Plan — StockHelper

## Platforma

- **Runtime:** Cloudflare Workers
- **Adapter:** `@astrojs/cloudflare` v13 (Workers only — nie Pages)
- **Worker name:** `stockhelper`
- **URL produkcji:** `https://stockhelper.<account>.workers.dev` *(uzupełnij po pierwszym deploy)*
- **CD:** Cloudflare Git Integration (auto-deploy na push do `master`)
- **CI:** GitHub Actions (lint + build check na PR, bez deploymentu)

---

## Sekrety produkcyjne

Ustawiane w Cloudflare Dashboard (Workers & Pages → stockhelper → Settings → Variables):

| Zmienna | Opis | Typ |
|---|---|---|
| `SUPABASE_URL` | URL projektu Supabase (cloud.supabase.com) | Secret (encrypted) |
| `SUPABASE_KEY` | anon public key projektu Supabase | Secret (encrypted) |

GitHub Actions wymaga tych samych sekretów w GitHub Secrets (Settings → Secrets → Actions) wyłącznie do walidacji builda w CI.

---

## Prerequisites — jednorazowa konfiguracja

### Node.js v22
```bash
node --version   # musi być v22.x.x
nvm use 22       # jeśli nie
```

### Wrangler CLI (Cloudflare)
```bash
npx wrangler --version
npx wrangler login      # OAuth → otwiera przeglądarkę
npx wrangler whoami     # weryfikacja
```

### Supabase CLI
```bash
brew install supabase/tap/supabase   # macOS
supabase --version
supabase login                        # OAuth → cloud.supabase.com
```

### Linkowanie Supabase CLI z projektem produkcyjnym
```bash
supabase link --project-ref <PROJECT_REF>
# PROJECT_REF z URL: supabase.com/dashboard/project/<PROJECT_REF>
supabase db remote status
```

---

## Workflow: Cloudflare Git Integration (CD)

Konfiguracja jednorazowa w Cloudflare Dashboard:

1. [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages → Create → Connect to Git**
2. Authorize GitHub → wybierz repozytorium
3. Konfiguracja buildu:
   - Branch: `master`
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Root directory: `/`
4. Environment variables (Production): `SUPABASE_URL` + `SUPABASE_KEY` jako Secret
5. Kliknij **Deploy** — pierwszy build uruchomiony przez Cloudflare

**Od teraz:** push do `master` → automatyczny deploy przez Cloudflare.

---

## Migracje bazy danych

### Nowa migracja (schemat)
```bash
supabase migration new <nazwa_migracji>
# Edytuj plik w supabase/migrations/
supabase db push   # wypchnij na produkcję
```

### Status migracji
```bash
supabase db remote status
```

---

## Komendy operacyjne

### Podgląd logów produkcji
```bash
npx wrangler tail
npx wrangler tail --format json   # JSON do parsowania
```

### Manualny emergency deploy
```bash
npm run build
npx wrangler deploy
```

### Rollback do poprzedniej wersji
```bash
npx wrangler rollback
# lub do konkretnej wersji:
npx wrangler rollback --deployment-id <ID>
```

### Lista deploymentów
```bash
npx wrangler deployments list
```

---

## Linki

- Cloudflare Dashboard: [dash.cloudflare.com](https://dash.cloudflare.com)
- Supabase Dashboard: [supabase.com/dashboard/project/<PROJECT_REF>](https://supabase.com/dashboard)
- Wrangler docs: [developers.cloudflare.com/workers/wrangler](https://developers.cloudflare.com/workers/wrangler)
