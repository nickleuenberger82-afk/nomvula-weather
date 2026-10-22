/* /api/records
   GET  — every day on record (logged automatically plus your own readings).
   POST — save your own readings. Needs the X-Passcode header to match the
          WEATHER_PASSCODE environment variable set in Netlify.
          Body: { date, manual } for one day, { items: [{ date, manual }] } for an
          import, { date, manual: null } to remove your readings, or { check: true }
          to test the passcode. */
import crypto from "node:crypto";
import { openStore, ensureSeed, allDays, readMonth, writeMonth, DATE_RE } from "../lib/store.mjs";
import { json, CORS } from "../lib/http.mjs";

const sha = s => crypto.createHash("sha256").update(String(s)).digest();
const sameSecret = (a, b) => crypto.timingSafeEqual(sha(a), sha(b));
const LIMITS = { max: [-5, 50], min: [-10, 40], rain: [0, 500], wind_kmh: [0, 250] };

function clean(m) {
  if (!m || typeof m !== "object") return null;
  const out = {};
  for (const [k, [lo, hi]] of Object.entries(LIMITS)) {
    if (m[k] == null || m[k] === "") continue;
    const v = Number(m[k]); if (!isFinite(v) || v < lo || v > hi) throw new Error(`${k} ${m[k]} is out of range`);
    out[k] = Math.round(v * 10) / 10;
  }
  if (out.max != null && out.min != null && out.min > out.max) throw new Error("min is higher than max");
  if (typeof m.notes === "string" && m.notes.trim()) out.notes = m.notes.trim().slice(0, 500);
  if (!Object.keys(out).length) return null;
  if (typeof m.by === "string" && m.by.trim()) out.by = m.by.trim().slice(0, 40);
  out.at = Date.now();
  return out;
}

export default async req => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const st = openStore();
  if (req.method === "GET") {
    await ensureSeed(st);
    return json({ days: await allDays(st), writable: !!process.env.WEATHER_PASSCODE }, 200, { "Cache-Control": "no-store" });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const pass = process.env.WEATHER_PASSCODE;
  if (!pass) return json({ error: "Saving is switched off until a passcode is set in Netlify (WEATHER_PASSCODE)." }, 403);
  if (!sameSecret(req.headers.get("x-passcode") || "", pass)) { await new Promise(r => setTimeout(r, 600)); return json({ error: "Wrong passcode" }, 401); }
  const body = await req.json().catch(() => null);
  if (body && body.check) return json({ ok: true });
  const items = Array.isArray(body && body.items) ? body.items : body && body.date ? [body] : [];
  if (!items.length || items.length > 1000) return json({ error: "Nothing to save" }, 400);
  const byMonth = {}; let rainTouched = false;
  try {
    for (const it of items) {
      if (!DATE_RE.test(String(it.date))) throw new Error(`bad date ${it.date}`);
      const m = it.manual === null ? null : clean(it.manual);
      (byMonth[it.date.slice(0, 7)] ||= []).push([it.date, m]);
      if (!m || m.rain != null) rainTouched = true;
    }
  } catch (e) { return json({ error: String(e.message || e) }, 400); }
  await ensureSeed(st);
  for (const [month, list] of Object.entries(byMonth)) {
    const cur = await readMonth(st, "manual", month);
    list.forEach(([date, m]) => { if (m) cur[date] = m; else delete cur[date]; });
    await writeMonth(st, "manual", month, cur);
  }
  /* your rain readings feed the fire danger index, so rebuild the forecast on the next visit */
  if (rainTouched) { try { await st.delete("cache/forecast"); } catch {} }
  return json({ ok: true, saved: items.length });
};
export const config = { path: "/api/records" };
