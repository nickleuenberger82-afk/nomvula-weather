/* GET /api/forecast — the assembled forecast. Served from a 15-minute cache that
   the hourly logger also refreshes; add ?fresh to rebuild it now. Open to other
   apps (the guest app, the morning brief) as plain JSON. */
import { openStore } from "../lib/store.mjs";
import { buildForecast } from "../lib/build.mjs";
import { json, CORS } from "../lib/http.mjs";

const FRESH_MIN = 15;
const CACHE = { "Cache-Control": "public, max-age=120", "Netlify-CDN-Cache-Control": "public, durable, max-age=300, stale-while-revalidate=900" };

export default async req => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const st = openStore(); const fresh = new URL(req.url).searchParams.has("fresh");
  let cached = null; try { cached = await st.get("cache/forecast"); } catch {}
  const age = cached ? (Date.now() - Date.parse(cached.generatedAt)) / 60000 : Infinity;
  if (cached && age < FRESH_MIN && !fresh) return json(cached, 200, CACHE);
  try {
    const out = await buildForecast(st);
    try { await st.setJSON("cache/forecast", out); } catch {}
    return json(out, 200, fresh ? { "Cache-Control": "no-store" } : CACHE);
  } catch (e) {
    if (cached) return json({ ...cached, stale: true, error: String((e && e.message) || e) }, 200, { "Cache-Control": "no-store" });
    return json({ error: "The weather services didn't answer. Try again in a few minutes.", detail: String((e && e.message) || e) }, 503, { "Cache-Control": "no-store" });
  }
};
export const config = { path: "/api/forecast" };
