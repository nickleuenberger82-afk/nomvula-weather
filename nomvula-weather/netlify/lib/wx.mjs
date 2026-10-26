/* Nomvula Weather engine: fetch the sources, normalise them, and work out
   sun and moon, the Lowveld fire danger index, walk and drive windows,
   alerts and field notes for each day. Shared by the forecast API and the
   hourly logger. All times are SAST (UTC+2, no daylight saving). */
import { createRequire } from "node:module";
const Astro = createRequire(import.meta.url)("astronomy-engine");

export const SITE = { name: "Nomvula", lat: -24.273728, lon: 31.133282, elev: 380 };
const OFF = 2 * 3600e3;

/* ---------- time helpers (SAST) ---------- */
export const sastDate = ms => new Date(ms + OFF).toISOString().slice(0, 10);
export const sastHour = ms => new Date(ms + OFF).getUTCHours();
export const hm = ms => (ms == null ? null : new Date(Math.round(ms / 60000) * 60000 + OFF).toISOString().slice(11, 16));
export const msAt = (date, h = 0, m = 0) => Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10), h, m) - OFF;
export const addDays = (date, n) => sastDate(msAt(date, 12) + n * 864e5);
const q15 = ms => Math.round(ms / 900e3) * 900e3;
const DAYL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const weekday = date => DAYL[new Date(msAt(date, 12) + OFF).getUTCDay()];

/* ---------- small maths ---------- */
const r0 = v => (v == null ? null : Math.round(v));
const r1 = v => (v == null ? null : Math.round(v * 10) / 10);
const num = v => (typeof v === "number" && isFinite(v) ? v : null);
const maxOf = a => { const v = a.filter(x => x != null); return v.length ? Math.max(...v) : null; };
const minOf = a => { const v = a.filter(x => x != null); return v.length ? Math.min(...v) : null; };
const sumOf = a => a.filter(x => x != null).reduce((s, x) => s + x, 0);
export function median(a) { const v = a.filter(x => x != null).sort((x, y) => x - y); if (!v.length) return null; const m = v.length >> 1; return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; }
const PTS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
export const compass = deg => (deg == null || isNaN(deg) ? null : PTS[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16]);
const WORD = { N: "northerly", NNE: "north-north-easterly", NE: "north-easterly", ENE: "east-north-easterly", E: "easterly", ESE: "east-south-easterly", SE: "south-easterly", SSE: "south-south-easterly", S: "southerly", SSW: "south-south-westerly", SW: "south-westerly", WSW: "west-south-westerly", W: "westerly", WNW: "west-north-westerly", NW: "north-westerly", NNW: "north-north-westerly" };
export const windWord = c => WORD[c] || "";
/* relative humidity from temperature and dew point (Magnus) */
export function rhFrom(t, td) { if (t == null || td == null) return null; const a = 17.625, b = 243.04; return Math.max(0, Math.min(100, 100 * Math.exp(a * td / (b + td) - a * t / (b + t)))); }

/* ---------- conditions ---------- */
const WMO = { 0: "Clear sky", 1: "Fair", 2: "Partly cloudy", 3: "Cloudy", 45: "Fog", 48: "Fog", 51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle", 56: "Freezing drizzle", 57: "Freezing drizzle", 61: "Light rain", 63: "Rain", 65: "Heavy rain", 66: "Freezing rain", 67: "Freezing rain", 71: "Light snow", 73: "Snow", 75: "Heavy snow", 77: "Snow", 80: "Light rain showers", 81: "Rain showers", 82: "Heavy rain showers", 85: "Snow showers", 86: "Snow showers", 95: "Thunderstorms", 96: "Thunderstorms with hail", 99: "Thunderstorms with hail" };
export const condOf = code => (code == null ? "" : WMO[code] || "Cloudy");
const SYM = { clearsky: 0, fair: 1, partlycloudy: 2, cloudy: 3, fog: 45, lightrain: 61, rain: 63, heavyrain: 65, lightrainshowers: 80, rainshowers: 81, heavyrainshowers: 82, lightsleet: 61, sleet: 63, heavysleet: 65, lightsnow: 71, snow: 73, heavysnow: 75 };
export function codeOfSymbol(s) { if (!s) return null; const k = String(s).replace(/_(day|night|polartwilight)$/, ""); if (/thunder/.test(k)) return 95; return SYM[k] ?? 3; }
const wetRank = c => (c >= 95 ? 100 : c === 65 || c === 82 ? 90 : c === 63 || c === 81 ? 80 : c === 61 || c === 80 ? 70 : c >= 51 && c <= 57 ? 60 : 0);
/* the code that best describes a block of hours: a real wet signal wins, otherwise the most common sky */
export function dominant(rows) {
  if (!rows.length) return null;
  const wet = rows.filter(r => r.code != null && wetRank(r.code) && ((r.precip ?? 0) >= 0.3 || (r.pop ?? 0) >= 50 || (r.code >= 95 && (r.pop ?? 50) >= 30)));
  if (wet.length) return wet.reduce((a, r) => (wetRank(r.code) > wetRank(a.code) ? r : a)).code;
  const n = {}; rows.forEach(r => { if (r.code != null) { const c = wetRank(r.code) ? 3 : r.code; n[c] = (n[c] || 0) + 1; } });
  const best = Object.entries(n).sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
  return best ? +best[0] : null;
}

/* ---------- fetching ---------- */
async function getJSON(url, opts = {}) {
  const res = await fetch(url, { headers: { Accept: "application/json", ...(opts.headers || {}) }, signal: AbortSignal.timeout(opts.timeout || 9000) });
  if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}`);
  return res.json();
}
const OM_HOURLY = "temperature_2m,apparent_temperature,relative_humidity_2m,dew_point_2m,precipitation,precipitation_probability,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m,uv_index,is_day";
const OM_CURRENT = "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation,is_day";
const OM_DAILY = "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,uv_index_max";
export const MODELS = [
  ["ecmwf_ifs025", "ECMWF"], ["gfs_seamless", "GFS (USA)"], ["icon_seamless", "ICON (Germany)"],
  ["ukmo_seamless", "UK Met Office"], ["meteofrance_seamless", "Météo-France"], ["gem_seamless", "GEM (Canada)"]
];
const loc = `latitude=${SITE.lat}&longitude=${SITE.lon}`;
export const URLS = {
  openMeteo: (pastDays = 0) => `https://api.open-meteo.com/v1/forecast?${loc}&hourly=${OM_HOURLY}&current=${OM_CURRENT}&daily=${OM_DAILY}&wind_speed_unit=kmh&timezone=Africa%2FJohannesburg&forecast_days=8&past_days=${pastDays}`,
  models: () => `https://api.open-meteo.com/v1/forecast?${loc}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&models=${MODELS.map(m => m[0]).join(",")}&timezone=Africa%2FJohannesburg&forecast_days=8`,
  met: () => `https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=${SITE.lat.toFixed(4)}&lon=${SITE.lon.toFixed(4)}&altitude=${SITE.elev}`,
  metar: () => "https://aviationweather.gov/api/data/metar?ids=FAHS&format=json&hours=30"
};
export const userAgent = () => process.env.MET_USER_AGENT || `NomvulaWeather/2.0 ${process.env.URL || "https://github.com/nomvula-weather"}`;

export const fetchOpenMeteo = async (pastDays = 0) => parseOpenMeteo(await getJSON(URLS.openMeteo(pastDays)));
export const fetchModels = async () => parseModels(await getJSON(URLS.models()));
export const fetchMet = async () => parseMet(await getJSON(URLS.met(), { headers: { "User-Agent": userAgent() } }));
export const fetchMetar = async () => parseMetar(await getJSON(URLS.metar()));

/* ---------- parsing ---------- */
const localMs = s => msAt(s.slice(0, 10), +s.slice(11, 13), +s.slice(14, 16) || 0);
export function parseOpenMeteo(j) {
  const H = j.hourly || {}; const rows = [];
  (H.time || []).forEach((s, i) => {
    const v = k => num(H[k] && H[k][i]);
    if (v("temperature_2m") == null) return;
    const ms = localMs(s);
    rows.push({ ms, date: s.slice(0, 10), h: +s.slice(11, 13), t: v("temperature_2m"), feels: v("apparent_temperature"), rh: v("relative_humidity_2m"), td: v("dew_point_2m"),
      precip: v("precipitation"), pop: v("precipitation_probability"), code: v("weather_code"), cloud: v("cloud_cover"), ws: v("wind_speed_10m"), dir: v("wind_direction_10m"),
      gust: v("wind_gusts_10m"), uv: v("uv_index"), day: v("is_day") == null ? null : v("is_day") === 1 });
  });
  const C = j.current || {};
  const current = C.time ? { ms: localMs(C.time), t: num(C.temperature_2m), feels: num(C.apparent_temperature), rh: num(C.relative_humidity_2m), code: num(C.weather_code),
    ws: num(C.wind_speed_10m), dir: num(C.wind_direction_10m), gust: num(C.wind_gusts_10m), precip: num(C.precipitation), day: C.is_day == null ? null : C.is_day === 1 } : null;
  const D = j.daily || {}; const daily = {};
  (D.time || []).forEach((d, i) => { const v = k => num(D[k] && D[k][i]); daily[d] = { max: v("temperature_2m_max"), min: v("temperature_2m_min"), rain: v("precipitation_sum"), pop: v("precipitation_probability_max"), code: v("weather_code"), wsMax: v("wind_speed_10m_max"), gustMax: v("wind_gusts_10m_max"), uvMax: v("uv_index_max") }; });
  return { rows, current, daily };
}
export function parseModels(j) {
  const D = j.daily || {}; const out = [];
  MODELS.forEach(([id, name]) => {
    const days = {}; let any = false;
    (D.time || []).forEach((d, i) => { const g = k => num(D[`${k}_${id}`] && D[`${k}_${id}`][i]); const v = { max: g("temperature_2m_max"), min: g("temperature_2m_min"), rain: g("precipitation_sum") }; if (v.max != null) any = true; days[d] = v; });
    if (any) out.push({ id, name, days });
  });
  return out;
}
export function parseMet(j) {
  const ts = (j.properties && j.properties.timeseries) || []; const rows = [];
  ts.forEach(e => {
    const d = (e.data && e.data.instant && e.data.instant.details) || {}; const n1 = e.data.next_1_hours, n6 = e.data.next_6_hours;
    const ms = Date.parse(e.time); const ws = num(d.wind_speed); const gust = num(d.wind_speed_of_gust);
    rows.push({ ms, date: sastDate(ms), h: sastHour(ms), step: n1 ? 1 : 6, t: num(d.air_temperature), rh: num(d.relative_humidity), td: num(d.dew_point_temperature),
      ws: ws == null ? null : ws * 3.6, gust: gust == null ? null : gust * 3.6, dir: num(d.wind_from_direction), cloud: num(d.cloud_area_fraction), uv: num(d.ultraviolet_index_clear_sky),
      code: codeOfSymbol((n1 || n6 || {}).summary && (n1 || n6).summary.symbol_code), precip: n1 ? num(n1.details && n1.details.precipitation_amount) : null,
      pop: n1 ? num(n1.details && n1.details.probability_of_precipitation) : null, p6: n6 ? num(n6.details && n6.details.precipitation_amount) : null,
      tmax6: n6 ? num(n6.details && n6.details.air_temperature_max) : null, tmin6: n6 ? num(n6.details && n6.details.air_temperature_min) : null,
      sym: ((n1 || n6 || {}).summary || {}).symbol_code || null });
  });
  const daily = {};
  rows.forEach(r => {
    const D = daily[r.date] || (daily[r.date] = { max: null, min: null, rain: 0, n: 0 });
    D.max = maxOf([D.max, r.t, r.step === 6 ? r.tmax6 : null]); D.min = minOf([D.min, r.t, r.step === 6 ? r.tmin6 : null]);
    D.rain += (r.step === 1 ? r.precip : r.p6) || 0; D.n++;
  });
  Object.values(daily).forEach(D => { D.rain = r1(D.rain); });
  const updated = j.properties && j.properties.meta && j.properties.meta.updated_at;
  return { rows, daily, updated: updated ? Date.parse(updated) : null };
}
export function parseMetar(arr) {
  const obs = (Array.isArray(arr) ? arr : []).map(o => {
    const ms = o.obsTime ? o.obsTime * 1000 : Date.parse(o.reportTime || ""); const t = num(o.temp), td = num(o.dewp);
    return { ms, t, td, rh: r0(rhFrom(t, td)), dir: num(o.wdir), ws: num(o.wspd) == null ? null : o.wspd * 1.852, gust: num(o.wgst) == null ? null : o.wgst * 1.852, raw: o.rawOb || "" };
  }).filter(o => o.ms && o.t != null).sort((a, b) => a.ms - b.ms);
  return { station: "Hoedspruit Air Force Base (FAHS)", distanceKm: 14, obs, latest: obs[obs.length - 1] || null };
}
/* daily station max/min from the hourly METARs */
export function stationDay(metar, date) {
  if (!metar) return null; const o = metar.obs.filter(x => sastDate(x.ms) === date); if (!o.length) return null;
  return { max: maxOf(o.map(x => x.t)), min: minOf(o.map(x => x.t)), n: o.length, last: hm(o[o.length - 1].ms) };
}

/* ---------- sun and moon ---------- */
const OBS = new Astro.Observer(SITE.lat, SITE.lon, SITE.elev);
const tms = t => (t ? t.date.getTime() : null);
const PHASES = [[7, "New moon"], [83, "Waxing crescent"], [97, "First quarter"], [173, "Waxing gibbous"], [187, "Full moon"], [263, "Waning gibbous"], [277, "Last quarter"], [353, "Waning crescent"], [361, "New moon"]];
export function sunMoon(date) {
  const t0 = Astro.MakeTime(new Date(msAt(date, 0)));
  const rise = tms(Astro.SearchRiseSet(Astro.Body.Sun, OBS, +1, t0, 1)), set = tms(Astro.SearchRiseSet(Astro.Body.Sun, OBS, -1, t0, 1));
  const dawn = tms(Astro.SearchAltitude(Astro.Body.Sun, OBS, +1, t0, 1, -6)), dusk = tms(Astro.SearchAltitude(Astro.Body.Sun, OBS, -1, t0, 1, -6));
  const mrise = tms(Astro.SearchRiseSet(Astro.Body.Moon, OBS, +1, t0, 1)), mset = tms(Astro.SearchRiseSet(Astro.Body.Moon, OBS, -1, t0, 1));
  const eve = new Date(msAt(date, 21));
  const pct = Math.round(Astro.Illumination(Astro.Body.Moon, eve).phase_fraction * 100);
  const ang = Astro.MoonPhase(eve);
  return {
    sun: { firstLight: dawn, rise, set, lastLight: dusk, dayLength: rise && set ? Math.round((set - rise) / 60000) : null },
    moon: { rise: mrise && sastDate(mrise) === date ? mrise : null, set: mset && sastDate(mset) === date ? mset : null, pct, phase: PHASES.find(p => ang < p[0])[1], waxing: ang < 180 }
  };
}
/* moon altitude above the horizon, degrees */
export function moonAlt(ms) { const t = Astro.MakeTime(new Date(ms)); const eq = Astro.Equator(Astro.Body.Moon, t, OBS, true, true); return Astro.Horizon(t, OBS, eq.ra, eq.dec, "normal").altitude; }
export function moonEvents(fromMs, n = 4) {
  const names = ["New moon", "First quarter", "Full moon", "Last quarter"]; const out = [];
  let q = Astro.SearchMoonQuarter(Astro.MakeTime(new Date(fromMs)));
  for (let i = 0; i < n; i++) { out.push({ name: names[q.quarter], ms: q.time.date.getTime() }); q = Astro.NextMoonQuarter(q); }
  return out;
}

/* ---------- fire danger: Lowveld FDI (National Fire Danger Rating System, Gazette 37014, 2013) ---------- */
const RCF_MM = [2.6, 5.2, 7.6, 10.2, 12.8, 15.3, 20.5, 25.5, 38.4, 51.1, 63.8, 76.5, 1e9];
const RCF = [[.7, .9, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], [.6, .8, .9, 1, 1, 1, 1, 1, 1, 1, 1, 1], [.5, .7, .9, .9, 1, 1, 1, 1, 1, 1, 1, 1], [.4, .6, .8, .9, .9, 1, 1, 1, 1, 1, 1, 1], [.4, .6, .7, .8, .9, .9, 1, 1, 1, 1, 1, 1], [.3, .5, .7, .8, .8, .9, 1, 1, 1, 1, 1, 1],
  [.2, .5, .6, .7, .8, .8, .9, 1, 1, 1, 1, 1], [.2, .4, .5, .7, .7, .8, .9, 1, 1, 1, 1, 1], [.1, .3, .4, .6, .6, .7, .8, .9, 1, 1, 1, 1], [.1, .2, .4, .5, .5, .6, .7, .8, .9, 1, 1, 1], [.1, .2, .3, .4, .5, .6, .7, .7, .8, .9, 1, 1], [.1, .1, .2, .3, .4, .5, .6, .7, .8, .8, .9, 1], [.1, .1, .1, .2, .4, .5, .6, .6, .7, .8, .9, 1]];
export function rainFactor(mm, days) { if (mm == null || mm < 0.1 || days == null) return 1; const col = days <= 1 ? 0 : days <= 6 ? days - 1 : days <= 8 ? 6 : days <= 10 ? 7 : days <= 12 ? 8 : days <= 15 ? 9 : days <= 20 ? 10 : 11; return RCF[RCF_MM.findIndex(x => mm <= x)][col]; }
export function windAdd(k) { k = Math.round(k || 0); return k <= 2 ? 0 : k <= 8 ? 5 : k <= 16 ? 10 : k <= 25 ? 15 : k <= 32 ? 20 : k <= 36 ? 25 : k <= 41 ? 30 : k <= 45 ? 35 : 40; }
export function fdi(T, RH, windKmh, rf) { if (T == null || RH == null) return null; return Math.max(0, Math.round(((T - 35) - ((35 - T) / 30) + ((100 - RH) * 0.37) + 30 + windAdd(windKmh)) * (rf ?? 1))); }
export const FDI_CLS = [[20, "Low", "blue"], [45, "Moderate", "green"], [60, "Dangerous", "yellow"], [75, "Very dangerous", "orange"], [1e9, "Extremely dangerous", "red"]];
export const fdiClass = v => (v == null ? null : FDI_CLS.find(c => v <= c[0]));

/* ---------- daily metrics from the hourly rows ---------- */
function metrics(rows, date) {
  const r = rows.filter(x => x.date === date); if (!r.length) return null;
  const day = r.filter(x => x.h >= 6 && x.h < 19), aft = r.filter(x => x.h >= 12 && x.h < 18);
  const block = (a, b) => r.filter(x => x.h >= a && x.h < b);
  const dirAft = compass(circMean(aft.filter(x => x.ws >= 5).map(x => x.dir)));
  return {
    tmax: maxOf(r.map(x => x.t)), tmin: minOf(r.map(x => x.t)), rhMin: minOf(day.map(x => x.rh)), wsMax: maxOf(r.map(x => x.ws)), gustMax: maxOf(r.map(x => x.gust)),
    wsAft: aft.length ? sumOf(aft.map(x => x.ws)) / aft.length : null, dirAft, uvMax: maxOf(r.map(x => x.uv)), rain: r1(sumOf(r.map(x => x.precip ?? 0))),
    pop: maxOf(r.map(x => x.pop)), thunder: r.some(x => x.code >= 95 && (x.pop ?? 50) >= 30), cloud: day.length ? Math.round(sumOf(day.map(x => x.cloud ?? 0)) / day.length) : null,
    code: dominant(day.length ? day : r), codes: { night: dominant(block(0, 6)), morning: dominant(block(6, 12)), afternoon: dominant(block(12, 18)), evening: dominant(block(18, 24)) },
    hourly: r.length >= 20, n: r.length
  };
}
function circMean(dirs) { const v = dirs.filter(d => d != null); if (!v.length) return null; const s = sumOf(v.map(d => Math.sin(d * Math.PI / 180))), c = sumOf(v.map(d => Math.cos(d * Math.PI / 180))); return (Math.atan2(s, c) * 180 / Math.PI + 360) % 360; }
/* value at a clock hour, interpolated across 6-hourly gaps */
function at(rows, date, h, k) {
  const ms = msAt(date, h); let a = null, b = null;
  for (const r of rows) { if (r[k] == null) continue; if (r.ms <= ms) a = r; else { b = r; break; } }
  if (a && a.ms === ms) return a[k]; if (a && b && b.ms - a.ms <= 6 * 3600e3) return a[k] + (b[k] - a[k]) * (ms - a.ms) / (b.ms - a.ms); return null;
}
/* first time on a date at or after `fromMs` that `k` crosses `thr` going up (dir=+1) or down (dir=-1) */
function crossing(rows, fromMs, toMs, k, thr, dir) {
  const r = rows.filter(x => x[k] != null && x.ms >= fromMs - 3600e3 && x.ms <= toMs + 3600e3);
  for (let i = 1; i < r.length; i++) {
    const a = r[i - 1], b = r[i]; const hit = dir > 0 ? a[k] < thr && b[k] >= thr : a[k] > thr && b[k] <= thr;
    if (hit) { const ms = a.ms + (b.ms - a.ms) * (thr - a[k]) / (b[k] - a[k]); if (ms >= fromMs && ms <= toMs) return ms; }
  }
  return null;
}
/* a sudden wind change: up 15 km/h or more within 2 hours, with a swing of 45° or more, to at least 20 km/h */
export function windChange(rows, date) {
  const r = rows.filter(x => x.ws != null && x.dir != null);
  for (let i = 0; i < r.length; i++) {
    if (r[i].date !== date) continue;
    for (let k = 1; k <= 2 && i - k >= 0; k++) {
      const a = r[i - k], b = r[i]; if (b.ms - a.ms > 2 * 3600e3) continue;
      const dv = b.ws - a.ws, dd = Math.abs(((b.dir - a.dir + 540) % 360) - 180);
      if (dv >= 15 && dd >= 45 && b.ws >= 20) return { ms: b.ms, from: compass(a.dir), to: compass(b.dir), kmh: r0(b.ws), gust: r0(b.gust), rhFrom: r0(a.rh), rhTo: r0(b.rh), tFrom: r0(a.t), tTo: r0(b.t) };
    }
  }
  return null;
}

/* ---------- rain history for the fire index ---------- */
/* own readings first (gauge or manual), otherwise the model estimate of 1 mm or more; forecast days from the consensus */
export function rainHistory(records, consensus) {
  const map = {};
  (records || []).forEach(d => { const m = d.manual || {}; const own = num(m.rain) ?? num(d.gauge && d.gauge.mm); const v = own ?? num(d.rainEst); if (v != null) map[d.date] = { mm: v, own: own != null }; });
  Object.entries(consensus || {}).forEach(([date, c]) => { if (c && c.rain != null && !(map[date] && map[date].own)) map[date] = { mm: c.rain, own: false, fc: true }; });
  return map;
}
export function lastRain(hist, date) {
  for (let i = 1; i <= 60; i++) { const d = addDays(date, -i); const x = hist[d]; if (x && x.mm >= (x.own ? 0.5 : 1)) return { date: d, mm: x.mm, days: i, own: x.own, fc: !!x.fc }; }
  return null;
}

/* ---------- planning ---------- */
function walkPlan(rows, date, sm, md) {
  const { firstLight, rise } = sm.sun; if (!firstLight || !md) return { text: null };
  const thr = md.tmax >= 33 ? 30 : 32; const cap = rise + 5.5 * 3600e3;
  let end = crossing(rows, firstLight, cap, "t", thr, +1); const capped = !end; if (!end) end = Math.min(cap, msAt(date, 11));
  end = q15(end);
  const morningWet = rows.some(x => x.date === date && x.h >= 5 && x.h < 11 && (x.code >= 95 || ((x.precip ?? 0) >= 0.5 && (x.pop ?? 60) >= 50)));
  const late = at(rows, date, 16, "t"); const lateOk = late != null && late <= 29 && !rows.some(x => x.date === date && x.h >= 15 && x.h < 19 && x.code >= 95);
  let text = `First light ${hm(firstLight)} to ${capped ? "" : "about "}${hm(end)}`;
  if (lateOk) text += `, or from about 16:00 (${r0(late)}°C)`;
  return { text, start: firstLight, end, thr: capped ? null : thr, morningWet };
}
function drivePlan(rows, date, sm, md) {
  const { firstLight, set, lastLight } = sm.sun; if (!set || !md) return { text: null };
  const lo = set - 3 * 3600e3, hi = set - 1.5 * 3600e3;
  let out = md.tmax >= 33 ? crossing(rows, msAt(date, 13), hi, "t", 33, -1) : null;
  if (!out) out = md.tmax >= 35 ? hi : set - 2.5 * 3600e3;
  out = q15(Math.min(hi, Math.max(lo, out)));
  return { text: `Morning from first light (${hm(firstLight)}); afternoon out about ${hm(out)}, sunset ${hm(set)}, dark by ${hm(lastLight)}`, out, set, dark: lastLight };
}
function nightPlan(date, sm) {
  const dark = sm.sun.lastLight; if (!dark) return null; const pct = sm.moon.pct;
  const midnight = msAt(date, 24); const up = moonAlt(dark + 30 * 60000) > 0;
  const nextRise = sm.moon.rise && sm.moon.rise > dark ? sm.moon.rise : null, nextSet = sm.moon.set && sm.moon.set > dark ? sm.moon.set : null;
  if (pct <= 3) return { text: "No moon: a dark night for stars", short: "none", dark: true, pct };
  if (up && nextSet && nextSet < midnight) return { text: `Moon up after dark (${pct}% lit), sets ${hm(nextSet)}`, short: `${pct}%, sets ${hm(nextSet)}`, pct };
  if (up) return { text: `Moon up all evening (${pct}% lit)`, short: `${pct}%, all evening`, pct, bright: pct >= 80 };
  if (nextRise && nextRise < midnight) return { text: `Dark until the moon rises at ${hm(nextRise)} (${pct}% lit)`, short: `${pct}%, rises ${hm(nextRise)}`, pct };
  return { text: `No moon in the evening (${pct}% lit, rises after midnight)`, short: "none till after midnight", dark: true, pct };
}

/* ---------- alerts and field notes ---------- */
function alertsFor(day, rows) {
  const A = []; const md = day.md; if (!md) return A; const lbl = day.label; const T = day.max ?? md.tmax;
  if (day.fdi && day.fdi.value > 60) A.push({ sev: day.fdi.value > 75 ? "red" : "orange", kind: "fire", title: `${day.fdi.cls} fire danger (${day.fdi.value})`, text: `${lbl}: ${day.fdi.value > 75 ? "no burning of any kind; keep the fire unit ready" : "no burning; watch braai fires closely"}.` });
  if (T != null && T >= 35) A.push({ sev: T >= 38 ? "orange" : "yellow", kind: "heat", title: T >= 38 ? `Very hot, ${r0(T)}°C` : `Hot, ${r0(T)}°C`, text: `${lbl}: ${[md.rhMin != null ? `humidity down to ${r0(md.rhMin)}%` : "", md.uvMax >= 3 ? `UV ${r0(md.uvMax)}` : ""].filter(Boolean).join(", ") || "hot afternoon"}. Keep walks to first light.` });
  const wc = day.windChange;
  if (wc) A.push({ sev: "yellow", kind: "wind", title: `Wind change around ${hm(q15(wc.ms))}`, text: `${lbl}: wind swings ${wc.from} to ${wc.to} at ${wc.kmh} km/h${wc.gust ? `, gusting ${wc.gust}` : ""}; humidity jumps from ${wc.rhFrom}% to ${wc.rhTo}%.` });
  else if ((md.gustMax ?? 0) >= 55 || md.wsMax >= 30) A.push({ sev: (md.gustMax ?? 0) >= 70 || md.wsMax >= 45 ? "orange" : "yellow", kind: "wind", title: `Windy, gusts to ${r0(md.gustMax ?? md.wsMax)} km/h`, text: `${lbl}: ${md.dirAft ? windWord(md.dirAft) + " " : ""}wind${md.wsAft >= 20 ? `, about ${r0(md.wsAft)} km/h through the afternoon` : ""}.` });
  const rain = day.rain ?? md.rain;
  if (md.thunder) A.push({ sev: "orange", kind: "storm", title: "Thunderstorms possible", text: `${lbl}: ${rain >= 0.5 ? `about ${r1(rain)} mm forecast` : "isolated storms in the models"}${day.pop != null ? `, ${day.pop}% chance of rain` : ""}.` });
  else if (rain >= 2) A.push({ sev: "blue", kind: "rain", title: `Rain, about ${r1(rain)} mm`, text: `${lbl}: ${["morning", "afternoon", "evening"].filter(k => md.codes[k] != null && wetRank(md.codes[k])).join(" and ") || "on and off"}${day.pop != null ? `, ${day.pop}% chance` : ""}.` });
  else if (rain >= 0.5) A.push({ sev: "blue", kind: "rain", title: "A little rain", text: `${lbl}: up to ${r1(rain)} mm, mostly light.` });
  if ((day.min ?? md.tmin) != null && (day.min ?? md.tmin) <= 8) A.push({ sev: "blue", kind: "cold", title: `Cold night, ${r0(day.min ?? md.tmin)}°C`, text: `${lbl}: blankets and fleeces for the morning drive.` });
  return A.map(a => ({ date: day.date, ...a }));
}
function notesFor(day) {
  const md = day.md; if (!md) return []; const N = []; const T = day.max ?? md.tmax, lo = day.min ?? md.tmin; const w = day.walk, dr = day.drive;
  if (T != null && T >= 38) N.push(["Walks", `Very hot. Walk only from first light and be back by ${w.end ? hm(w.end) : "mid-morning"}. Carry at least 2 litres of water each and rest in the shade from 12:00 to 16:00.`]);
  else if (T != null && T >= 33) N.push(["Walks", `Hot by late morning. Start at first light and keep the walk short: ${w.text}.`]);
  else if (w.text) N.push(["Walks", `Good walking weather. ${w.text}.`]);
  if (w.morningWet) N.push(["Morning rain", "Rain or storms are possible early. Check the sky before setting off and keep rain gear in the vehicle."]);
  if (md.wsAft >= 25) N.push(["Drives", `Windy afternoon (${md.dirAft || ""} ${r0(md.wsAft)} km/h). Game sits tight in the wind, so check sheltered drainage lines and thickets. Dust on the open roads.`]);
  else if (T != null && T >= 35) N.push(["Drives", `Animals stay in the shade until late; waterholes are busiest from mid-afternoon. ${dr.text}.`]);
  else if (dr.text) N.push(["Drives", `${dr.text}.`]);
  const wc = day.windChange; if (wc) N.push(["Wind change", `Around ${hm(q15(wc.ms))} the wind swings ${wc.from} to ${wc.to} and picks up to ${wc.kmh} km/h. Temperature drops from ${wc.tFrom}°C to ${wc.tTo}°C and humidity rises from ${wc.rhFrom}% to ${wc.rhTo}%.`]);
  const f = day.fdi;
  if (f) {
    if (f.value > 75) N.push(["Fire safety", `Extremely dangerous fire weather (index ${f.value}). No burning of any kind. Keep the boma braai small, watched and fully out before bed, have the fire unit filled and ready, and report any smoke to the reserve at once.`]);
    else if (f.value > 60) N.push(["Fire safety", `Very dangerous fire weather (index ${f.value}). No burning; keep the braai in the boma and put it out properly. Check the fire unit is full.`]);
    else if (f.value > 45) N.push(["Fire safety", `Dangerous fire weather (index ${f.value}). No burning in the afternoon; keep braai fires in the boma.`]);
    else N.push(["Fire safety", `${f.cls} fire danger (index ${f.value}). Normal care with braai fires.`]);
  }
  if (md.rhMin != null && md.rhMin < 20) N.push(["Heat & water", `Humidity falls to ${r0(md.rhMin)}% in the afternoon. Dry air hides how much you sweat, so drink before you feel thirsty.`]);
  if (md.uvMax != null && md.uvMax >= 11) N.push(["Sun", `UV peaks at ${r0(md.uvMax)} (extreme) around midday. Hats and SPF 50 on every outing.`]);
  const rain = day.rain ?? md.rain; if (md.thunder || rain >= 2) N.push(["Rain", `${md.thunder ? "Thunderstorms are possible" : "Rain is expected"} (about ${r1(rain)} mm). Clay roads get slippery; keep rain ponchos in the vehicle.`]);
  if (lo != null && lo <= 14) N.push(["Mornings", `Cool start at ${r0(lo)}°C. Blankets and a fleece for the morning drive.`]);
  const n = day.night; if (n) { if (n.bright) N.push(["Night sky", `${n.text}. Good visibility on night drives; fewer stars.`]); else if (n.dark) N.push(["Night sky", `${n.text}. Spotlights needed on night drives.`]); else N.push(["Night sky", `${n.text}.`]); }
  return N;
}
function daySentence(day) {
  const md = day.md; if (!md) return ""; const T = day.max ?? md.tmax; const rain = day.rain ?? md.rain;
  const feel = T >= 38 ? "Very hot" : T >= 33 ? "Hot" : T >= 27 ? "Warm" : T >= 20 ? "Mild" : "Cool";
  const wet = md.thunder ? " with thunderstorms possible" : rain >= 2 ? ` with rain, about ${r1(rain)} mm` : rain >= 0.5 ? " with a little rain" : " and dry";
  let s = `${feel}${wet}, up to ${r0(T)}°C`; if (md.rhMin != null && md.rhMin < 25) s += ` with humidity down to ${r0(md.rhMin)}%`; s += ".";
  if (day.fdi && day.fdi.value > 45) s += ` ${day.fdi.cls} fire danger (${day.fdi.value}).`;
  if (day.windChange) s += ` A ${windWord(day.windChange.to)} change arrives around ${hm(q15(day.windChange.ms))}.`;
  else if (md.wsAft >= 25) s += ` Windy in the afternoon.`;
  return s;
}

/* ---------- assemble everything ---------- */
export function assemble({ om, met, models, metar, records }, nowMs = Date.now()) {
  const today = sastDate(nowMs);
  const rows = (om && om.rows.length ? om.rows : met ? met.rows.map(r => ({ ...r, precip: r.step === 1 ? r.precip : r.p6 != null ? r.p6 / 6 : null, feels: null, day: null })) : []).slice().sort((a, b) => a.ms - b.ms);
  const dates = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  /* consensus of the daily forecasts: MET Norway plus each model (Open-Meteo's own blend only if the models are missing) */
  const srcs = []; if (met) srcs.push({ id: "met", name: "yr.no (MET Norway)", days: met.daily });
  (models || []).forEach(m => srcs.push(m)); if (srcs.length < 2 && om) srcs.push({ id: "om", name: "Open-Meteo blend", days: om.daily });
  const consensus = {};
  dates.forEach(d => {
    const mx = srcs.map(s => s.days[d] && s.days[d].max), mn = srcs.map(s => s.days[d] && s.days[d].min), rn = srcs.map(s => s.days[d] && s.days[d].rain);
    consensus[d] = { max: r0(median(mx)), min: r0(median(mn)), rain: r1(median(rn)), maxLo: r0(minOf(mx)), maxHi: r0(maxOf(mx)), minLo: r0(minOf(mn)), minHi: r0(maxOf(mn)), rainHi: r1(maxOf(rn)), n: mx.filter(x => x != null).length };
  });
  const hist = rainHistory(records, consensus);
  const days = dates.map((date, i) => {
    const md = metrics(rows, date); const c = consensus[date]; const sm = sunMoon(date);
    const omd = om && om.daily[date];
    const day = { date, weekday: weekday(date), label: i === 0 ? "Today" : i === 1 ? "Tomorrow" : weekday(date), md,
      max: c.max ?? r0(md && md.tmax), min: c.min ?? r0(md && md.tmin), maxRange: c.n > 1 ? [c.maxLo, c.maxHi] : null, minRange: c.n > 1 ? [c.minLo, c.minHi] : null,
      rain: c.rain ?? (md && md.rain), rainHi: c.rainHi, pop: omd && omd.pop != null ? omd.pop : md && md.pop, sources: c.n,
      code: md ? md.code : omd && omd.code, sun: sm.sun, moon: sm.moon };
    day.cond = condOf(day.code);
    /* fire danger at 14:00, the standard observation time */
    const T = at(rows, date, 14, "t"), RH = at(rows, date, 14, "rh"), W = at(rows, date, 14, "ws");
    const lr = lastRain(hist, date); const rf = lr ? rainFactor(lr.mm, lr.days) : 1; const v = fdi(T, RH, W, rf);
    if (v != null) { const cl = fdiClass(v); day.fdi = { value: v, cls: cl[1], color: cl[2], t: r1(T), rh: r0(RH), ws: r0(W), rf, lastRain: lr }; }
    day.walk = walkPlan(rows, date, sm, md); day.drive = drivePlan(rows, date, sm, md); day.night = nightPlan(date, sm);
    day.windChange = windChange(rows, date);
    day.alerts = alertsFor(day, rows); day.notes = notesFor(day); day.summary = daySentence(day);
    day.hours = rows.filter(r => r.date === date).map(r => hourOut(r, rf));
    delete day.md; day.m = md ? { rhMin: r0(md.rhMin), wsMax: r0(md.wsMax), gustMax: r0(md.gustMax), wsAft: r0(md.wsAft), dirAft: md.dirAft, uvMax: r1(md.uvMax), cloud: md.cloud, thunder: md.thunder, codes: md.codes, hourly: md.hourly } : null;
    return day;
  });
  const cur = om && om.current; const nowRow = rows.filter(r => r.ms <= nowMs).pop() || rows[0] || null; const n = cur || nowRow || {};
  const st = metar && metar.latest && nowMs - metar.latest.ms < 3 * 3600e3 ? metar.latest : null;
  const hours = rows.filter(r => r.ms >= msAt(today, sastHour(nowMs)) && r.ms < nowMs + 48 * 3600e3).map(r => hourOut(r, null));
  const out = {
    generatedAt: new Date(nowMs).toISOString(), today, site: SITE,
    now: { ms: n.ms ?? nowMs, t: r1(n.t), feels: r1(n.feels), rh: r0(n.rh), ws: r0(n.ws), gust: r0(n.gust), dir: compass(n.dir), code: n.code ?? null, cond: condOf(n.code), day: n.day ?? (sastHour(nowMs) >= 6 && sastHour(nowMs) < 18), source: cur ? "Open-Meteo" : "yr.no",
      station: st ? { name: "Hoedspruit (FAHS)", t: st.t, rh: st.rh, ws: r0(st.ws), dir: compass(st.dir), at: hm(st.ms), raw: st.raw } : null },
    days, hours, alerts: days.flatMap(d => d.alerts),
    week: weekLine(days),
    models: { sources: srcs.map(s => ({ id: s.id, name: s.name })), table: Object.fromEntries(dates.map(d => [d, Object.fromEntries(srcs.map(s => [s.id, s.days[d] ? { max: r0(s.days[d].max), min: r0(s.days[d].min), rain: r1(s.days[d].rain) } : null]))])), consensus },
    moonEvents: moonEvents(nowMs - 864e5, 4).map(e => ({ ...e, date: sastDate(e.ms), time: hm(e.ms) })),
    sources: [
      { name: "Open-Meteo", ok: !!(om && om.rows.length), use: "Hourly forecast, current conditions, model comparison", url: "https://open-meteo.com" },
      { name: "MET Norway (yr.no)", ok: !!met, use: "Daily forecast in the consensus; hourly backup", url: "https://www.yr.no", updated: met && met.updated ? new Date(met.updated).toISOString() : null },
      { name: "Hoedspruit Air Force Base weather station (FAHS)", ok: !!(metar && metar.latest), use: "Live observed temperature, humidity and wind, about 14 km away", url: "https://aviationweather.gov" },
      { name: "Lowveld Fire Danger Index", ok: true, use: "National Fire Danger Rating System method, worked out from the 14:00 forecast and the rain record" },
      { name: "Sun and moon", ok: true, use: "Calculated for Nomvula's coordinates (Astronomy Engine)" }
    ],
    warningsUrl: "https://www.weathersa.co.za/home/warnings"
  };
  out.summary = days[0] ? days[0].summary : "";
  return out;
}
function hourOut(r, rf) {
  const o = { ms: r.ms, date: r.date, h: r.h, t: r1(r.t), feels: r1(r.feels), rh: r0(r.rh), td: r1(r.td), ws: r0(r.ws), gust: r0(r.gust), dir: compass(r.dir), deg: r0(r.dir), cloud: r0(r.cloud), uv: r1(r.uv), precip: r1(r.precip), pop: r0(r.pop), code: r.code, cond: condOf(r.code), day: r.day ?? (r.h >= 6 && r.h < 18) };
  if (rf != null && r.h >= 9 && r.h <= 18) o.fdi = fdi(r.t, r.rh, r.ws, rf);
  return o;
}
const andList = a => (a.length < 2 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1]);
function weekLine(days) {
  const d = days.filter(x => x.max != null); if (!d.length) return "";
  const hot = d.reduce((a, x) => (x.max > a.max ? x : a)), cool = d.reduce((a, x) => (x.max < a.max ? x : a));
  const wet = d.filter(x => (x.rain ?? 0) >= 1); const red = d.filter(x => x.fdi && x.fdi.value > 75);
  let s = `Hottest ${hot.label === "Today" || hot.label === "Tomorrow" ? hot.label.toLowerCase() : hot.weekday} at ${hot.max}°C, coolest ${cool.label === "Today" || cool.label === "Tomorrow" ? cool.label.toLowerCase() : cool.weekday} at ${cool.max}°C. `;
  s += wet.length ? `Rain likely ${andList(wet.map(x => (x.label === "Today" ? "today" : x.label === "Tomorrow" ? "tomorrow" : "on " + x.weekday)))}.` : "Little or no rain in sight.";
  if (red.length) s += ` Extremely dangerous fire danger ${andList(red.map(x => (x.label === "Today" ? "today" : x.label === "Tomorrow" ? "tomorrow" : "on " + x.weekday)))}.`;
  return s;
}
