## KUR-21 — fix mixed-content error from videasy embed

Problem: Chromium blocked `http://sv101.ifastnet.com/cookies.html` inside the
videasy.xyz embed on https://videasy.kurulabs.dpdns.org/ (Mixed Content).

Root cause: third-party embed (their free host) frames an http:// URL; not
fixable in our code directly.

Fix: CSP `upgrade-insecure-requests` meta on our page — inherited by child
frames, so the embed's http:// sub-requests upgrade to https:// (host verified
HTTPS-capable, 200).

Verified live: reproduced the blocked frame, deployed, clicked through the
cookie interstitial → frame target is now `https://sv101.ifastnet.com/cookies.html`
and renders (no mixed-content block).

Also: DEPLOY.md — document HOST=0.0.0.0 restart pitfall (127.0.0.1 broke the
autossh forward → public 502) and the CSP rationale.

Note: push blocked by PAT scope (403 Contents:write) — same blocker as KUR-16.
