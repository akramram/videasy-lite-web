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

## GitHub — BLOCKED (pending Akram)
- Remote dituju `akramram/videasy-lite-app` tapi push 403: PAT fine-grained (keyring github_pat_1... + store) tidak punya Contents:write utk repo baru; Administration:write ada (bisa create repo) tapi Deploy keys API 403.
- Fix: update salah satu PAT -> allowlist repo baru + Contents:RW (atau "All repositories"). Lalu: push `feat/initial-implementation` -> PR -> merge (aturan: jangan langsung ke main).
- Repo sisa eksperimen (boleh dihapus): `videasy-lite-web`, `videasy-lite-app2`, `videasy-probe-fg`.
- Note: repo `videasy-lite-app` (private?) ada di akun tapi tidak visible dari PAT manapun — cek via web UI.
