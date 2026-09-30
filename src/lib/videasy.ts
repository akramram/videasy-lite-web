// Videasy player URL builders. https://videasy.xyz/#docs
// Official player: /movie/{tmdb_id}   TV: /tv/{tmdb_id}/{season}/{episode}
// TMDB + IMDB ids both accepted on every route (verified 2026-09-30, KUR-21).
//
// Why the official player (player.videasy.net) and not videasy.xyz/embed:
// the xyz embed routes some titles through a free-host ad/cookie interstitial
// (sv101.ifastnet.com/cookies.html) that requires third-party cookies. With
// cookies blocked — Chrome default — the gate can never pass and the user is
// stuck on "Cookies are not enabled." The official player has no gate
// (verified side-by-side, KUR-21).

export type MediaType = "movie" | "tv";

export interface EmbedTarget {
  readonly type: MediaType;
  /** TMDB numeric id (preferred) or IMDB id. */
  readonly id: string;
  readonly season?: number;
  readonly episode?: number;
}

const BASE = "https://player.videasy.to" as const;

export function embedUrl(target: EmbedTarget): string {
  const { type, id } = target;
  if (type === "tv") {
    const season = target.season ?? 1;
    const episode = target.episode ?? 1;
    return `${BASE}/tv/${id}/${season}/${episode}`;
  }
  return `${BASE}/movie/${id}`;
}
