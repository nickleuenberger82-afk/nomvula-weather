/* Runs every hour on Netlify's scheduler. Logs a reading for today, updates the
   daily record for today and yesterday (filling up to a month back if any day is
   missing), adds the Hoedspruit station's observed max and min, and refreshes the
   forecast cache so the app opens quickly. */
import { openStore, ensureSeed, allDays, updateAuto } from "../lib/store.mjs";
import { gather, buildForecast } from "../lib/build.mjs";
import { sastDate, addDays, hm, condOf, dominant, compass, stationDay } from "../lib/wx.mjs";

const r1 = v => (v == null ? null : Math.round(v * 10) / 10);
const mx = a => { const v = a.filter(x => x != null); return v.length ? Math.max(...v) : null; };
const mn = a => { const v = a.filter(x => x != null); return v.length ? Math.min(...v) : null; };

export async function logOnce(nowMs = Date.now()) {
  const st = openStore(); await ensureSeed(st);
  const today = sastDate(nowMs);
  const have = new Set((await allDays(st)).map(d => d.date));
  /* fill any gap back to the first day on record (up to a month), newest first */
  const first = [...have].sort()[0] || addDays(today, -7);
  const missing = [];
  for (let i = 1; i <= 31; i++) { const d = addDays(today, -i); if (d < first) break; if (!have.has(d)) missing.push(d); }
  const past = missing.length ? Math.min(31, Math.round((Date.parse(today) - Date.parse(missing[missing.length - 1])) / 864e5) + 1) : 1;
  const src = await gather({ pastDays: past });
  const om = src.om && src.om.rows.length ? src.om : null;
  const rows = om ? om.rows : src.met ? src.met.rows.filter(r => r.step === 1) : [];
  const want = new Set([today, addDays(today, -1), ...missing]);
  const dates = [...new Set(rows.map(r => r.date))].filter(d => want.has(d)).sort();
  const cur = om && om.current; const stn = src.metar && src.metar.latest && nowMs - src.metar.latest.ms < 90 * 60000 ? src.metar.latest : null;
  for (const date of dates) {
    const r = rows.filter(x => x.date === date); if (r.length < 6) continue;
    const aft = r.filter(x => x.h >= 12 && x.h < 18);
    await updateAuto(st, date, doc => {
      Object.assign(doc, {
        date, fcMax: r1(mx(r.map(x => x.t))), fcMin: r1(mn(r.map(x => x.t))), rainEst: r1(r.reduce((s, x) => s + (x.precip || 0), 0)),
        windMax_ms: r1(mx(r.map(x => x.ws)) / 3.6), gustMax_kmh: Math.round(mx(r.map(x => x.gust)) || 0) || null, rhMin: mn(r.map(x => x.rh)),
        cond: condOf(dominant(aft.length ? aft : r)), source: om ? "Open-Meteo model for Nomvula" : "MET Norway via yr.no", updatedAt: new Date(nowMs).toISOString()
      });
      const sd = stationDay(src.metar, date); if (sd) doc.stn = sd;
      if (date === today && (cur || r.length)) {
        const c = cur || r.filter(x => x.ms <= nowMs).pop() || r[0];
        const t = hm(nowMs); const readings = (doc.readings || []).filter(x => x.t !== t);
        readings.push({ t, temp: r1(c.t), rh: c.rh != null ? Math.round(c.rh) : null, wind_ms: c.ws != null ? r1(c.ws / 3.6) : null, wind_dir: compass(c.dir), cond: condOf(c.code), precip: r1(c.precip ?? 0), ...(stn ? { stn: stn.t } : {}) });
        doc.readings = readings.sort((a, b) => a.t.localeCompare(b.t));
      }
      return doc;
    });
  }
  try { await st.setJSON("cache/forecast", await buildForecast(st, src, nowMs)); } catch (e) { console.log("forecast cache not refreshed:", e.message); }
  if (src.errors.length) console.log("sources with problems:", src.errors.join("; "));
  return { dates, errors: src.errors };
}

export default async () => { const r = await logOnce(); console.log("logged", r.dates.join(", ")); };
export const config = { schedule: "@hourly" };
