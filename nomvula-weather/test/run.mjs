/* Checks the functions against saved API responses (test/fixtures) and a
   throwaway file store. Run with: npm test */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const store = fs.mkdtempSync(path.join(os.tmpdir(), "wx-test-"));
process.env.WX_FIXTURES = path.join(root, "fixtures");
process.env.WX_LOCAL_STORE = store;
process.env.WEATHER_PASSCODE = "letmein";

const { logOnce } = await import("../netlify/functions/logger.mjs");
const forecast = (await import("../netlify/functions/forecast.mjs")).default;
const records = (await import("../netlify/functions/records.mjs")).default;
const { sastDate } = await import("../netlify/lib/wx.mjs");

const today = sastDate(Date.now());
const post = (body, pass) => records(new Request("http://x/api/records", { method: "POST", headers: { "Content-Type": "application/json", ...(pass ? { "X-Passcode": pass } : {}) }, body: JSON.stringify(body) }));
const getRecords = async () => (await records(new Request("http://x/api/records"))).json();

test("hourly logger seeds the old records and logs today", async () => {
  const r = await logOnce();
  assert.ok(r.dates.includes(today), "today was logged");
  const { days, writable } = await getRecords();
  assert.equal(writable, true);
  assert.ok(days.some(d => d.date === "2026-10-09"), "records from the old app carried over");
  const t = days.find(d => d.date === today);
  assert.ok(t.readings.length >= 1 && t.fcMax != null && t.fcMin != null);
});

test("forecast has a week of days, fire danger, sun and moon", async () => {
  const res = await forecast(new Request("http://x/api/forecast?fresh"));
  assert.equal(res.status, 200);
  const f = await res.json();
  assert.equal(f.errors.length, 0, f.errors.join("; "));
  assert.ok(f.days.length >= 7);
  for (const d of f.days) {
    assert.ok(d.max >= d.min, `${d.date} max above min`);
    assert.ok(d.fdi && d.fdi.value >= 0 && d.fdi.value <= 100 && d.fdi.cls, `${d.date} fire index`);
    assert.ok(d.sun.firstLight < d.sun.rise && d.sun.rise < d.sun.set && d.sun.set < d.sun.lastLight, `${d.date} sun order`);
    assert.ok(d.walk && d.drive, `${d.date} planning`);
  }
  const full = f.moonEvents.find(m => m.name === "Full moon");
  assert.equal(full.date, "2026-10-26"); assert.equal(full.time, "06:12");
  assert.ok(f.hours.length >= 24);
});

test("saving readings needs the passcode and checks the numbers", async () => {
  assert.equal((await post({ date: today, manual: { rain: 4 } })).status, 401);
  assert.equal((await post({ date: today, manual: { rain: 4 } }, "nope")).status, 401);
  assert.equal((await post({ date: today, manual: { max: 80 } }, "letmein")).status, 400);
  assert.equal((await post({ date: today, manual: { max: 20, min: 30 } }, "letmein")).status, 400);
  assert.equal((await post({ date: "22/10/2026", manual: { rain: 1 } }, "letmein")).status, 400);
  const ok = await post({ date: today, manual: { rain: 6.5, notes: "storm at 4pm", by: "Nick" } }, "letmein");
  assert.equal(ok.status, 200);
  let t = (await getRecords()).days.find(d => d.date === today);
  assert.equal(t.manual.rain, 6.5); assert.equal(t.manual.by, "Nick");
  assert.ok(t.readings.length >= 1, "logger's readings kept alongside");
  await logOnce();
  t = (await getRecords()).days.find(d => d.date === today);
  assert.equal(t.manual.rain, 6.5, "logger never overwrites your readings");
  await post({ date: today, manual: null }, "letmein");
  t = (await getRecords()).days.find(d => d.date === today);
  assert.equal(t.manual, undefined);
});

test("your rain lowers the next day's fire danger", async () => {
  const before = (await (await forecast(new Request("http://x/api/forecast?fresh"))).json()).days[1].fdi;
  await post({ date: today, manual: { rain: 12 } }, "letmein");
  const after = (await (await forecast(new Request("http://x/api/forecast?fresh"))).json()).days[1].fdi;
  assert.ok(after.value < before.value, `${after.value} < ${before.value}`);
  assert.equal(after.lastRain.own, true);
});

test("import takes many days at once", async () => {
  const items = Array.from({ length: 30 }, (_, i) => ({ date: `2025-09-${String(i + 1).padStart(2, "0")}`, manual: { rain: i % 5 } }));
  const r = await post({ items }, "letmein");
  assert.equal(r.status, 200);
  const days = (await getRecords()).days.filter(d => d.date.startsWith("2025-09") && d.manual);
  assert.equal(days.length, 30, "0 mm counts as a reading");
});

test("offline files listed in the service worker exist", () => {
  const sw = fs.readFileSync(path.join(root, "..", "public", "sw.js"), "utf8");
  const files = JSON.parse(sw.match(/const FILES = (\[[^\]]*\])/)[1]);
  for (const f of files) if (f !== "/") assert.ok(fs.existsSync(path.join(root, "..", "public", f)), f);
});
