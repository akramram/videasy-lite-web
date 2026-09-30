# videasy-lite

Simple, clean, fast movie search + watch web app. No account, no tracking, no API keys.

## Stack

- Astro 5 (SSR, Node adapter) — static shell, islands only where needed
- React 19 island: search autocomplete + player mount
- TypeScript strict (+ noUncheckedIndexedAccess), zero `any`
- Zod validation on every upstream payload
- Tailwind v4 (single CSS import)

## Data sources (all keyless)

| Role | Provider | Endpoint |
|---|---|---|
| Popular + search metadata | Cinemeta (Stremio) | `https://v3-cinemeta.strem.io/catalog/movie/top.json`, `…/search={q}.json` |
| Posters | Metahub | `https://images.metahub.space/poster/medium/{imdb_id}/img` |
| Playback | Videasy embed | `https://videasy.xyz/embed/movie/{id}` |

Videasy.xyz is an embed-player API only (iframe by TMDB/IMDB id) — it has no
metadata endpoints. Metadata comes from Cinemeta; ids are IMDB `tt…`, which the
Videasy movie route accepts (verified).

## Data flow

Input → 250 ms debounce (min 2 chars) → `GET /api/search?q=…` (server proxy,
8 s upstream timeout, caches `max-age=300, swr=86400`) → Zod parse →
rank (year token beats exact-title when query has a year) → dropdown render.
Race-safe: only the latest request commits state; stale responses dropped.

## Search syntax

`title`, `title 1995`, `title 2020`. Year takes priority over exact-title match.

## Develop / build / run

```bash
npm install
npm run dev            # :4321
npm run build          # dist/server/entry.mjs (standalone node)
PORT=4321 node dist/server/entry.mjs
```

Note: this machine's :4321 is taken by FinDash — run videasy-lite on another
port for local checks (e.g. `PORT=4599`).
