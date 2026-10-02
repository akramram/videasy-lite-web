// Wall-clock fallback for continue-watching progress (US-1).
// PRIMARY source is the PLAYER_EVENT relay (cwPlayer.ts). If the embed's event
// protocol is ever absent/blocked (undocumented, unversioned), this fallback
// estimates position from elapsed wall-clock time against the title's runtime
// — capped at 95% so it can never mark a title watched on its own.
//
// Session shape (sessionStorage, dies with the tab on purpose):
//   videasy:cwsess.v1 = { imdbId, type, season?, episode?, startedAt, baseSec }
// baseSec = last known position (event-written) when the session started.

import { loadEntries, upsertProgress, MIN_WATCHED_SEC } from "@/lib/continueWatching";

const SESSION_KEY = "videasy:cwsess.v1";
/** No PLAYER_EVENT within this window -> fall back to wall-clock. */
const EVENT_TIMEOUT_MS = 15_000;
const FALLBACK_TICK_MS = 10_000;
/** Wall-clock estimates never exceed 95% (watched threshold is 92%, but the
 *  estimate is deliberately conservative — it is not real progress). */
const FALLBACK_CAP = 0.95;

interface CwSession {
  imdbId: string;
  title: string;
  type: "movie" | "tv";
  season?: number;
  episode?: number;
  startedAt: number;
  baseSec: number;
}

function readSession(): CwSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as CwSession) : null;
  } catch {
    return null;
  }
}

function writeSession(session: CwSession | null): void {
  try {
    if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* private mode: fallback silently unavailable */
  }
}

/** Called by the page when playback starts (play button / episode click). */
export function startWallClockSession(session: Omit<CwSession, "startedAt" | "baseSec">): void {
  const prior = loadEntries().find((e) => e.imdbId === session.imdbId);
  writeSession({
    ...session,
    startedAt: Date.now(),
    baseSec: prior?.positionSec ?? 0,
  });
}

export function stopWallClockSession(): void {
  writeSession(null);
}

/** Notify the fallback that a real event landed (resets the 15s timer). */
export function notifyEventSeen(): void {
  try {
    sessionStorage.setItem("videasy:cwsess.event", String(Date.now()));
  } catch {
    /* ignore */
  }
}

function lastEventSeen(): number {
  try {
    return Number(sessionStorage.getItem("videasy:cwsess.event") ?? 0);
  } catch {
    return 0;
  }
}

/**
 * Install the fallback ticker. While a session is active AND no PLAYER_EVENT
 * has been seen for >=15s, upserts an estimated position every 10s.
 * Returns a detach function.
 */
export function installWallClockFallback(
  runtimeMinFor: (imdbId: string) => number | undefined,
): () => void {
  const timer = window.setInterval(() => {
    const session = readSession();
    if (!session) return;
    // Real events flowing -> do nothing (relay is the source of truth).
    if (Date.now() - lastEventSeen() < EVENT_TIMEOUT_MS) return;

    const runtimeMin = runtimeMinFor(session.imdbId);
    if (!runtimeMin || runtimeMin <= 0) return;

    const elapsedSec = session.baseSec + (Date.now() - session.startedAt) / 1000;
    const durationSec = runtimeMin * 60;
    // Cap: estimate may never cross the watched threshold on its own.
    const positionSec = Math.min(elapsedSec, durationSec * FALLBACK_CAP);

    upsertProgress({
      imdbId: session.imdbId,
      title: session.title,
      type: session.type,
      season: session.season,
      episode: session.episode,
      runtimeMin,
      positionSec,
      durationSec,
    });
  }, FALLBACK_TICK_MS);

  return () => window.clearInterval(timer);
}

export { MIN_WATCHED_SEC };
