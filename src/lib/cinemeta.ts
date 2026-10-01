// Zod schemas + typed client for Cinemeta (Stremio public metadata API, no key).
// Catalog:  https://v3-cinemeta.strem.io/catalog/movie/top.json
// Search:   https://v3-cinemeta.strem.io/catalog/movie/top/search={query}.json
// Posters:  https://images.metahub.space/poster/medium/{imdb_id}/img  (307 -> small)

import { z } from "zod";

const CINEMETA = "https://v3-cinemeta.strem.io" as const;
const REQUIRED_ORIGIN = "https://web.stremio.com";

const MetaSchema = z.object({
  id: z.string().regex(/^tt\d+$/),
  name: z.string().min(1),
  type: z.enum(["movie", "series"]).optional().catch(undefined),
  releaseInfo: z
    .string()
    .default("")
    .transform((s) => s.trim()),
  poster: z.string().url().optional().catch(undefined),
  description: z.string().optional().catch(undefined),
  imdbRating: z.string().optional().catch(undefined),
  genres: z.array(z.string()).optional().catch(undefined),
  runtime: z.string().optional().catch(undefined),
});

export type Meta = z.infer<typeof MetaSchema>;

const CatalogSchema = z.object({ metas: z.array(MetaSchema) });
export type Catalog = z.infer<typeof CatalogSchema>;

/** Extract "1995" from Cinemeta's loose releaseInfo ("1995", "2024 –", "2026"). */
export function parseYear(releaseInfo: string): number | null {
  const m = /((?:19|20)\d{2})/.exec(releaseInfo);
  return m ? Number(m[1]) : null;
}

export function posterUrl(imdbId: string): string {
  return `https://images.metahub.space/poster/medium/${imdbId}/img`;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function getJson(url: string, signal: AbortSignal): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { accept: "application/json", origin: REQUIRED_ORIGIN },
      signal,
      cache: "no-store",
    });
  } catch (cause) {
    if (signal.aborted) throw signal.reason;
    throw new ApiError(`cinemeta unreachable: ${String(cause)}`, 502);
  }
  if (!res.ok) throw new ApiError(`cinemeta ${res.status}`, res.status);
  return res.json();
}

export async function popularMovies(signal: AbortSignal): Promise<Catalog> {
  const raw = await getJson(`${CINEMETA}/catalog/movie/top.json`, signal);
  return CatalogSchema.parse(raw);
}

export async function searchMovies(
  query: string,
  signal: AbortSignal,
): Promise<Catalog> {
  const raw = await getJson(
    `${CINEMETA}/catalog/movie/top/search=${encodeURIComponent(query)}.json`,
    signal,
  );
  return CatalogSchema.parse(raw);
}

/**
 * Split a raw query into title + optional year filter.
 * "heat 1995" -> { title: "heat", year: 1995 }
 */
export function parseQuery(raw: string): {
  title: string;
  year: number | null;
} {
  const m = /^(.*?)(?:\s+((?:19|20)\d{2}))?\s*$/.exec(raw.trim());
  if (!m) return { title: raw.trim(), year: null };
  return { title: m[1] ?? "", year: m[2] ? Number(m[2]) : null };
}

/** Rank results: exact title match first, then year match, then Cinemeta order. */
export function rankResults(
  metas: readonly Meta[],
  parsed: { title: string; year: number | null },
): readonly Meta[] {
  const q = parsed.title.toLowerCase();
  return [...metas].sort((a, b) => {
    if (parsed.year !== null) {
      const ya = parseYear(a.releaseInfo) === parsed.year ? 0 : 1;
      const yb = parseYear(b.releaseInfo) === parsed.year ? 0 : 1;
      if (ya !== yb) return ya - yb;
    }
    const ea = a.name.toLowerCase() === q ? 0 : 1;
    const eb = b.name.toLowerCase() === q ? 0 : 1;
    if (ea !== eb) return ea - eb;
    return 0;
  });
}

export { CatalogSchema, MetaSchema };

// ---- Detail (KUR-25) ----
// Meta detail: https://v3-cinemeta.strem.io/meta/{type}/{imdb_id}.json
// Series episodes live in `videos[]`; TMDB id in `moviedb_id` (player prefers it).

export const VideoSchema = z.object({
  id: z.string().catch(""),
  name: z.string().default("").catch(""),
  season: z.number().default(1).catch(1),
  number: z.number().default(1).catch(1),
  overview: z.string().optional().catch(undefined),
  thumbnail: z.string().url().optional().catch(undefined),
});
export type Video = z.infer<typeof VideoSchema>;

export const DetailSchema = MetaSchema.extend({
  description: z.string().default("").catch(""),
  imdbRating: z.string().optional().catch(undefined),
  runtime: z.string().optional().catch(undefined),
  genres: z.array(z.string()).optional().catch(undefined),
  cast: z.array(z.string()).optional().catch(undefined),
  director: z.union([z.array(z.string()), z.string()]).optional().catch(undefined),
  moviedb_id: z.union([z.number(), z.string()]).optional().catch(undefined),
  videos: z.array(VideoSchema).optional().catch(undefined),
});
export type Detail = z.infer<typeof DetailSchema>;

/** TMDB numeric id for the player, or null when Cinemeta has none. */
export function tmdbId(d: Detail): string | null {
  const v = d.moviedb_id;
  if (v === null || v === undefined) return null;
  const s = String(v);
  return /^\d+$/.test(s) ? s : null;
}

export async function movieDetail(id: string, signal: AbortSignal): Promise<Detail> {
  const raw = await getJson(`${CINEMETA}/meta/movie/${encodeURIComponent(id)}.json`, signal);
  return DetailSchema.parse((raw as { meta: unknown }).meta);
}

export async function seriesDetail(id: string, signal: AbortSignal): Promise<Detail> {
  const raw = await getJson(`${CINEMETA}/meta/series/${encodeURIComponent(id)}.json`, signal);
  return DetailSchema.parse((raw as { meta: unknown }).meta);
}

/** Resolve a title id: movies first, series as fallback (route does not encode type). */
export async function detailAny(
  id: string,
  signal: AbortSignal,
): Promise<{ type: "movie" | "series"; detail: Detail }> {
  try {
    return { type: "movie", detail: await movieDetail(id, signal) };
  } catch (cause) {
    const status = cause instanceof ApiError ? cause.status : 0;
    if (status !== 404 && status !== 400) throw cause;
    return { type: "series", detail: await seriesDetail(id, signal) };
  }
}

/** Combined movie + series search, tagged with type. Series searched by the
 *  raw query (year-suffix queries miss in the series catalog). */
export async function searchAny(
  query: string,
  signal: AbortSignal,
): Promise<readonly Meta[]> {
  const parsed = parseQuery(query);
  const [movies, series] = await Promise.allSettled([
    searchMovies(query, signal),
    seriesSearch(parsed.title, signal),
  ]);
  const movieMetas = (movies.status === "fulfilled" ? movies.value.metas : []).map(
    (m): Meta => ({ ...m, type: m.type ?? "movie" }),
  );
  const seriesMetas = (series.status === "fulfilled" ? series.value.metas : []).map(
    (m): Meta => ({ ...m, type: "series" }),
  );
  // Movies ranked first (year-aware); series appended after.
  return [...rankResults(movieMetas, parsed), ...seriesMetas];
}

export async function seriesSearch(
  query: string,
  signal: AbortSignal,
): Promise<Catalog> {
  const raw = await getJson(
    `${CINEMETA}/catalog/series/top/search=${encodeURIComponent(query)}.json`,
    signal,
  );
  return CatalogSchema.parse(raw);
}
