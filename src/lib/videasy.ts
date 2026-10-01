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

export type ServerOption = "videasy" | "vidlink" | "vidsrc";

const SERVERS: Record<ServerOption, { label: string; buildUrl: (target: EmbedTarget) => string }> = {
  videasy: {
    label: "Server 1 (Videasy)",
    buildUrl: (target) => {
      const { type, id } = target;
      // Canonical official domain (KUR-21/KUR-31); player.videasy.to is its
      // current 301 target, kept as redirect headroom if it moves back.
      const base = "https://player.videasy.net";
      return type === "tv"
        ? `${base}/tv/${id}/${target.season ?? 1}/${target.episode ?? 1}`
        : `${base}/movie/${id}`;
    },
  },
  vidlink: {
    label: "Server 2 (VidLink)",
    buildUrl: (target) => {
      const { type, id } = target;
      return type === "tv"
        ? `https://vidlink.pro/tv/${id}/${target.season ?? 1}/${target.episode ?? 1}`
        : `https://vidlink.pro/movie/${id}`;
    },
  },
  vidsrc: {
    label: "Server 3 (Vidsrc)",
    buildUrl: (target) => {
      const { type, id } = target;
      return type === "tv"
        ? `https://vidsrc.to/embed/tv/${id}/${target.season ?? 1}/${target.episode ?? 1}`
        : `https://vidsrc.to/embed/movie/${id}`;
    },
  },
};

export function embedUrl(target: EmbedTarget, server: ServerOption = "videasy"): string {
  return SERVERS[server].buildUrl(target);
}
