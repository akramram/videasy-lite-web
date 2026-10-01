import type { APIRoute } from "astro";
import { searchAny } from "@/lib/cinemeta";

export const GET: APIRoute = async ({ url }) => {
  const q = (url.searchParams.get("q") ?? "").trim();
  if (q.length < 2) {
    return Response.json({ results: [] }, { status: 200 });
  }
  if (q.length > 80) {
    return Response.json({ error: "query too long" }, { status: 400 });
  }

  try {
    const results = await searchAny(q, AbortSignal.timeout(8000));
    return Response.json(
      { results },
      {
        status: 200,
        headers: {
          "cache-control":
            "public, max-age=300, stale-while-revalidate=86400",
        },
      },
    );
  } catch (cause) {
    const status = cause && typeof cause === "object" && "status" in cause
      ? Number((cause as { status: number }).status)
      : 502;
    return Response.json(
      { error: "upstream search failed" },
      { status: status >= 500 ? 502 : status },
    );
  }
};
