/* Nomvula Weather — the page. Reads /api/forecast and /api/records. */
(function () {
"use strict";
const $ = s => document.querySelector(s);
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], DAYL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], MONL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nnum = v => { const n = typeof v === "number" ? v : parseFloat(v); return isFinite(n) ? n : null; };
const kmh = ms => (ms == null || isNaN(ms) ? null : Math.round(ms * 3.6));
const r0 = v => (v == null ? "–" : Math.round(v));
const f1 = v => (v == null ? "–" : (Math.round(v * 10) / 10).toFixed(1).replace(/\.0$/, ""));
/* South Africa is UTC+2 all year */
const OFF = 2 * 3600e3;
const sastDate = ms => new Date(ms + OFF).toISOString().slice(0, 10);
const hm = ms => (ms == null ? "–" : new Date(Math.round(ms / 6e4) * 6e4 + OFF).toISOString().slice(11, 16));
const today = () => sastDate(Date.now());
const addDays = (iso, n) => sastDate(Date.parse(iso + "T10:00:00Z") + n * 864e5);
const dow = iso => new Date(iso + "T12:00:00Z").getUTCDay();
const shortDate = iso => `${DAYS[dow(iso)]} ${+iso.slice(8)} ${MON[+iso.slice(5, 7) - 1]}`;
const label = iso => (iso === today() ? "Today" : iso === addDays(today(), 1) ? "Tomorrow" : DAYL[dow(iso)]);
function lsGet(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
function ago(iso) { const m = Math.round((Date.now() - Date.parse(iso)) / 60000); if (isNaN(m)) return ""; if (m < 1) return "just now"; if (m < 60) return m + " min ago"; const h = Math.floor(m / 60); return h < 48 ? h + " h ago" : Math.round(h / 24) + " days ago"; }
function toast(m) { let t = document.querySelector(".rtoast"); if (!t) { t = document.createElement("div"); t.className = "rtoast"; t.setAttribute("role", "status"); document.body.appendChild(t); } t.textContent = m; t.hidden = false; clearTimeout(t._t); t._t = setTimeout(() => (t.hidden = true), 2800); }
const WMO = { 0: "Clear sky", 1: "Fair", 2: "Partly cloudy", 3: "Cloudy", 45: "Fog", 48: "Fog", 51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle", 61: "Light rain", 63: "Rain", 65: "Heavy rain", 80: "Light rain showers", 81: "Rain showers", 82: "Heavy rain showers", 95: "Thunderstorms", 96: "Thunderstorms with hail", 99: "Thunderstorms with hail" };
const condOf = c => (c == null ? "" : WMO[c] || "Cloudy");

/* ---------- icons ---------- */
function kind(cond) { const c = String(cond || "").toLowerCase();
  if (/thunder/.test(c)) return "storm"; if (/heavy rain|^rain$|^rain\b(?! showers)/.test(c)) return "rain";
  if (/rain|shower|drizzle/.test(c)) return "shower"; if (/fog|mist/.test(c)) return "fog";
  if (/partly/.test(c)) return "partly"; if (/cloud|overcast/.test(c)) return "cloud"; if (/fair/.test(c)) return "fair"; if (/clear|sun/.test(c)) return "clear"; return "partly"; }
const CL = '<path class="icon-cloud" d="M30 74h44a14 14 0 0 0 0-28 20 20 0 0 0-38-4 15 15 0 0 0-6 32z"/>';
const CL2 = '<path class="icon-cloud2" d="M48 60h30a10 10 0 0 0 0-20 14 14 0 0 0-27-3 11 11 0 0 0-3 23z"/>';
function sunG(cx, cy, r) { let rays = ""; for (let k = 0; k < 10; k++) { const a = k * Math.PI / 5; rays += `<line x1="${cx + Math.cos(a) * (r + 5)}" y1="${cy + Math.sin(a) * (r + 5)}" x2="${cx + Math.cos(a) * (r + 12)}" y2="${cy + Math.sin(a) * (r + 12)}"/>`; }
  return `<g class="icon-ray" stroke-width="4" stroke-linecap="round">${rays}</g><circle class="icon-sun" cx="${cx}" cy="${cy}" r="${r}"/><circle class="icon-sunc" cx="${cx - r * .25}" cy="${cy - r * .25}" r="${r * .5}"/>`; }
const moonG = (cx, cy, r) => `<path class="icon-moon" d="M${cx + r * .35} ${cy - r} a${r} ${r} 0 1 0 ${r * .65} ${r * 1.55} a${r * .8} ${r * .8} 0 0 1 -${r * .65} -${r * 1.55}z"/>`;
function icon(cond, night, cls = "") { const k = kind(cond); let g = ""; const body = (x, y, r) => (night ? moonG(x, y, r) : sunG(x, y, r));
  const up = 'transform="translate(0,-8)" d="M30 74';
  if (k === "clear") g = body(50, 50, 18);
  else if (k === "fair") g = body(44, 44, 16) + '<path class="icon-cloud" d="M52 78h26a9 9 0 0 0 0-18 13 13 0 0 0-25-2 9 9 0 0 0-1 20z"/>';
  else if (k === "partly") g = body(38, 36, 14) + CL;
  else if (k === "cloud") g = CL2.replace('d="M48', 'transform="translate(-14,-14)" d="M48') + CL;
  else if (k === "shower" || k === "rain") { const n = k === "rain" ? 4 : 3; g = (k === "shower" && !night ? sunG(36, 30, 11) : "") + CL.replace('d="M30 74', up); for (let i = 0; i < n; i++) { const x = 34 + i * (k === "rain" ? 11 : 14); g += `<line class="icon-drop" x1="${x}" y1="74" x2="${x - 4}" y2="86" stroke-width="4" stroke-linecap="round"/>`; } }
  else if (k === "storm") g = CL.replace('d="M30 74', up) + '<path class="icon-bolt" d="M52 66l-10 16h8l-4 12 14-18h-8l4-10z"/>';
  else g = CL + '<g class="icon-drop" stroke-width="3" stroke-linecap="round"><line x1="24" y1="84" x2="76" y2="84"/><line x1="30" y1="91" x2="70" y2="91"/></g>';
  return `<svg class="${cls}" viewBox="0 0 100 100" aria-hidden="true">${g}</svg>`; }
const fdiChip = (f, sm) => (f ? `<span class="fdi ${f.color} ${sm ? "sm" : ""}" title="Lowveld fire danger index"><b class="num">${f.value}</b>${sm ? "" : " " + esc(f.cls)}</span>` : "");
const SEVG = { red: "!", orange: "!", yellow: "!", blue: "i" };
const alertHTML = a => `<div class="al ${a.sev}"><span class="g" aria-hidden="true">${SEVG[a.sev] || "!"}</span><b>${esc(a.title)}</b><span>${esc(a.text)}</span></div>`;

/* ---------- forecast data ---------- */
let FC = null, offline = false, DSEL = null;
function days() { const t = today(); return FC ? FC.days.filter(d => d.date >= t) : []; }
async function loadForecast(force) {
  try {
    const r = await fetch("/api/forecast" + (force ? "?fresh" : ""), { cache: "no-store" });
    const j = await r.json(); if (!r.ok || j.error && !j.days) throw new Error(j.error || r.status);
    FC = j; offline = false; lsSet("wx.fc", j);
  } catch (e) { offline = true; if (!FC) FC = lsGet("wx.fc", null); }
  renderAll();
}
function renderAll() { if (!FC) { $("#fc").innerHTML = `<div class="card skel"><h2 style="justify-content:center">Forecast on its way</h2><p style="margin:10px 0 0">The weather services didn't answer and there's no saved forecast on this phone yet. Check your signal and pull down to refresh.</p></div>`; $("#dt").innerHTML = ""; return; }
  renderForecast(); renderDetail(); footerLine(); }
function staleNote() {
  const age = (Date.now() - Date.parse(FC.generatedAt)) / 60000;
  if (offline) return `<div class="notice"><b>Offline.</b> Showing the forecast saved ${ago(FC.generatedAt)}.</div>`;
  if (FC.stale || age > 180) return `<div class="notice"><b>This forecast is ${ago(FC.generatedAt)}.</b> The weather services didn't answer the last refresh; it will try again shortly.</div>`;
  return "";
}

/* ---------- Forecast tab ---------- */
function renderForecast() {
  const D = days(), n = FC.now || {}, t0 = D[0] && D[0].date === today() ? D[0] : null;
  const al = D.slice(0, 2).flatMap(d => d.alerts || []);
  $("#fc").innerHTML = `${staleNote()}
  <section class="sec" aria-labelledby="hNow"><h2 id="hNow">Right now <small class="stamp"><span class="dotlive ${offline || FC.stale ? "stale" : ""}"></span>Updated <span id="ago">${ago(FC.generatedAt)}</span></small></h2>
    <div class="card now">${icon(n.cond, n.day === false, "ic")}<div><div class="temp num">${r0(n.t)}<sup>°C</sup></div><div class="cond">${esc(n.cond || "")}</div></div>
      <div class="facts"><div class="fact"><span class="k">Feels like</span><span class="v num">${r0(n.feels ?? n.t)}°</span></div>
      <div class="fact"><span class="k">Wind</span><span class="v num">${r0(n.ws)} <small>km/h ${esc(n.dir || "")}${n.gust ? `, gusts ${n.gust}` : ""}</small></span></div>
      <div class="fact"><span class="k">Humidity</span><span class="v num">${r0(n.rh)}<small>%</small></span></div>
      <div class="fact"><span class="k">Today</span><span class="v num">${t0 ? `${t0.max}° <small>/ ${t0.min}°</small>` : "–"}</span></div></div>
      ${n.station ? `<div class="stn">Hoedspruit weather station (14 km): <b>${r0(n.station.t)}°C</b>, ${r0(n.station.rh)}% humidity, wind ${r0(n.station.ws)} km/h ${esc(n.station.dir || "")} at ${esc(n.station.at)}</div>` : ""}</div>
    ${t0 && t0.summary ? `<p class="summary">${esc(t0.summary)}</p>` : ""}
  </section>
  ${al.length ? `<section class="sec" aria-labelledby="hAl"><h2 id="hAl">Heads up</h2><div class="alerts">${al.map(alertHTML).join("")}</div>
    <div class="warnlink"><span>Official warnings come from the South African Weather Service.</span><a href="${esc(FC.warningsUrl)}" target="_blank" rel="noopener">SAWS warnings ›</a></div></section>` : ""}
  ${hoursStrip()}
  ${D.length ? `<section class="sec" aria-labelledby="hWeek"><h2 id="hWeek">The week ahead <small>${esc(FC.week || "")}</small></h2><div class="days">${D.map(dayCard).join("")}</div></section>
  <section class="sec" aria-labelledby="hArc"><h2 id="hArc">The temperature arc <small>daytime highs and overnight lows, °C</small></h2><div class="card chartbox" id="arc"></div></section>
  <section class="sec" aria-labelledby="hSun"><h2 id="hSun">Sun &amp; moon</h2><div class="suns">${D.map(d => `<div><b>${label(d.date) === "Today" ? "Today" : DAYS[dow(d.date)]}</b><span class="num"><i style="background:var(--amber)"></i>${hm(d.sun.rise)}</span><span class="num"><i style="background:var(--crimson)"></i>${hm(d.sun.set)}</span><span class="num"><i style="background:#E7D7A8"></i>${d.moon.pct}%</span></div>`).join("")}</div>
    <p class="note2">Sunrise <i style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--amber)"></i> · sunset <i style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--crimson)"></i> · moon lit <i style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#E7D7A8"></i>. First and last light, moonrise and moonset are on the Detail tab.</p></section>
  <section class="sec" aria-labelledby="hPack"><h2 id="hPack">Pack for the bush</h2><div class="tips">${tips(D).map(([b, s]) => `<div class="tip"><b>${esc(b)}</b><span>${esc(s)}</span></div>`).join("")}</div>
    <div class="lily">Keep an eye out for the impala lilies, which flower from late winter into spring.</div></section>` : ""}`;
  arcChart($("#arc"), D);
  document.querySelectorAll("#fc .day[data-day]").forEach(b => b.addEventListener("click", () => { DSEL = b.dataset.day; setTab("dt"); }));
}
function hoursStrip() {
  if (!FC.hours || !FC.hours.length) return "";
  const now = Date.now(); const hrs = FC.hours.filter(h => h.ms > now - 3600e3).slice(0, 24); if (!hrs.length) return "";
  const ev = []; days().forEach(d => { if (d.sun.rise) ev.push({ ms: d.sun.rise, k: "Sunrise" }); if (d.sun.set) ev.push({ ms: d.sun.set, k: "Sunset" }); });
  let html = ""; hrs.forEach((h, i) => {
    ev.filter(e => e.ms > (i ? hrs[i - 1].ms : now) && e.ms <= h.ms).forEach(e => { html += `<div class="hr sun"><span class="h">${e.k}</span>${icon("clear", false)}<span class="tp num">${hm(e.ms)}</span><span class="rn"></span><span class="wd">&nbsp;</span></div>`; });
    html += `<div class="hr"><span class="h num">${h.date === today() ? String(h.h).padStart(2, "0") + ":00" : DAYS[dow(h.date)] + " " + String(h.h).padStart(2, "0")}</span>${icon(h.cond, !h.day)}<span class="tp num">${r0(h.t)}°</span><span class="rn num">${h.precip >= 0.1 ? f1(h.precip) + " mm" : h.pop >= 30 ? h.pop + "%" : ""}</span><span class="wd num">${r0(h.ws)} km/h</span></div>`;
  });
  const t0 = days()[0];
  return `<section class="sec" aria-labelledby="hHours"><h2 id="hHours">Next 24 hours ${t0 ? `<small>first light ${hm(t0.sun.firstLight)} · sunset ${hm(t0.sun.set)}</small>` : ""}</h2><div class="hours">${html}</div></section>`;
}
function dayCard(d) {
  const c = d.m && d.m.codes || {}; const wet = (d.rain ?? 0) >= 0.5;
  return `<div class="day" data-day="${d.date}" role="button" tabindex="0" aria-label="${esc(label(d.date))}: details" style="cursor:pointer"><div class="band"><span class="dn">${label(d.date) === "Today" ? "Today" : DAYS[dow(d.date)].toUpperCase()}</span><span class="dd">${+d.date.slice(8)} ${MON[+d.date.slice(5, 7) - 1]}</span></div>
    <div class="body">${icon(d.cond, false, "big")}<div class="mid"><span class="cd">${esc(d.cond)}</span><span class="slots" title="Morning, afternoon, evening">${["morning", "afternoon", "evening"].map((k, i) => (c[k] != null ? icon(condOf(c[k]), i === 2) : "")).join("")}</span></div>
    <span class="rule"></span><div class="temps"><span class="hi num">${d.max ?? "–"}°</span>${d.maxRange && d.maxRange[0] !== d.maxRange[1] ? `<span class="rg num">${d.maxRange[0]}–${d.maxRange[1]}°</span>` : ""}<span class="lo num">${d.min ?? "–"}°</span></div>
    <span class="rule"></span><div class="meta" style="flex-direction:column;align-items:center;gap:2px"><span class="mt num ${wet ? "wet" : ""}" title="Rain">${f1(d.rain ?? 0)} mm${d.pop != null && d.pop >= 20 ? ` · ${d.pop}%` : ""}</span><span class="mt num" title="Strongest wind">${r0(d.m && d.m.wsMax)} km/h</span><span class="fr">${fdiChip(d.fdi, true)}</span></div></div></div>`;
}
function tips(D) {
  const w = D.slice(0, 7); if (!w.length) return []; const T = [];
  const maxHi = Math.max(...w.map(d => d.max ?? -99)), minLo = Math.min(...w.map(d => d.min ?? 99));
  const wet = w.filter(d => (d.rain || 0) >= 0.5 || (d.m && d.m.thunder)); const windy = w.filter(d => d.m && d.m.wsMax >= 30);
  T.push(["Layers for early drives", `Mornings start around ${minLo}–${minLo + 3} °C and the open vehicle feels cooler. A light fleece is welcome.`]);
  if (maxHi >= 30) T.push(["Hat, sunscreen & water", `Afternoons reach ${maxHi} °C. Bring a wide-brimmed hat, SPF 50 and a full water bottle on walks.`]);
  else T.push(["Hat & sunscreen", "The sun is strong in the Lowveld even on milder days. Pack a hat and SPF 50."]);
  if (wet.length) T.push(["A light rain jacket", `Showers or storms are possible on ${wet.map(d => label(d.date)).join(", ")}. Keep a light jacket in the vehicle.`]);
  else T.push(["Dry week ahead", "Little or no rain is forecast. Dust gets up on the roads, so sunglasses help."]);
  T.push(["Repellent", windy.length ? `Breezy on ${windy.map(d => DAYS[dow(d.date)]).join(", ")}; calmer evenings bring mosquitoes, so pack repellent.` : "Evenings by the river bring mosquitoes. Pack a good repellent."]);
  return T;
}

/* ---------- charts ---------- */
function tipBox(box) { let t = box.querySelector(".tt"); if (!t) { t = document.createElement("div"); t.className = "tt"; t.hidden = true; box.appendChild(t); } return t; }
/* rows: [label, value, colour, dashed] — built with textContent (labels are data) */
function fillTip(t, head, rows) {
  t.textContent = ""; const h = document.createElement("div"); h.className = "h"; h.textContent = head; t.appendChild(h);
  rows.forEach(([k, v, col, dash]) => { const r = document.createElement("div"); r.className = "r"; const i = document.createElement("i"); i.style.borderTopColor = col || "transparent"; if (dash) i.style.borderTopStyle = "dashed"; const b = document.createElement("b"); b.textContent = v; const s = document.createElement("span"); s.textContent = k; r.append(i, b, s); t.appendChild(r); });
}
function placeTip(box, t, x, y) { t.hidden = false; const bw = box.clientWidth, tw = t.offsetWidth; let left = x + 14; if (left + tw > bw - 4) left = x - tw - 14; t.style.left = Math.max(4, left) + "px"; t.style.top = Math.max(4, y - 10) + "px"; }
function smooth(p) { let s = `M${p[0][0]},${p[0][1]}`; for (let i = 0; i < p.length - 1; i++) { const a = p[Math.max(i - 1, 0)], b = p[i], c = p[i + 1], d = p[Math.min(i + 2, p.length - 1)]; s += ` C${b[0] + (c[0] - a[0]) / 6},${b[1] + (c[1] - a[1]) / 6} ${c[0] - (d[0] - b[0]) / 6},${c[1] - (d[1] - b[1]) / 6} ${c[0]},${c[1]}`; } return s; }
function arcChart(box, D) {
  if (!box) return; const w = D.filter(d => d.max != null && d.min != null).slice(0, 7); if (w.length < 2) { box.hidden = true; return; }
  const W = Math.max(320, Math.min(860, box.clientWidth - 12)), H = W < 520 ? 230 : 210, L = 34, R = 14, T = 26, B = 32;
  const vals = w.flatMap(d => [d.max, d.min]); const lo = Math.floor((Math.min(...vals) - 2) / 2) * 2, hi = Math.ceil((Math.max(...vals) + 2) / 2) * 2;
  const x = i => L + (W - L - R) * (i + .5) / w.length, y = v => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
  let g = ""; const step = hi - lo > 12 ? 4 : 2;
  for (let v = lo; v <= hi; v += step) g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--grid)"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${v}</text>`;
  g += `<path d="${smooth(w.map((d, i) => [x(i), y(d.max)]))}" fill="none" stroke="var(--c-hi)" stroke-width="2"/><path d="${smooth(w.map((d, i) => [x(i), y(d.min)]))}" fill="none" stroke="var(--c-lo)" stroke-width="2"/>`;
  w.forEach((d, i) => {
    g += `<circle cx="${x(i)}" cy="${y(d.max)}" r="4.5" fill="var(--card)" stroke="var(--c-hi)" stroke-width="2"/><text x="${x(i)}" y="${y(d.max) - 10}" text-anchor="middle" font-size="12.5" font-weight="700" fill="var(--ink)">${d.max}°</text>
    <circle cx="${x(i)}" cy="${y(d.min)}" r="4.5" fill="var(--card)" stroke="var(--c-lo)" stroke-width="2"/><text x="${x(i)}" y="${y(d.min) + 20}" text-anchor="middle" font-size="12.5" font-weight="700" fill="var(--ink)">${d.min}°</text>
    <text x="${x(i)}" y="${H - 8}" text-anchor="middle" font-size="12" fill="var(--body)">${label(d.date) === "Today" ? "Today" : DAYS[dow(d.date)]}</text>
    <rect class="hit" data-i="${i}" x="${x(i) - (W - L - R) / w.length / 2}" y="${T - 10}" width="${(W - L - R) / w.length}" height="${H - T - B + 20}" fill="transparent" tabindex="0" aria-label="${esc(label(d.date))}: high ${d.max}, low ${d.min}"/>`;
  });
  box.innerHTML = `<div class="legend"><span><i style="border-top-color:var(--c-hi)"></i>High</span><span><i style="border-top-color:var(--c-lo)"></i>Low</span></div><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Daily highs and lows for the week">${g}</svg>`;
  const t = tipBox(box);
  box.querySelectorAll(".hit").forEach(r => { const show = () => { const d = w[+r.dataset.i]; fillTip(t, `${label(d.date)} ${+d.date.slice(8)} ${MON[+d.date.slice(5, 7) - 1]}`, [["High" + (d.maxRange ? ` (models ${d.maxRange[0]}–${d.maxRange[1]})` : ""), d.max + "°C", "var(--c-hi)"], ["Low", d.min + "°C", "var(--c-lo)"], ["Rain", f1(d.rain ?? 0) + " mm", null]]); const bb = r.getBoundingClientRect(), bx = box.getBoundingClientRect(); placeTip(box, t, bb.left - bx.left + bb.width / 2, 40); };
    r.addEventListener("pointerenter", show); r.addEventListener("focus", show); r.addEventListener("pointerleave", () => (t.hidden = true)); r.addEventListener("blur", () => (t.hidden = true)); });
}
/* three panels (temperature, humidity, wind) sharing one time axis and one crosshair: never two scales on one axis */
function dayChart(box, d) {
  const hrs = (d.hours || []).filter(h => h.t != null); if (hrs.length < 4) { box.innerHTML = `<p class="note2" style="padding:8px">Hourly detail isn't available this far ahead.</p>`; return; }
  const W = Math.max(320, Math.min(860, box.clientWidth - 12)), L = 36, R = 12, PH = 96, GAP = 30, T = 22, B = 26;
  const H = T + PH * 3 + GAP * 2 + B; const t0 = Date.parse(d.date + "T00:00:00+02:00"), t1 = t0 + 864e5;
  const x = ms => L + (W - L - R) * (ms - t0) / (t1 - t0);
  const panels = [
    { k: "Temperature °C", s: [["t", "var(--c-hi)", "Temperature"], ["feels", "var(--c-hi)", "Feels like", true]] },
    { k: "Humidity %", s: [["rh", "var(--c-lo)", "Humidity"]], lo: 0, hi: 100 },
    { k: "Wind km/h", s: [["ws", "var(--c-wind)", "Wind"], ["gust", "var(--c-wind)", "Gusts", true]], lo: 0 }
  ];
  let g = "";
  /* night shading */
  const shade = (a, b, top, h) => (b > a ? `<rect x="${x(a)}" y="${top}" width="${x(b) - x(a)}" height="${h}" fill="var(--sand)"/>` : "");
  panels.forEach((p, pi) => {
    const top = T + pi * (PH + GAP); const v = hrs.flatMap(h => p.s.map(s => h[s[0]])).filter(z => z != null);
    let lo = p.lo ?? Math.floor((Math.min(...v) - 1) / 5) * 5, hi = p.hi ?? Math.max(lo + 10, Math.ceil((Math.max(...v) + 1) / 5) * 5);
    const y = z => top + PH * (1 - (z - lo) / (hi - lo)); p.y = y; p.top = top;
    if (d.sun.rise) g += shade(t0, d.sun.rise, top, PH); if (d.sun.set) g += shade(d.sun.set, t1, top, PH);
    const st = (hi - lo) / 2; [lo, lo + st, hi].forEach(z => { g += `<line x1="${L}" x2="${W - R}" y1="${y(z)}" y2="${y(z)}" stroke="var(--grid)"/><text x="${L - 5}" y="${y(z) + 4}" text-anchor="end" font-size="10.5" fill="var(--muted)">${Math.round(z)}</text>`; });
    g += `<text x="${L}" y="${top - 7}" font-size="11.5" font-weight="700" fill="var(--ink)">${p.k}</text>`;
    p.s.forEach(([k, col, , dash]) => { const pts = hrs.filter(h => h[k] != null).map(h => [x(h.ms), y(h[k])]); if (pts.length > 1) g += `<path d="${smooth(pts)}" fill="none" stroke="${col}" stroke-width="2" ${dash ? 'stroke-dasharray="4 4" opacity=".75"' : ""}/>`; });
  });
  for (let h = 0; h <= 24; h += 3) g += `<text x="${x(t0 + h * 3600e3)}" y="${H - 8}" text-anchor="middle" font-size="10.5" fill="var(--muted)">${String(h % 24).padStart(2, "0")}</text>`;
  if (sastDate(Date.now()) === d.date) g += `<line x1="${x(Date.now())}" x2="${x(Date.now())}" y1="${T - 4}" y2="${H - B}" stroke="var(--pink)" stroke-width="1.5"/>`;
  g += `<line class="xh" x1="0" x2="0" y1="${T - 4}" y2="${H - B}" stroke="var(--ink)" stroke-width="1" opacity="0"/>`;
  panels.forEach(p => p.s.forEach(([k, col], si) => { g += `<circle class="dot p${k}" r="4" fill="var(--card)" stroke="${col}" stroke-width="2" opacity="0"/>`; }));
  g += `<rect class="ov" x="${L}" y="${T - 4}" width="${W - L - R}" height="${H - T - B + 4}" fill="transparent" tabindex="0" aria-label="Hour by hour chart; use left and right arrows"/>`;
  box.innerHTML = `<div class="legend"><span><i style="border-top-color:var(--c-hi)"></i>Temperature</span><span><i class="dash" style="border-top-color:var(--c-hi)"></i>Feels like</span><span><i style="border-top-color:var(--c-lo)"></i>Humidity</span><span><i style="border-top-color:var(--c-wind)"></i>Wind</span><span><i class="dash" style="border-top-color:var(--c-wind)"></i>Gusts</span><span><i style="border-top:8px solid var(--sand);vertical-align:-2px"></i>Night</span></div><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Temperature, humidity and wind through ${esc(label(d.date))}">${g}</svg>`;
  const svg = box.querySelector("svg"), ov = box.querySelector(".ov"), xh = box.querySelector(".xh"), t = tipBox(box); let cur = -1;
  const show = i => { cur = i = Math.max(0, Math.min(hrs.length - 1, i)); const h = hrs[i]; const px = x(h.ms); xh.setAttribute("x1", px); xh.setAttribute("x2", px); xh.setAttribute("opacity", ".35");
    panels.forEach(p => p.s.forEach(([k]) => { const c = svg.querySelector(".p" + k); if (h[k] == null) { c.setAttribute("opacity", 0); return; } c.setAttribute("cx", px); c.setAttribute("cy", p.y(h[k])); c.setAttribute("opacity", 1); }));
    fillTip(t, `${String(h.h).padStart(2, "0")}:00 · ${h.cond}`, [["temperature", r0(h.t) + "°C", "var(--c-hi)"], ["feels like", r0(h.feels) + "°C", "var(--c-hi)", true], ["humidity", r0(h.rh) + "%", "var(--c-lo)"], ["wind " + (h.dir || ""), r0(h.ws) + " km/h", "var(--c-wind)"], ["gusts", r0(h.gust) + " km/h", "var(--c-wind)", true], ["rain" + (h.pop != null ? ` (${h.pop}%)` : ""), f1(h.precip ?? 0) + " mm", null]]);
    const scale = box.querySelector("svg").getBoundingClientRect().width / W; placeTip(box, t, px * scale + 6, 30); };
  const hide = () => { xh.setAttribute("opacity", 0); svg.querySelectorAll(".dot").forEach(c => c.setAttribute("opacity", 0)); t.hidden = true; };
  const near = ev => { const r = svg.getBoundingClientRect(); const px = (ev.clientX - r.left) * W / r.width; const ms = t0 + (px - L) / (W - L - R) * (t1 - t0); let bi = 0; hrs.forEach((h, i) => { if (Math.abs(h.ms - ms) < Math.abs(hrs[bi].ms - ms)) bi = i; }); return bi; };
  ov.addEventListener("pointermove", ev => show(near(ev))); ov.addEventListener("pointerdown", ev => show(near(ev))); ov.addEventListener("pointerleave", hide);
  ov.addEventListener("focus", () => show(cur < 0 ? 0 : cur)); ov.addEventListener("blur", hide);
  ov.addEventListener("keydown", e => { if (e.key === "ArrowRight") { show(cur + 1); e.preventDefault(); } else if (e.key === "ArrowLeft") { show(cur - 1); e.preventDefault(); } });
}

/* ---------- Detail tab ---------- */
function renderDetail() {
  const D = days(); if (!D.length) { $("#dt").innerHTML = `<div class="card skel">No forecast days to show.</div>`; return; }
  if (!DSEL || !D.find(d => d.date === DSEL)) DSEL = D[0].date; const d = D.find(x => x.date === DSEL);
  const f = d.fdi; const lr = f && f.lastRain;
  const lrText = !f ? "" : lr ? `Last rain ${f1(lr.mm)} mm on ${shortDate(lr.date)}${lr.own ? " (your gauge)" : lr.fc ? " (forecast)" : " (model)"}, so the index is ${f.rf < 1 ? `cut to ${Math.round(f.rf * 100)}%` : "not reduced"}.` : "No rain of 1 mm or more on record, so no rain reduction.";
  const hrsNow = Date.now();
  $("#dt").innerHTML = `${staleNote()}
  <div class="chips" role="group" aria-label="Choose a day">${D.map(x => `<button type="button" data-d="${x.date}" aria-pressed="${x.date === DSEL}"><span class="a">${label(x.date) === "Today" ? "Today" : DAYS[dow(x.date)]}</span><span class="b num">${x.max ?? "–"}° / ${x.min ?? "–"}°</span></button>`).join("")}</div>
  <section class="sec"><h2>${esc(label(d.date))} <small>${shortDate(d.date)} · ${esc(d.cond)}${d.sources > 1 && d.maxRange ? ` · highs from ${d.sources} forecasts: ${d.maxRange[0] === d.maxRange[1] ? d.max + "°" : d.maxRange[0] + "–" + d.maxRange[1] + "°"}` : ""}</small></h2>
    <p class="lead">${esc(d.summary)}</p>
    <div class="plan">
      <div class="pc"><span class="k">Walk</span><b>${esc(d.walk && d.walk.text || "–")}</b>${d.walk && d.walk.thr ? `<small>Until it reaches ${d.walk.thr}°C.</small>` : ""}</div>
      <div class="pc"><span class="k">Drives</span><b>${esc(d.drive && d.drive.text || "–")}</b></div>
      <div class="pc"><span class="k">After dark</span><b>${esc(d.night && d.night.text || "–")}</b><small>${moonLine(d.moon)}</small></div>
      <div class="pc"><span class="k">Fire danger</span><span>${fdiChip(f)}</span>${f ? `<small>Lowveld index from the 14:00 forecast: ${f1(f.t)}°C, ${f.rh}% humidity, wind ${f.ws} km/h. ${esc(lrText)}</small>` : ""}</div>
    </div>
  </section>
  ${d.alerts && d.alerts.length ? `<section class="sec"><h2>Alerts</h2><div class="alerts">${d.alerts.map(alertHTML).join("")}</div></section>` : ""}
  ${d.notes && d.notes.length ? `<section class="sec"><h2>Field notes</h2><ul class="notes">${d.notes.map(([k, v]) => `<li><b>${esc(k)}.</b> ${esc(v)}</li>`).join("")}</ul></section>` : ""}
  <section class="sec"><h2>Through the day <small>tap or hover for the hour</small></h2><div class="card chartbox" id="dchart"></div></section>
  <section class="sec"><h2>Hour by hour</h2><div class="card tblwrap"><table class="tbl"><thead><tr><th>Time</th><th></th><th class="n">Temp</th><th class="n">Feels</th><th class="n">Humidity</th><th>Wind</th><th class="n">Gusts</th><th class="n">Rain</th><th class="n">Cloud</th><th class="n">UV</th><th class="n">Fire</th></tr></thead><tbody>
    ${(d.hours || []).map(h => `<tr class="${h.ms <= hrsNow && hrsNow < h.ms + 3600e3 ? "cur" : ""}"><td class="num">${String(h.h).padStart(2, "0")}:00</td><td>${icon(h.cond, !h.day)}</td><td class="n hi">${r0(h.t)}°</td><td class="n">${r0(h.feels)}°</td><td class="n">${r0(h.rh)}%</td><td class="num">${esc(h.dir || "")} ${r0(h.ws)}</td><td class="n">${r0(h.gust)}</td><td class="n rn">${h.precip >= 0.1 ? f1(h.precip) + " mm" : ""}${h.pop >= 20 ? ` <small>${h.pop}%</small>` : ""}</td><td class="n">${r0(h.cloud)}%</td><td class="n">${h.uv != null ? f1(h.uv) : "–"}</td><td class="n">${h.fdi != null ? fdiChip({ value: h.fdi, color: fdiCls(h.fdi) }, true) : ""}</td></tr>`).join("")}</tbody></table></div>
    <p class="note2">Wind in km/h, from the direction shown. Fire is the Lowveld index worked out for that hour.</p></section>
  <section class="sec"><h2>The week at a glance</h2><div class="card tblwrap"><table class="tbl"><thead><tr><th>Day</th><th class="n">High</th><th class="n">Low</th><th class="n">Rain</th><th class="n">Wind</th><th>Fire</th><th>Walk</th><th>Afternoon drive</th><th>Moon after dark</th></tr></thead><tbody>
    ${D.map(x => `<tr data-d="${x.date}" style="cursor:pointer"><td>${esc(label(x.date))}</td><td class="n hi">${x.max ?? "–"}°</td><td class="n lo">${x.min ?? "–"}°</td><td class="n rn">${f1(x.rain ?? 0)} mm</td><td class="n">${r0(x.m && x.m.wsMax)} <small>${esc(x.m && x.m.dirAft || "")}</small></td><td>${fdiChip(x.fdi, true)}</td><td>${x.walk && x.walk.end ? "until " + hm(x.walk.end) : "–"}</td><td>${x.drive && x.drive.out ? "out " + hm(x.drive.out) : "–"}</td><td>${esc(x.night && x.night.short || "")}</td></tr>`).join("")}</tbody></table></div></section>
  ${modelTable(D)}
  <section class="sec"><h2>Sun &amp; moon</h2><div class="card tblwrap"><table class="tbl"><thead><tr><th>Day</th><th class="n">First light</th><th class="n">Sunrise</th><th class="n">Sunset</th><th class="n">Last light</th><th class="n">Moonrise</th><th class="n">Moonset</th><th class="n">Moon</th></tr></thead><tbody>
    ${D.map(x => `<tr><td>${esc(label(x.date))}</td><td class="n">${hm(x.sun.firstLight)}</td><td class="n">${hm(x.sun.rise)}</td><td class="n">${hm(x.sun.set)}</td><td class="n">${hm(x.sun.lastLight)}</td><td class="n">${x.moon.rise ? hm(x.moon.rise) : "–"}</td><td class="n">${x.moon.set ? hm(x.moon.set) : "–"}</td><td class="n">${x.moon.pct}%</td></tr>`).join("")}</tbody></table></div>
    ${FC.moonEvents && FC.moonEvents.length ? `<div class="mev">${FC.moonEvents.map(e => `<span><b>${esc(e.name)}</b> ${shortDate(e.date)} ${esc(e.time)}</span>`).join("")}</div>` : ""}
    <p class="note2">First and last light are civil twilight (sun 6° below the horizon), worked out for Nomvula's exact position.</p></section>
  <section class="sec"><h2>Sources</h2><div class="card" style="padding:12px 14px"><div class="srcs">${(FC.sources || []).map(s => `<div><span class="dot ${s.ok ? "" : "off"}"></span><span><b>${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a>` : esc(s.name)}</b>: ${esc(s.use)}${s.ok ? "" : " (didn't answer this time)"}</span></div>`).join("")}</div>
    <p class="note2" style="margin-top:10px">Forecast built ${new Date(FC.generatedAt).toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}. Official warnings: <a href="${esc(FC.warningsUrl)}" target="_blank" rel="noopener">South African Weather Service</a>.</p>
    <div class="btnrow" style="margin-top:10px"><button class="tbtn" type="button" id="refresh">Refresh now</button></div></div></section>`;
  document.querySelectorAll("#dt [data-d]").forEach(b => b.addEventListener("click", () => { DSEL = b.dataset.d; renderDetail(); window.scrollTo({ top: $("#dt").offsetTop - 70, behavior: "smooth" }); }));
  const rf = $("#refresh"); if (rf) rf.onclick = () => { rf.disabled = true; rf.textContent = "Refreshing…"; loadForecast(true); };
  dayChart($("#dchart"), d);
}
function moonLine(m) { const ev = []; if (m.rise) ev.push([m.rise, "rises"]); if (m.set) ev.push([m.set, "sets"]); ev.sort((a, b) => a[0] - b[0]); return esc([ev.map(([t, k], i) => `${i ? k : k[0].toUpperCase() + k.slice(1)} ${hm(t)}`).join(", "), m.phase].filter(Boolean).join(" · ")); }
const fdiCls = v => (v <= 20 ? "blue" : v <= 45 ? "green" : v <= 60 ? "yellow" : v <= 75 ? "orange" : "red");
function modelTable(D) {
  const M = FC.models; if (!M || !M.sources || M.sources.length < 2) return "";
  return `<section class="sec"><h2>How the forecasts compare <small>high / low °C, rain mm</small></h2><div class="card tblwrap"><table class="tbl"><thead><tr><th>Day</th>${M.sources.map(s => `<th class="n">${esc(s.name)}</th>`).join("")}<th class="n">Middle</th></tr></thead><tbody>
    ${D.map(d => { const row = M.table[d.date] || {}; const c = M.consensus[d.date] || {}; return `<tr><td>${esc(label(d.date))}</td>${M.sources.map(s => { const v = row[s.id]; return `<td class="n">${v && v.max != null ? `${v.max}/${v.min}${v.rain >= 0.5 ? ` <small class="rn">${f1(v.rain)}</small>` : ""}` : "–"}</td>`; }).join("")}<td class="n cons">${c.max ?? "–"}/${c.min ?? "–"}${c.rain >= 0.5 ? ` <small class="rn">${f1(c.rain)}</small>` : ""}</td></tr>`; }).join("")}</tbody></table></div>
    <p class="note2">The app shows the middle value of all the forecasts, so one odd model can't swing it. A wide spread means less certainty.</p></section>`;
}
function footerLine() {
  $("#src").textContent = `Forecast: Open-Meteo, MET Norway (yr.no) and six global models, for ${FC.site.lat.toFixed(4)}, ${FC.site.lon.toFixed(4)}. Live readings: Hoedspruit weather station. Built ${ago(FC.generatedAt)}; refreshes every 15 minutes.`;
}

/* ---------- Records tab ---------- */
const REC = (function () {
  const box = $("#rec");
  const R = { days: new Map(), loaded: false, month: null, view: lsGet("wr.view", "month"), canWrite: false, error: null };
  const monthKey = d => d.slice(0, 7);
  const mLabel = k => MONL[+k.slice(5) - 1] + " " + k.slice(0, 4);
  function shiftMonth(k, n) { const [y, m] = k.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0"); }
  const daysIn = k => new Date(Date.UTC(+k.slice(0, 4), +k.slice(5), 0)).getUTCDate();
  /* your own readings win, otherwise the logged model readings */
  function resolve(doc) {
    const m = doc.manual || {}; const rd = Array.isArray(doc.readings) ? doc.readings : [];
    const temps = rd.map(x => nnum(x.temp)).filter(v => v != null);
    const autoHi = [...temps, nnum(doc.fcMax)].filter(v => v != null), autoLo = [...temps, nnum(doc.fcMin)].filter(v => v != null);
    const winds = rd.map(x => nnum(x.wind_ms)).filter(v => v != null); if (nnum(doc.windMax_ms) != null) winds.push(nnum(doc.windMax_ms));
    const hi = nnum(m.max) ?? (autoHi.length ? Math.max(...autoHi) : null), lo = nnum(m.min) ?? (autoLo.length ? Math.min(...autoLo) : null);
    const g = doc.gauge || {}; const gRain = nnum(g.mm);
    const rain = nnum(m.rain) ?? gRain ?? nnum(doc.rainEst), wind = nnum(m.wind_kmh) ?? (winds.length ? kmh(Math.max(...winds)) : null);
    const own = ["max", "min", "rain", "wind_kmh"].some(k => nnum(m[k]) != null) || gRain != null;
    return { date: doc.date, hi, lo, rain, wind, cond: doc.cond || "", notes: m.notes || doc.notes || "", own, ownRain: nnum(m.rain) != null || gRain != null, readings: rd, stn: doc.stn || null, raw: doc };
  }
  const all = () => Array.from(R.days.values()).filter(d => d && d.date).map(resolve).sort((a, b) => a.date.localeCompare(b.date));
  const inMonth = k => all().filter(d => monthKey(d.date) === k);
  function summary(list) {
    const hs = list.filter(d => d.hi != null), ls = list.filter(d => d.lo != null), rs = list.filter(d => d.rain != null), ws = list.filter(d => d.wind != null);
    const avg = (a, k) => (a.length ? a.reduce((s, d) => s + d[k], 0) / a.length : null); const top = (a, k, dir) => (a.length ? a.reduce((x, d) => ((dir > 0 ? d[k] > x[k] : d[k] < x[k]) ? d : x)) : null);
    return { n: list.length, avgHi: avg(hs, "hi"), avgLo: avg(ls, "lo"), hot: top(hs, "hi", 1), cold: top(ls, "lo", -1), rain: rs.length ? rs.reduce((s, d) => s + d.rain, 0) : null, rainDays: rs.filter(d => d.rain >= 1).length,
      wet: top(rs.filter(d => d.rain > 0), "rain", 1), windy: top(ws, "wind", 1), hot35: hs.filter(d => d.hi >= 35).length, cold10: ls.filter(d => d.lo <= 10).length, ownN: list.filter(d => d.own).length };
  }
  const RAMP = [[8, [91, 111, 168]], [15, [122, 90, 130]], [22, [226, 76, 124]], [30, [166, 14, 50]], [36, [242, 153, 74]], [42, [214, 90, 20]]];
  function tcol(t) { if (t == null) return null; for (let i = 0; i < RAMP.length - 1; i++) { const [a, ca] = RAMP[i], [b, cb] = RAMP[i + 1]; if (t <= b) { const u = Math.max(0, Math.min(1, (t - a) / (b - a))); return `rgb(${ca.map((c, j) => Math.round(c + (cb[j] - c) * u)).join(",")})`; } } return `rgb(${RAMP[RAMP.length - 1][1].join(",")})`; }
  function monthChart(k, list) {
    const n = daysIn(k); const W = Math.max(320, Math.min(860, box.clientWidth - 14)), H = 260, L = 34, Rr = 10, T = 16, B = 58, RH = 34;
    const vals = list.flatMap(d => [d.hi, d.lo]).filter(v => v != null); if (!vals.length) return "";
    let lo = Math.floor((Math.min(...vals) - 2) / 5) * 5, hi = Math.ceil((Math.max(...vals) + 2) / 5) * 5; if (hi - lo < 10) hi = lo + 10;
    const pw = (W - L - Rr) / n, x = i => L + pw * (i + .5), y = v => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
    const maxR = Math.max(5, ...list.map(d => d.rain || 0)); const ry = v => H - 6 - (RH * (v / maxR));
    let g = ""; for (let v = lo; v <= hi; v += 5) g += `<line x1="${L}" x2="${W - Rr}" y1="${y(v)}" y2="${y(v)}" stroke="var(--grid)"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${v}°</text>`;
    const S = summary(list);
    if (S.avgHi != null) g += `<line x1="${L}" x2="${W - Rr}" y1="${y(S.avgHi)}" y2="${y(S.avgHi)}" stroke="var(--c-hi)" stroke-dasharray="4 4" opacity=".6"/><text x="${W - Rr}" y="${y(S.avgHi) - 4}" text-anchor="end" font-size="10.5" fill="var(--body)">avg high ${f1(S.avgHi)}°</text>`;
    if (S.avgLo != null) g += `<line x1="${L}" x2="${W - Rr}" y1="${y(S.avgLo)}" y2="${y(S.avgLo)}" stroke="var(--c-lo)" stroke-dasharray="4 4" opacity=".6"/><text x="${W - Rr}" y="${y(S.avgLo) + 12}" text-anchor="end" font-size="10.5" fill="var(--body)">avg low ${f1(S.avgLo)}°</text>`;
    const bw = Math.max(3, Math.min(14, pw * .55)); const byDay = {}; list.forEach(d => (byDay[+d.date.slice(8)] = d));
    for (let i = 1; i <= n; i++) { const d = byDay[i]; const cx = x(i - 1);
      if (i === 1 || (i % 5 === 0 && n - i >= 2) || i === n) g += `<text x="${cx}" y="${H - B + 16}" text-anchor="middle" font-size="10.5" fill="var(--muted)">${i}</text>`;
      if (!d) continue;
      if (d.hi != null && d.lo != null) g += `<rect x="${cx - bw / 2}" y="${y(d.hi)}" width="${bw}" height="${Math.max(2, y(d.lo) - y(d.hi))}" rx="${bw / 2}" fill="${tcol(d.hi)}" data-day="${d.date}" style="cursor:pointer"><title>${shortDate(d.date)}: ${f1(d.hi)}° / ${f1(d.lo)}°</title></rect>`;
      if (d.rain > 0) g += `<rect x="${cx - bw / 2}" y="${ry(d.rain)}" width="${bw}" height="${H - 6 - ry(d.rain)}" fill="var(--rain)" opacity="${d.ownRain ? 1 : .45}"><title>${f1(d.rain)} mm</title></rect>`; }
    g += `<line x1="${L}" x2="${W - Rr}" y1="${H - 6}" y2="${H - 6}" stroke="var(--grid)"/><text x="${L - 6}" y="${H - RH}" text-anchor="end" font-size="10" fill="var(--muted)">${Math.round(maxR)}mm</text>`;
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Daily high and low temperatures and rain for ${mLabel(k)}">${g}</svg>`;
  }
  function calendar(k, list) {
    const first = (new Date(Date.UTC(+k.slice(0, 4), +k.slice(5) - 1, 1)).getUTCDay() + 6) % 7; const n = daysIn(k); const td = today(); const by = {}; list.forEach(d => (by[d.date] = d));
    let h = ["M", "T", "W", "T", "F", "S", "S"].map(x => `<span class="hd">${x}</span>`).join("") + "<span></span>".repeat(first);
    for (let i = 1; i <= n; i++) { const ds = k + "-" + String(i).padStart(2, "0"); const d = by[ds];
      if (ds > td) h += `<button type="button" class="future" disabled><span class="d">${i}</span></button>`;
      else if (!d || d.hi == null) h += `<button type="button" class="none ${ds === td ? "today" : ""}" data-day="${ds}" aria-label="${shortDate(ds)}: no record, tap to add"><span class="d">${i}</span><span class="t">+</span></button>`;
      else h += `<button type="button" class="${ds === td ? "today" : ""}" data-day="${ds}" style="background:${tcol(d.hi)}" aria-label="${shortDate(ds)}: high ${f1(d.hi)}°"><span class="d">${i}</span><span class="t">${Math.round(d.hi)}°</span>${d.own ? '<span class="own"></span>' : ""}</button>`; }
    return `<div class="cal">${h}</div><div class="legend2"><span>8°</span><span class="ramp" style="background:linear-gradient(90deg,${[8, 15, 22, 30, 36, 42].map(tcol).join(",")})"></span><span>42°</span><span>· white dot = your own reading</span></div>`;
  }
  function statCards(S) {
    const c = (k, v, cls, s) => `<div class="stat"><div class="k">${k}</div><div class="v num ${cls || ""}">${v}</div><div class="s">${s || "&nbsp;"}</div></div>`;
    return `<div class="stats">${c("Avg high", S.avgHi != null ? f1(S.avgHi) + "°" : "–", "hot")}${c("Avg low", S.avgLo != null ? f1(S.avgLo) + "°" : "–", "cold")}
    ${c("Hottest", S.hot ? f1(S.hot.hi) + "°" : "–", "hot", S.hot ? shortDate(S.hot.date) : "")}${c("Coldest night", S.cold ? f1(S.cold.lo) + "°" : "–", "cold", S.cold ? shortDate(S.cold.date) : "")}
    ${c("Rain", S.rain != null ? f1(S.rain) + " mm" : "–", "wet", S.rain != null ? `${S.rainDays} day${S.rainDays === 1 ? "" : "s"} ≥ 1 mm` : "")}${c("Windiest", S.windy ? Math.round(S.windy.wind) + " km/h" : "–", "", S.windy ? shortDate(S.windy.date) : "")}
    ${c("Days ≥ 35°", S.hot35, "hot", S.cold10 ? `${S.cold10} night${S.cold10 > 1 ? "s" : ""} ≤ 10°` : "")}${c("Days logged", S.n, "", S.ownN ? `${S.ownN} with your readings` : "model readings")}</div>`;
  }
  function dayTable(list) { if (!list.length) return "";
    return `<div class="card tblwrap"><table class="tbl"><thead><tr><th>Day</th><th></th><th class="n">High</th><th class="n">Low</th><th class="n">Wind</th><th class="n">Rain</th><th class="n">Hoedspruit</th><th>Source</th><th>Notes</th></tr></thead><tbody>
    ${list.slice().reverse().map(d => `<tr data-day="${d.date}"><td>${shortDate(d.date)}</td><td>${d.cond ? icon(d.cond, false) : ""}</td><td class="n hi">${f1(d.hi)}°</td><td class="n lo">${f1(d.lo)}°</td><td class="n">${d.wind != null ? Math.round(d.wind) : "–"}</td><td class="n rn">${d.rain != null ? f1(d.rain) : "–"}</td><td class="n">${d.stn ? `${f1(d.stn.max)}°/${f1(d.stn.min)}°` : "–"}</td><td><span class="src ${d.own ? "own" : "model"}">${d.own ? "Yours" : "Model"}</span></td><td style="white-space:normal;min-width:120px;color:var(--muted)">${esc(d.notes)}</td></tr>`).join("")}</tbody></table></div>`; }
  function compareLine(k, S) { const prev = shiftMonth(k, -12); const P = summary(inMonth(prev)); if (!P.n || S.avgHi == null || P.avgHi == null) return "";
    const dh = S.avgHi - P.avgHi; const dr = (S.rain ?? 0) - (P.rain ?? 0);
    return `<p class="cmp">Compared with ${mLabel(prev)}: highs ${Math.abs(dh) < .3 ? "about the same" : dh > 0 ? f1(dh) + "° warmer" : f1(-dh) + "° cooler"}${P.rain != null && S.rain != null ? `, ${Math.abs(dr) < 1 ? "similar rain" : dr > 0 ? f1(dr) + " mm more rain" : f1(-dr) + " mm less rain"}` : ""}.</p>`; }
  function viewMonth() { const k = R.month; const list = inMonth(k); const S = summary(list); const thisM = monthKey(today());
    return `<div class="rbar"><button class="ibtn" type="button" id="mPrev" aria-label="Previous month">‹</button><span class="mon">${mLabel(k)}</span><button class="ibtn" type="button" id="mNext" aria-label="Next month" ${k >= thisM ? "disabled" : ""}>›</button></div>
    ${list.length ? `${statCards(S)}${compareLine(k, S)}
    <section class="sec"><h2>Day by day <small>high–low bars, rain in blue</small></h2><div class="card rchart">${monthChart(k, list)}</div></section>
    <section class="sec"><h2>Calendar <small>coloured by the day's high</small></h2><div class="card" style="padding:12px">${calendar(k, list)}</div></section>
    <section class="sec"><h2>The record <small>tap a day to add your own readings</small></h2>${dayTable(list)}</section>`
    : `<div class="card skel"><p style="margin:0">No records for ${mLabel(k)} yet.${k === thisM ? " Today's readings are logged automatically every hour." : ""}</p><div class="card" style="padding:12px;margin-top:12px;text-align:left">${calendar(k, list)}</div></div>`}
    ${tools("month")}`; }
  function viewYear() { const y = R.month.slice(0, 4); const months = Array.from({ length: 12 }, (_, i) => y + "-" + String(i + 1).padStart(2, "0"));
    const rows = months.map(k => ({ k, S: summary(inMonth(k)) })); const has = rows.filter(r => r.S.n); const Y = summary(all().filter(d => d.date.startsWith(y)));
    return `<div class="rbar"><button class="ibtn" type="button" id="yPrev" aria-label="Previous year">‹</button><span class="mon">${y}</span><button class="ibtn" type="button" id="yNext" aria-label="Next year" ${+y >= +today().slice(0, 4) ? "disabled" : ""}>›</button></div>
    ${has.length ? `${statCards(Y)}
    <section class="sec"><h2>Monthly summaries</h2><div class="card tblwrap"><table class="tbl"><thead><tr><th>Month</th><th class="n">Avg high</th><th class="n">Avg low</th><th class="n">Hottest</th><th class="n">Coldest</th><th class="n">Rain mm</th><th class="n">Rain days</th><th class="n">≥35°</th><th class="n">Days</th></tr></thead><tbody>
    ${has.map(({ k, S }) => `<tr data-month="${k}" style="cursor:pointer"><td>${MONL[+k.slice(5) - 1]}</td><td class="n hi">${f1(S.avgHi)}°</td><td class="n lo">${f1(S.avgLo)}°</td><td class="n">${S.hot ? f1(S.hot.hi) + "°" : "–"}</td><td class="n">${S.cold ? f1(S.cold.lo) + "°" : "–"}</td><td class="n rn">${S.rain != null ? f1(S.rain) : "–"}</td><td class="n">${S.rainDays}</td><td class="n">${S.hot35}</td><td class="n">${S.n}</td></tr>`).join("")}</tbody></table></div></section>` : `<div class="card skel"><p style="margin:0">No records for ${y} yet.</p></div>`}
    ${tools("year")}`; }
  function viewRecords() { const A = all(); if (!A.length) return `<div class="card skel"><p style="margin:0">Records appear once a few days are logged.</p></div>${tools("all")}`;
    const S = summary(A); const range = A.filter(d => d.hi != null && d.lo != null).reduce((x, d) => (!x || d.hi - d.lo > x.hi - x.lo ? d : x), null);
    const streak = test => { let best = null, cur = null; A.forEach((d, i) => { const prevOk = cur && i > 0 && Math.round((Date.parse(d.date) - Date.parse(A[i - 1].date)) / 864e5) === 1; if (test(d)) { cur = prevOk ? { s: cur.s, e: d.date, n: cur.n + 1 } : { s: d.date, e: d.date, n: 1 }; if (!best || cur.n > best.n) best = { ...cur }; } else cur = null; }); return best; };
    const hotS = streak(d => d.hi != null && d.hi >= 35), dryS = streak(d => d.rain != null && d.rain < 1);
    const rec = (k, v, s, col) => `<div class="rec"><div><div class="k">${k}</div><div class="s">${s}</div></div><div class="v num" style="color:${col}">${v}</div></div>`;
    return `<h2>All-time records <small>since ${shortDate(A[0].date)} ${A[0].date.slice(0, 4)} · ${A.length} days</small></h2>
    <div class="rlist">${rec("Hottest day", S.hot ? f1(S.hot.hi) + "°" : "–", S.hot ? shortDate(S.hot.date) + " " + S.hot.date.slice(0, 4) : "", "var(--hot)")}${rec("Coldest night", S.cold ? f1(S.cold.lo) + "°" : "–", S.cold ? shortDate(S.cold.date) + " " + S.cold.date.slice(0, 4) : "", "var(--plum)")}
    ${rec("Wettest day", S.wet ? f1(S.wet.rain) + " mm" : "–", S.wet ? shortDate(S.wet.date) + " " + S.wet.date.slice(0, 4) : "", "var(--rain)")}${rec("Windiest day", S.windy ? Math.round(S.windy.wind) + " km/h" : "–", S.windy ? shortDate(S.windy.date) + " " + S.windy.date.slice(0, 4) : "", "var(--ink)")}
    ${rec("Biggest day–night swing", range ? f1(range.hi - range.lo) + "°" : "–", range ? `${shortDate(range.date)}: ${f1(range.hi)}° to ${f1(range.lo)}°` : "", "var(--amber)")}${rec("Longest run of 35° days", hotS ? hotS.n + " days" : "none yet", hotS ? `${shortDate(hotS.s)} – ${shortDate(hotS.e)}` : "", "var(--hot)")}
    ${rec("Longest dry spell", dryS ? dryS.n + " days" : "–", dryS ? `${shortDate(dryS.s)} – ${shortDate(dryS.e)}` : "", "var(--body)")}${rec("Average across all days", S.avgHi != null ? `${f1(S.avgHi)}° / ${f1(S.avgLo)}°` : "–", "high / low", "var(--ink)")}</div>
    ${tools("all")}`; }
  function tools(scope) { const lbl = scope === "month" ? mLabel(R.month) : scope === "year" ? R.month.slice(0, 4) : "all days";
    return `<section class="sec"><h2>Tools</h2><div class="tools">
      <button class="tbtn primary" type="button" id="tAdd">+ Add or edit a day</button>
      <button class="tbtn" type="button" id="tCsv" data-scope="${scope}">Export ${esc(lbl)} (CSV)</button>
      ${scope !== "all" ? `<button class="tbtn" type="button" id="tCsvAll" data-scope="all">Export everything (CSV)</button>` : ""}
      <label class="tbtn">Import past records<input type="file" id="tImp" accept=".csv,text/csv"></label></div>
      <p class="note2">Readings are logged automatically every hour from the Open-Meteo model for Nomvula's coordinates (MET Norway before 22 October 2026), so they're close to, but not the same as, a thermometer on site. The Hoedspruit column is the air force base weather station, 14 km away and higher up. Add your own max/min, rain gauge and wind readings for any day and they're used instead; your rain readings also feed the fire danger index. Import a CSV with columns <b>date, max, min, rain, wind, notes</b> to bring in older records.</p></section>`; }
  function render() {
    if (!R.loaded) { box.innerHTML = `<div class="card skel">${R.error ? esc(R.error) : "Loading the weather records…"}</div>`; return; }
    if (!R.month) R.month = monthKey(today());
    box.innerHTML = `<div class="seg2" role="group" aria-label="Records view">${[["month", "Month"], ["year", "Year"], ["records", "All-time records"]].map(([k, l]) => `<button type="button" data-rv="${k}" aria-pressed="${R.view === k}">${l}</button>`).join("")}</div>
      ${R.view === "month" ? viewMonth() : R.view === "year" ? viewYear() : viewRecords()}`;
    box.querySelectorAll("[data-rv]").forEach(b => (b.onclick = () => { R.view = b.dataset.rv; lsSet("wr.view", R.view); render(); }));
    const on = (id, fn) => { const e = document.getElementById(id); if (e) e.onclick = fn; };
    on("mPrev", () => { R.month = shiftMonth(R.month, -1); render(); }); on("mNext", () => { R.month = shiftMonth(R.month, 1); render(); });
    on("yPrev", () => { R.month = +R.month.slice(0, 4) - 1 + R.month.slice(4); render(); }); on("yNext", () => { R.month = +R.month.slice(0, 4) + 1 + R.month.slice(4); render(); });
    box.querySelectorAll("[data-day]").forEach(b => b.addEventListener("click", () => openDay(b.dataset.day)));
    box.querySelectorAll("[data-month]").forEach(b => b.addEventListener("click", () => { R.month = b.dataset.month; R.view = "month"; render(); }));
    on("tAdd", () => openDay(today()));
    ["tCsv", "tCsvAll"].forEach(id => on(id, () => exportCSV(document.getElementById(id).dataset.scope)));
    const imp = document.getElementById("tImp"); if (imp) imp.onchange = e => { const f = e.target.files[0]; e.target.value = ""; if (f) importCSV(f); };
  }
  /* saving needs the passcode set in Netlify; it's remembered on this phone */
  async function post(body, passEl) {
    let pass = (passEl && passEl.value.trim()) || lsGet("wx.pass", "");
    if (!pass) { const e = new Error("Enter the passcode first."); e.code = "nopass"; throw e; }
    const r = await fetch("/api/records", { method: "POST", headers: { "Content-Type": "application/json", "X-Passcode": pass }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) { lsSet("wx.pass", ""); const e = new Error("Wrong passcode."); e.code = "nopass"; throw e; }
    if (!r.ok) throw new Error(j.error || "Couldn't save. Check your signal and try again.");
    lsSet("wx.pass", pass); return j;
  }
  function openDay(date) {
    const doc = R.days.get(date) || { date }; const d = resolve(doc); const m = doc.manual || {}; const needPass = !lsGet("wx.pass", "");
    const el = document.createElement("div"); el.className = "dsheet"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Weather for " + shortDate(date));
    el.innerHTML = `<div class="in">
      <div class="rbar"><button class="tbtn" type="button" data-x>‹ Back</button><span></span></div>
      <div class="fld" style="max-width:220px"><label for="dDate">Day</label><input id="dDate" type="date" value="${date}" max="${today()}"></div>
      <h3>${shortDate(date)} ${date.slice(0, 4)}</h3>
      <div class="stats">${[["High", f1(d.hi) + "°", "hot"], ["Low", f1(d.lo) + "°", "cold"], ["Wind", d.wind != null ? Math.round(d.wind) + " km/h" : "–", ""], ["Rain", d.rain != null ? f1(d.rain) + " mm" : "–", "wet"]].map(([k, v, c]) => `<div class="stat"><div class="k">${k}</div><div class="v num ${c}">${v}</div><div class="s">${d.own ? "includes your readings" : "model readings"}</div></div>`).join("")}</div>
      ${d.stn ? `<p class="notice">Hoedspruit weather station: high <b>${f1(d.stn.max)}°</b>, low <b>${f1(d.stn.min)}°</b> from ${d.stn.n} reading${d.stn.n === 1 ? "" : "s"}.</p>` : ""}
      ${d.readings.length ? `<div><div class="note2" style="margin-bottom:6px">Logged automatically through the day${doc.fcMax != null ? ` · model for the day ${f1(nnum(doc.fcMax))}° / ${f1(nnum(doc.fcMin))}°` : ""}</div><div class="reads">${d.readings.map(r => `<div>${esc(r.t || "")}<b>${f1(nnum(r.temp))}°</b>${r.cond ? icon(r.cond, false).replace("<svg ", '<svg style="width:22px;height:22px" ') : ""}<span>${kmh(nnum(r.wind_ms)) ?? "–"} km/h</span></div>`).join("")}</div></div>` : `<p class="note2">No automatic readings for this day.</p>`}
      <h2 style="font-size:28px">Your readings</h2>
      <p class="note2">From your own max/min thermometer, rain gauge or wind meter. Leave a box empty to keep the model value.</p>
      <div class="fgrid"><div class="fld"><label for="mMax">Max °C</label><input id="mMax" inputmode="decimal" value="${m.max ?? ""}"></div><div class="fld"><label for="mMin">Min °C</label><input id="mMin" inputmode="decimal" value="${m.min ?? ""}"></div>
      <div class="fld"><label for="mRain">Rain mm</label><input id="mRain" inputmode="decimal" value="${m.rain ?? ""}"></div><div class="fld"><label for="mWind">Strongest wind km/h</label><input id="mWind" inputmode="decimal" value="${m.wind_kmh ?? ""}"></div></div>
      <div class="fld" style="max-width:220px"><label for="mBy">Recorded by</label><select id="mBy" style="border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:10px;padding:10px;min-height:44px">${["Nick", "Kerry", "Ridge", "Staff"].map(p => `<option ${lsGet("wr.me", "Nick") === p ? "selected" : ""}>${p}</option>`).join("")}</select></div>
      <div class="fld"><label for="mNotes">Notes</label><textarea id="mNotes" placeholder="e.g. Thunderstorm at 4pm, hail on the river road">${esc(m.notes || "")}</textarea></div>
      <div class="fld pw" style="max-width:260px" ${needPass ? "" : "hidden"}><label for="mPass">Passcode (asked once on this phone)</label><input id="mPass" type="password" autocomplete="current-password"></div>
      ${m.by ? `<p class="note2">Last edited by ${esc(m.by)}${m.at ? " · " + new Date(m.at).toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}</p>` : ""}
      ${R.canWrite ? `<div class="tools"><button class="tbtn primary" type="button" data-save>Save readings</button>${Object.keys(m).length ? `<button class="tbtn" type="button" data-clear>Remove my readings</button>` : ""}</div>` : `<p class="note2">Saving is switched off until a passcode is set in Netlify (WEATHER_PASSCODE).</p>`}
    </div>`;
    document.body.appendChild(el); document.body.style.overflow = "hidden";
    const close = () => { el.remove(); document.body.style.overflow = ""; };
    el.querySelector("[data-x]").onclick = close;
    el.querySelector("#dDate").onchange = e => { if (e.target.value) { close(); openDay(e.target.value); } };
    const passEl = el.querySelector("#mPass");
    const fail = e => { if (e.code === "nopass") { el.querySelector(".pw").hidden = false; passEl.focus(); } toast(e.message); };
    const num = id => { const v = el.querySelector(id).value.trim().replace(",", "."); if (v === "") return null; const n = parseFloat(v); return isFinite(n) ? n : NaN; };
    const sv = el.querySelector("[data-save]"); if (sv) sv.onclick = async () => {
      const vals = { max: num("#mMax"), min: num("#mMin"), rain: num("#mRain"), wind_kmh: num("#mWind") };
      if (Object.values(vals).some(v => Number.isNaN(v))) { toast("Use numbers only, e.g. 34.5"); return; }
      if ((vals.max != null && (vals.max < -5 || vals.max > 50)) || (vals.min != null && (vals.min < -10 || vals.min > 40))) { toast("That temperature looks wrong. Check the reading."); return; }
      if (vals.max != null && vals.min != null && vals.min > vals.max) { toast("Min is higher than max. Check the readings."); return; }
      const manual = {}; Object.entries(vals).forEach(([k, v]) => { if (v != null) manual[k] = v; }); const notes = el.querySelector("#mNotes").value.trim(); if (notes) manual.notes = notes;
      const by = el.querySelector("#mBy").value; lsSet("wr.me", by); manual.by = by;
      if (!Object.keys(manual).some(k => k !== "by")) { toast("Nothing to save yet."); return; }
      sv.disabled = true;
      try { await post({ date, manual }, passEl); R.days.set(date, { ...doc, date, manual: { ...manual, at: Date.now() } }); toast("Readings saved"); close(); render(); if (manual.rain != null) loadForecast(true); }
      catch (e) { sv.disabled = false; fail(e); } };
    const cl = el.querySelector("[data-clear]"); if (cl) cl.onclick = async () => { try { await post({ date, manual: null }, passEl); const nx = { ...doc }; delete nx.manual; R.days.set(date, nx); toast("Your readings removed"); close(); render(); } catch (e) { fail(e); } };
  }
  function csvCell(v) { if (v == null) return ""; const s = String(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  function exportCSV(scope) {
    let list = all(); let name = "all"; if (scope === "month") { list = inMonth(R.month); name = R.month; } else if (scope === "year") { const y = R.month.slice(0, 4); list = list.filter(d => d.date.startsWith(y)); name = y; }
    if (!list.length) { toast("Nothing to export yet."); return; }
    const rows = [["Date", "Max °C", "Min °C", "Rain mm", "Max wind km/h", "Conditions", "Source", "Hoedspruit max °C", "Hoedspruit min °C", "Notes"]];
    list.forEach(d => rows.push([d.date, d.hi != null ? Math.round(d.hi * 10) / 10 : "", d.lo != null ? Math.round(d.lo * 10) / 10 : "", d.rain != null ? Math.round(d.rain * 10) / 10 : "", d.wind != null ? Math.round(d.wind) : "", d.cond, d.own ? "Own readings" : "Model", d.stn ? d.stn.max : "", d.stn ? d.stn.min : "", d.notes]));
    const csv = "﻿" + rows.map(r => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = `nomvula-weather-${name}.csv`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); toast("Weather records saved");
  }
  function parseCSV(text) { const rows = []; let row = [], cell = "", q = false; for (let i = 0; i < text.length; i++) { const c = text[i]; if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; } else if (c === '"') q = true; else if (c === "," || c === ";") { row.push(cell); cell = ""; } else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; } else if (c !== "\r") cell += c; } if (cell || row.length) { row.push(cell); rows.push(row); } return rows.filter(r => r.some(x => x.trim())); }
  function toISO(s) { s = String(s).trim(); let m = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/); if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`; m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})/); if (m) { const y = m[3].length === 2 ? "20" + m[3] : m[3]; return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; } return null; }
  async function importCSV(file) {
    const rows = parseCSV((await file.text()).replace(/^﻿/, "")); if (rows.length < 2) { toast("That file has no rows to import."); return; }
    const h = rows[0].map(x => x.toLowerCase()); const ix = k => h.findIndex(x => x.includes(k));
    const iD = ix("date"), iMx = ix("max"), iMn = ix("min"), iR = ix("rain"), iW = ix("wind"), iN = ix("note");
    if (iD < 0 || (iMx < 0 && iMn < 0 && iR < 0)) { toast("Couldn't find date and max/min/rain columns in that file."); return; }
    const n = v => { if (v == null || String(v).trim() === "") return null; const x = parseFloat(String(v).replace(",", ".")); return isFinite(x) ? x : null; };
    const items = []; let skip = 0;
    rows.slice(1, 1001).forEach(r => { const date = toISO(r[iD]); if (!date) { skip++; return; } const manual = {}; const mx = iMx >= 0 ? n(r[iMx]) : null, mn = iMn >= 0 ? n(r[iMn]) : null, rn = iR >= 0 ? n(r[iR]) : null, wd = iW >= 0 ? n(r[iW]) : null;
      if (mx != null) manual.max = mx; if (mn != null) manual.min = mn; if (rn != null) manual.rain = rn; if (wd != null) manual.wind_kmh = wd; if (iN >= 0 && r[iN] && r[iN].trim()) manual.notes = r[iN].trim();
      if (!Object.keys(manual).length) { skip++; return; } manual.by = lsGet("wr.me", "Nick") + " (import)"; items.push({ date, manual }); });
    if (!items.length) { toast("Nothing in that file to import."); return; }
    if (!lsGet("wx.pass", "")) { openDay(today()); toast("Enter the passcode once, save, then import again."); return; }
    toast(`Importing ${items.length} days…`);
    try { for (let i = 0; i < items.length; i += 200) await post({ items: items.slice(i, i + 200) }); await load(); toast(`Imported ${items.length} day${items.length === 1 ? "" : "s"}${skip ? `, skipped ${skip}` : ""}.`); }
    catch (e) { toast(e.message); }
  }
  async function load() {
    try { const r = await fetch("/api/records", { cache: "no-store" }); const j = await r.json(); if (!r.ok) throw new Error(j.error || r.status);
      R.days = new Map(j.days.map(d => [d.date, d])); R.canWrite = !!j.writable; R.loaded = true; lsSet("wx.rec", j); }
    catch (e) { const c = lsGet("wx.rec", null); if (c) { R.days = new Map(c.days.map(d => [d.date, d])); R.canWrite = false; R.loaded = true; toast("Offline: showing saved records."); } else R.error = "Couldn't load the records. Check your signal and try again."; }
    if (!document.querySelector(".dsheet") && !box.hidden) render();
  }
  return { load, render, loaded: () => R.loaded };
})();

/* ---------- tabs, refresh, offline ---------- */
function setTab(t) {
  document.querySelectorAll(".tabs2 button").forEach(b => b.setAttribute("aria-selected", String(b.dataset.tab === t)));
  ["fc", "dt", "rec"].forEach(id => ($("#" + id).hidden = id !== t)); lsSet("wx.tab", t);
  if (t === "rec") { if (REC.loaded()) REC.render(); else REC.load(); }
  if (t === "dt" && FC) renderDetail();
  if (t === "fc" && FC) renderForecast();
  window.scrollTo({ top: 0 });
}
document.querySelectorAll(".tabs2 button").forEach(b => (b.onclick = () => setTab(b.dataset.tab)));
const start = location.hash === "#records" ? "rec" : location.hash === "#detail" ? "dt" : lsGet("wx.tab", "fc");
const cached = lsGet("wx.fc", null); if (cached) { FC = cached; offline = false; renderAll(); }
setTab(["fc", "dt", "rec"].includes(start) ? start : "fc");
loadForecast(false);
setInterval(() => { const a = $("#ago"); if (a && FC) a.textContent = ago(FC.generatedAt); }, 60000);
setInterval(() => { if (document.visibilityState === "visible") loadForecast(false); }, 15 * 60000);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && FC && Date.now() - Date.parse(FC.generatedAt) > 20 * 60000) loadForecast(false); });
let rz; window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => { if (!FC) return; if (!$("#fc").hidden) renderForecast(); if (!$("#dt").hidden) renderDetail(); if (!$("#rec").hidden) REC.render(); }, 250); });
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
})();
