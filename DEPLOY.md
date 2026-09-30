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
4. `ssh homelab2 'pm2 stop videasy-lite; cd /opt/videasy-lite && rm -rf dist node_modules package.json && tar xzf /tmp/v.tgz && rm /tmp/v.tgz; PORT=4599 HOST=127.0.0.1 pm2 restart videasy-lite --update-env'`
5. Verify: `curl -s http://127.0.0.1:4599/` -> 200; `curl -s 'http://127.0.0.1:4599/api/search?q=heat+1995'`

## GitHub — BLOCKED (pending Akram)
- Remote dituju `akramram/videasy-lite-app` tapi push 403: PAT fine-grained (keyring github_pat_1... + store) tidak punya Contents:write utk repo baru; Administration:write ada (bisa create repo) tapi Deploy keys API 403.
- Fix: update salah satu PAT -> allowlist repo baru + Contents:RW (atau "All repositories"). Lalu: push `feat/initial-implementation` -> PR -> merge (aturan: jangan langsung ke main).
- Repo sisa eksperimen (boleh dihapus): `videasy-lite-web`, `videasy-lite-app2`, `videasy-probe-fg`.
- Note: repo `videasy-lite-app` (private?) ada di akun tapi tidak visible dari PAT manapun — cek via web UI.
