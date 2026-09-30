// Videasy embed URL builders. https://videasy.xyz/#docs
// Movie: /embed/movie/{tmdb_id}   TV: /embed/tv/{tmdb_id}/{season}/{episode}
// IMDB ids (tt…) are also accepted by the movie route (verified 2026-09-30).

export type MediaType = "movie" | "tv";

export interface EmbedTarget {
  readonly type: MediaType;
  /** TMDB numeric id (preferred) or IMDB id (movies only). */
  readonly id: string;
  readonly season?: number;
  readonly episode?: number;
}

const BASE = "https://videasy.xyz/embed" as const;

export function embedUrl(target: EmbedTarget): string {
  const { type, id } = target;
  if (type === "tv") {
    const season = target.season ?? 1;
    const episode = target.episode ?? 1;
    return `${BASE}/tv/${id}/${season}/${episode}`;
  }
  return `${BASE}/movie/${id}`;
}
