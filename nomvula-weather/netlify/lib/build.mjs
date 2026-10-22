/* Gather every source (each one may fail on its own) and assemble the forecast. */
import fs from "node:fs";
import path from "node:path";
import { fetchOpenMeteo, fetchMet, fetchModels, fetchMetar, parseOpenMeteo, parseMet, parseModels, parseMetar, assemble } from "./wx.mjs";
import { allDays } from "./store.mjs";

/* WX_FIXTURES points tests at saved API responses instead of the network */
function fixture(name, parse) { const p = path.join(process.env.WX_FIXTURES, name); return Promise.resolve().then(() => parse(JSON.parse(fs.readFileSync(p, "utf8")))); }

export async function gather({ pastDays = 0 } = {}) {
  const F = process.env.WX_FIXTURES;
  const jobs = F
    ? [fixture("openmeteo.json", parseOpenMeteo), fixture("met.json", parseMet), fixture("models.json", parseModels), fixture("metar.json", parseMetar)]
    : [fetchOpenMeteo(pastDays), fetchMet(), fetchModels(), fetchMetar()];
  const [om, met, models, metar] = await Promise.allSettled(jobs);
  const val = r => (r.status === "fulfilled" ? r.value : null);
  const errors = [["Open-Meteo", om], ["MET Norway", met], ["Model comparison", models], ["Hoedspruit station", metar]].filter(([, r]) => r.status === "rejected").map(([n, r]) => `${n}: ${(r.reason && r.reason.message) || r.reason}`);
  return { om: val(om), met: val(met), models: val(models) || [], metar: val(metar), errors };
}

export async function buildForecast(st, src, nowMs = Date.now()) {
  src = src || (await gather());
  if (!(src.om && src.om.rows.length) && !src.met) throw new Error("No forecast source answered" + (src.errors.length ? ` (${src.errors.join("; ")})` : ""));
  let records = []; try { records = await allDays(st); } catch {}
  const out = assemble({ ...src, records }, nowMs);
  out.errors = src.errors;
  return out;
}
