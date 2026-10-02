# Videasy Lite — Runbook & Source of Truth

Issue KUR-16. App frontend pencarian film + player embed videasy.xyz. Ringan, keyless (tanpa API key), SSR.

## Live
- URL publik: https://videasy.kurulabs.dpdns.org (via tunnel `findash` → Mac → SSH forward → homelab2)
- Origin: homelab2 0.0.0.0:4599 (PM2 app `videasy-lite`, id 1, cwd /opt/videasy-lite, saved ke dump.pm2)
- Chain: CF → cloudflared (Mac, PM2 `findash-tunnel`, ingress `videasy.kurulabs.dpdns.org → http://localhost:4599`) → PM2 `ssh-homelab2-videasy` (autossh `-L 4599:192.168.0.4:4599 homelab2`) → app
- Logs: `ssh homelab2 pm2 logs videasy-lite`

## Kenapa via SSH forward (bukan langsung IP LAN)
cloudflared di Mac di-block macOS local-network filter untuk binary unsigned: dial TCP ke IP LAN mana pun
(EHOSTUNREACH) padahal curl/ssh/python lolos. Pola terbukti yang existing: homepage via autossh `-L 9080`.
Jangan ganti ingress ke `http://192.168.0.4:4599` — akan 502 `no route to host`.
Juga: bind 127.0.0.1 di homelab2 cukup (forward SSH ke 192.168.0.4 loopback-nya), tapi sekarang 0.0.0.0 dan dua-duanya OK.

## Stack
- Astro 5 SSR (node standalone adapter) + React 19 island (SearchBox/Player), TS strict + Zod, Tailwind v4
- Data: Cinemeta (popular + search, keyless); proxy `/api/search` di server (SSR fetch, cache 5 menit in-memory)
- Year-aware ranking: query "heat 1995" -> Heat (1995) #1
- Race-safe hook: latest-only commit + AbortController

## Layout
- Source of truth: ~/hermes-workspace/videasy-lite (Mac .6), branch `feat/initial-implementation`
- Server artifact: /opt/videasy-lite (dist + node_modules, rsync-style tar deploy)

## Deploy (update)
1. `cd ~/hermes-workspace/videasy-lite && npm run build`
2. `COPYFILE_DISABLE=1 tar czf /tmp/v.tgz --exclude 'node_modules/.cache' dist package.json node_modules`
3. `scp /tmp/v.tgz homelab2:/tmp/`
4. `ssh homelab2 'pm2 stop videasy-lite; cd /opt/videasy-lite && rm -rf dist node_modules package.json && tar xzf /tmp/v.tgz && rm /tmp/v.tgz; PORT=4599 HOST=0.0.0.0 pm2 restart videasy-lite --update-env && pm2 save'`
   - **Wajib `HOST=0.0.0.0`**: autossh forward di Mac menarget `192.168.0.4:4599`, jadi
     `HOST=127.0.0.1` bikin tunnel 502 (kejadian 2026-09-30, KUR-21). Selalu `pm2 save` setelahnya.
5. Verify: `curl -s http://127.0.0.1:4599/` -> 200; `curl -s 'http://127.0.0.1:4599/api/search?q=heat+1995'`; dari Mac `curl -s http://127.0.0.1:4599/` -> 200 (forward hidup).

## Cookie gate (KUR-21, 2026-09-30)
Root cause: videasy.xyz/embed routes some titles through a free-host ad/cookie
interstitial (sv101.ifastnet.com/cookies.html) that needs third-party cookies;
blocked cookies = permanent "Cookies are not enabled." screen. Fix (commit
0ec3a7b, branch fix/kur-21-cookie-gate-official-player): embed switched to the
official player.videasy.net (no gate; TMDB + IMDB ids verified on movie + tv
routes). CSP upgrade-insecure-requests kept as belt-and-suspenders.

## CSP (KUR-21)
`<meta http-equiv="Content-Security-Policy" content="upgrade-insecure-requests">` di `src/pages/index.astro`.
Embed videasy.xyz kadang frame `http://sv101.ifastnet.com/cookies.html` (interstitial
cookie free-host mereka); tanpa CSP ini Chromium block sebagai mixed content. Direktif
ini diwarisi child frame, jadi sub-request http di dalam embed di-upgrade ke https
(sv101.ifastnet.com ternyata support HTTPS — verified 200). Verifikasi: buat player,
klik link "HERE" di interstitial cookie → frame harus tetap `https://`.

## GitHub (unblocked 2026-10-01, KUR-34)
- Push kini jalan via PAT klasik env `GITHUB_TOKEN_BACKUP` (scope repo) dengan
  helper per-command `git -c credential.helper= -c credential.helper='!f() { ... }; f'`
  — token tidak pernah masuk disk/.git-credentials. Keyring/store PAT
  fine-grained tetap TANPA Contents:write (403 lama KUR-31) — jangan dipakai push.
- Remote `origin` = `akramram/videasy-lite-web.git` (dulu repo eksperimen kosong,
  sekarang dipakai hosting kanon). Isi: `feat/initial-implementation` (kanon),
  `feat/kur-32-touch-ergonomics` + PR#1 (merged 50eb7d5). Remote TIDAK punya
  `main`; default branch remote saat ini `feat/kur-32-touch-ergonomics` (artefak
  push pertama ke repo kosong — tidak berbahaya, kanon tetap
  feat/initial-implementation).
- `videasy-lite-app2`, `videasy-probe-fg` tetap sisa eksperimen (boleh dihapus).
- Note: repo `videasy-lite-app` (private?) ada di akun tapi tidak visible dari PAT manapun — cek via web UI.
- Pre-existing (bukan regresi KUR-34): Cinemeta kini resolve `tt9999999` ->
  200 "Revolutionary Russian Roulette" (runbook lama expect 404).

## KUR-34 touch ergonomics live (2026-10-01)
- `feat/kur-32-touch-ergonomics` (9d80ed7) merged -> kanon `feat/initial-implementation`
  (merge 50eb7d5, PR videasy-lite-web#1) + deployed. Player server-switcher
  stack di mobile + tombol 44px, season select 44px, synopsis zinc-400,
  scroll-mt-20 di kedua watch-panel div, back link hit area, copy "Play movie".
- Verify 375px (Playwright): tombol server [44,44,44]px, select 107x44, gap
  header 80px pasca scrollIntoView, overflow 0 (movie+series). Build bersih.

## KUR-25 detail routing live (2026-10-01, KUR-30 + KUR-31)
- `feat/kur-25-detail-routing` (0f7b392: TitlePage + /title//-/tv/ split)
  merged -> kanon `feat/initial-implementation` (merge 6677ba5; +a022295
  env.d.ts App.Locals + astro check devDeps; +fb5daca player base balik ke
  player.videasy.net). `main` tidak disentuh.
- Player domain note: player.videasy.net sekarang 301 -> player.videasy.to
  (app sama, no gate). Base tetap .net (domain kanonik + evidence KUR-21).
- Verify produksi pasca-deploy: / 200, search heat+1995 rank#1 Heat(1995),
  /title/tt0113277 200, /tv/tt0903747 200 (+?s=2 S2 episodes), cross-302s,
  unknown id 404, publik tunnel semua 200.

## KUR-49 streaming UX live (2026-10-02)
- `feat/kur-49-streaming-ux` (PR-0 tokens 837118c, US-2 play path 5be8475+4443c73,
  US-8 search a11y 99c4fcd, US-1 continue watching 00f3afe+2a0ae68+audit 635dbd6)
  merged -> kanon `feat/initial-implementation` (PR videasy-lite-web#2, merge
  0ae88a7) + deployed (tar chain, HOST=0.0.0.0, pm2 save).
- Live: US-1 continue-watching row (videasy:cw.v1, PLAYER_EVENT relay primary +
  wall-clock fallback), one-tap resume deep links ?play=1&progress&s&ep, hero
  Resume relabel, loading shell M4, search skeletons + a11y, motion tokens M10.
- Verify: audit/kur-49/cw-audit.mjs (375px mobile, seeded store — row, deep-link
  params, 44px remove, no overflow) + audit/kur-32/mobile-audit.mjs (regression:
  0 small targets, 0 overflow, 0 js errors di 375/390/414/768) + cw-desktop.mjs
  (1280px). Semua hijau pasca-deploy live URL.
- Deferred ke follow-up: US-4 next-episode, US-5 sticky header/chrome, PR-4/PR-5.

## KUR-55 US-4/US-5 + AC3 live (2026-10-02)
- PR#4 `feat/kur-55-us4-us5` (80f207d..be2c237): US-4 next-episode chip di
  player chrome (Player.tsx — muncul di final 90s / after ended via PLAYER_EVENT
  relay, auto-hide kalau embed self-advance, 44px target, one-tap swap ke ep
  berikutnya), episode list 16:9 stills + watched state + CW highlight +
  ?ep= deep link (TitlePage.astro + detail.ts), US-5 sticky mini-header 56px
  (stickyHeader.ts, IntersectionObserver, sync CTA dari hero via
  MutationObserver). Merged 38edb2a + deployed.
- PR#6 `feat/kur-55-us4-ac3-next-unwatched` (66650e0, merge 6fb0d09): AC3 —
  balik ke series tanpa progress in-flight -> hero CTA rewrite ke episode
  unwatched pertama season ter-render ("Play S{n}E{m}"); guard: ?ep= pin wins,
  cw.v1 in-progress wins (cwResumeLabel), season full-watched = no-op.
  nextUnwatched.ts jalan SEBELUM cwResumeLabel (urutan import di TitlePage).
- Deploy catatan: satu glitch tar chain (scp reported ok tapi file absen di
  homelab2 — app sempat down ~1 menit dengan dist terhapus). Recovery: re-scp +
  md5 verify kedua sisi sebelum extract. Lesson: selalu md5sum check sebelum
  rm -rf dist lama.
- Verify live: audit/kur-55/us4-us5-audit.mjs (chip hidden->visible 44px,
  click swap ke S2E6, sticky 56px/44px synced, stills 13/13, watched,
  deep-link highlight, cw row regression; 2 console noise: Cinemeta 429 +
  1 DNS miss, non-blocking) + audit/kur-55/ac3-probe.mjs (4 skenario AC3
  semua benar) + audit/kur-32/mobile-audit.mjs (8/8 combo: 0 overflow,
  0 small targets, 0 js errors).
