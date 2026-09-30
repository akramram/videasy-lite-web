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
