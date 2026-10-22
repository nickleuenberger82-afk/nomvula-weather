/* Storage for the daily records and the forecast cache, in Netlify Blobs.
   Keys:
     auto/YYYY-MM     { date: {...} }  written only by the hourly logger
     manual/YYYY-MM   { date: {...} }  written only by people (passcode)
     cache/forecast   the last assembled forecast
     meta/seeded      set once the old app's records are loaded
   Keeping the logger and people in separate keys means they never overwrite each other.
   For tests and local runs, set WX_LOCAL_STORE to a folder to use plain files instead. */
import { getStore } from "@netlify/blobs";
import fs from "node:fs";
import path from "node:path";
import SEED from "./seed.mjs";

function fileStore(dir) {
  const f = k => path.join(dir, k.replace(/\//g, "__") + ".json");
  return {
    async get(k) { try { return JSON.parse(fs.readFileSync(f(k), "utf8")); } catch { return null; } },
    async setJSON(k, v) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(f(k), JSON.stringify(v)); },
    async delete(k) { try { fs.unlinkSync(f(k)); } catch {} },
    async list({ prefix = "" } = {}) { let names = []; try { names = fs.readdirSync(dir); } catch {} return { blobs: names.map(n => ({ key: n.replace(/\.json$/, "").replace(/__/g, "/") })).filter(b => b.key.startsWith(prefix)) }; }
  };
}
export function openStore() {
  if (process.env.WX_LOCAL_STORE) return fileStore(process.env.WX_LOCAL_STORE);
  const s = getStore({ name: "nomvula-weather", consistency: "strong" });
  return { get: k => s.get(k, { type: "json" }), setJSON: (k, v) => s.setJSON(k, v), delete: k => s.delete(k), list: o => s.list(o) };
}

const ym = date => date.slice(0, 7);
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function readMonth(st, kind, month) { return (await st.get(`${kind}/${month}`)) || {}; }
export async function writeMonth(st, kind, month, obj) { await st.setJSON(`${kind}/${month}`, obj); }

/* load the old app's records once; merge with anything the logger wrote first */
export async function ensureSeed(st) {
  if (await st.get("meta/seeded")) return false;
  const byMonth = {};
  Object.values(SEED).forEach(d => { (byMonth[ym(d.date)] ||= []).push(d); });
  for (const [m, list] of Object.entries(byMonth)) {
    const cur = await readMonth(st, "auto", m);
    list.forEach(d => {
      const have = cur[d.date];
      if (!have) { cur[d.date] = { ...d, source: d.source || "MET Norway via yr.no" }; return; }
      const seen = new Set((have.readings || []).map(r => r.t));
      have.readings = [...(d.readings || []).filter(r => !seen.has(r.t)), ...(have.readings || [])].sort((a, b) => String(a.t).localeCompare(String(b.t)));
    });
    await writeMonth(st, "auto", m, cur);
  }
  await st.setJSON("meta/seeded", { at: new Date().toISOString(), days: Object.keys(SEED).length });
  return true;
}

/* every day on record, as { date, ...auto fields, manual } */
export async function allDays(st) {
  const [a, m] = await Promise.all([st.list({ prefix: "auto/" }), st.list({ prefix: "manual/" })]);
  const keys = [...a.blobs, ...m.blobs].map(b => b.key);
  const docs = await Promise.all(keys.map(async k => [k, (await st.get(k)) || {}]));
  const out = {};
  docs.forEach(([k, obj]) => {
    const kind = k.split("/")[0];
    Object.entries(obj).forEach(([date, v]) => {
      const d = out[date] || (out[date] = { date });
      if (kind === "auto") Object.assign(d, v, { date }); else if (v && Object.keys(v).length) d.manual = v;
    });
  });
  return Object.values(out).sort((x, y) => x.date.localeCompare(y.date));
}

export async function updateAuto(st, date, fn) {
  const m = ym(date); const cur = await readMonth(st, "auto", m);
  cur[date] = fn(cur[date] || { date }) || cur[date]; await writeMonth(st, "auto", m, cur); return cur[date];
}
export async function setManual(st, date, manual) {
  const m = ym(date); const cur = await readMonth(st, "manual", m);
  if (manual && Object.keys(manual).length) cur[date] = manual; else delete cur[date];
  await writeMonth(st, "manual", m, cur); return cur[date] || null;
}
