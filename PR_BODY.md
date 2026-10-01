# KUR-25 — Videasy Lite: functional detail pages + routing (movie & TV)

Closes the "fully functional" loop: search -> detail page (movie + tv) ->
player -> back, all routes live in production at
https://videasy.kurulabs.dpdns.org.

## What's in the branch

- `src/components/TitlePage.astro` — detail page for movies and series:
  backdrop/poster header, title + year + imdbRating + runtime + genres,
  description, `WatchPanel` island (player loads on explicit play), season
  `<select id="season-select">` (multi-season only) + `#episode-list` episode
  buttons wired by `src/scripts/detail.ts` (`videasy:play` DOM event ->
  WatchPanel). Multi-season pages SSR only the `?s=N` season.
- `src/pages/title/[id].astro` + `src/pages/tv/[id].astro` — route split with
  `detailAny` resolution: `/title/{imdb}` renders movies and 302s series to
  `/tv/{imdb}`; `/tv/{imdb}` renders series (reads `?s=N`) and 302s movies
  back. Unknown/bad ids -> prerendered 404 page.
- `src/layouts/Layout.astro` — shared chrome (header/footer) for all pages,
  homepage included.
- `src/lib/cinemeta.ts` — detail API (`meta/{type}/{id}`), series episodes
  (`videos[]`), `moviedb_id` -> TMDB id for the player, combined
  movie+series search (`searchAny`) with type tags.
- `src/components/SearchBox.tsx` — results are now real links to detail pages
  (movies + series); inline player removed. `/api/search` returns both types.
- `src/components/Player.tsx` + `src/lib/videasy.ts` — 3-server fallback
  (Server 1 = official `player.videasy.net`, Server 2 VidLink, Server 3
  Vidsrc); TMDB id preferred, IMDB fallback (verified KUR-21).
- `src/components/MovieGrid.tsx` (React island) replaced by static
  `MovieGrid.astro` — Popular grid no longer ships JS.
- `src/env.d.ts` — types `locals.runtime.signal` from @astrojs/node.

## Verification (2026-10-01, production origin 127.0.0.1:4599 + public tunnel)

- `GET /` -> 200; `GET /api/search?q=heat+1995` -> JSON, rank #1 = Heat (1995)
- `GET /title/tt0113277` -> 200, `<title>Heat — Videasy Lite`
- `GET /tv/tt0903747` -> 200; `GET /tv/tt0903747?s=2` -> 200 with S2 episodes
- `GET /title/tt0903747` -> 302 `/tv/tt0903747`; `GET /tv/tt0113277` -> 302
  `/title/tt0113277`
- `GET /title/tt999999999999` -> 404 page
- public tunnel: `/`, `/title/tt0113277`, `/tv/tt0903747` -> 200
- served player bundle embeds `https://player.videasy.net` (official, no
  cookie gate)
- `astro check` (TS strict): 0 errors; `astro build`: clean

## Deploy

Per DEPLOY.md: tar -> scp homelab2 -> /opt/videasy-lite -> PM2 restart with
`PORT=4599 HOST=0.0.0.0` + `pm2 save`.

## Notes

- `main` untouched (repo rule: branch -> PR -> merge).
- GitHub push has been blocked by PAT scope (fine-grained token lacks
  Contents:write for this repo; 403 — see DEPLOY.md). This branch is merged
  locally into the canonical deployed branch `feat/initial-implementation`
  (merge commit `6677ba5`, plus follow-ups `a022295`, `fb5daca`).
