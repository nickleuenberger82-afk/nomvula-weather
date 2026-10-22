# Builds test fixtures in each API's own response shape from the MET Norway sample
# (fetched 21 Oct 2026, 19:18 UTC run). The Open-Meteo and model fixtures are
# derived from it so the parsers and the logic can be exercised offline.
import csv, json, math, datetime as dt
rows = list(csv.DictReader(open('fixtures/met1.csv'))) + list(csv.DictReader(open('fixtures/met2.csv')))
f = lambda v: None if v in ('', None) else float(v)
ts = []
for r in rows:
    e = {"time": r["time"], "data": {"instant": {"details": {k2: f(r[k]) for k, k2 in [("t","air_temperature"),("rh","relative_humidity"),("td","dew_point_temperature"),("ws","wind_speed"),("dir","wind_from_direction"),("cloud","cloud_area_fraction"),("uv","ultraviolet_index_clear_sky")] if f(r[k]) is not None}}}}
    if r["s1"]: e["data"]["next_1_hours"] = {"summary": {"symbol_code": r["s1"]}, "details": {"precipitation_amount": f(r["p1"]) or 0}}
    if r["s6"]:
        d6 = {"precipitation_amount": f(r["p6"]) or 0}
        if r.get("tmax6"): d6["air_temperature_max"] = f(r["tmax6"]); d6["air_temperature_min"] = f(r["tmin6"])
        e["data"]["next_6_hours"] = {"summary": {"symbol_code": r["s6"]}, "details": d6}
    ts.append(e)
json.dump({"type": "Feature", "properties": {"meta": {"updated_at": "2026-10-21T19:18:02Z"}, "timeseries": ts}}, open('fixtures/met.json', 'w'))
# hourly series in SAST, interpolated across the 6-hourly part
pts = [(dt.datetime.fromisoformat(r["time"].replace('Z', '+00:00')), r) for r in rows]
start = dt.datetime(2026, 10, 21, 22, tzinfo=dt.timezone.utc)  # 00:00 SAST 22 Oct
sym = {"clearsky": 0, "fair": 1, "partlycloudy": 2, "cloudy": 3}
H = {k: [] for k in ["time","temperature_2m","apparent_temperature","relative_humidity_2m","dew_point_2m","precipitation","precipitation_probability","weather_code","cloud_cover","wind_speed_10m","wind_direction_10m","wind_gusts_10m","uv_index","is_day"]}
def interp(t, k):
    for (a, ra), (b, rb) in zip(pts, pts[1:]):
        if a <= t <= b and f(ra[k]) is not None and f(rb[k]) is not None:
            u = (t - a) / (b - a); return f(ra[k]) + (f(rb[k]) - f(ra[k])) * u
    return None
t = start
while t < start + dt.timedelta(days=8):
    loc = t + dt.timedelta(hours=2)
    T = interp(t, "t")
    if T is None: t += dt.timedelta(hours=1); continue
    rh = interp(t, "rh"); ws = (interp(t, "ws") or 0) * 3.6
    near = min(pts, key=lambda p: abs(p[0] - t))[1]; s = (near["s1"] or near["s6"] or "cloudy").split('_')[0]
    H["time"].append(loc.strftime('%Y-%m-%dT%H:00')); H["temperature_2m"].append(round(T, 1)); H["apparent_temperature"].append(round(T + (2 if rh and rh > 50 else -1), 1))
    H["relative_humidity_2m"].append(round(rh)); H["dew_point_2m"].append(round(interp(t, "td") or 0, 1)); H["precipitation"].append(0.0)
    H["precipitation_probability"].append(5); H["weather_code"].append(sym.get(s, 3)); H["cloud_cover"].append(round(interp(t, "cloud") or 0))
    H["wind_speed_10m"].append(round(ws, 1)); d = interp(t, "dir"); H["wind_direction_10m"].append(round(near_dir := f(near["dir"]))); H["wind_gusts_10m"].append(round(ws * 1.6, 1))
    H["uv_index"].append(round(interp(t, "uv") or 0, 1)); H["is_day"].append(1 if 5 <= loc.hour < 18 else 0)
    t += dt.timedelta(hours=1)
# Saturday afternoon storm so the wet logic gets exercised
for i, s in enumerate(H["time"]):
    if s.startswith('2026-10-24T1') and 14 <= int(s[11:13]) <= 17: H["weather_code"][i] = 95 if s[11:13] == '15' else 80; H["precipitation"][i] = 1.2; H["precipitation_probability"][i] = 60
days = sorted(set(s[:10] for s in H["time"]))
D = {"time": days}
for k, fn in [("temperature_2m_max", max), ("temperature_2m_min", min)]:
    D[k] = [fn(v for s, v in zip(H["time"], H["temperature_2m"]) if s.startswith(d)) for d in days]
D["precipitation_sum"] = [round(sum(v for s, v in zip(H["time"], H["precipitation"]) if s.startswith(d)), 1) for d in days]
D["precipitation_probability_max"] = [max(v for s, v in zip(H["time"], H["precipitation_probability"]) if s.startswith(d)) for d in days]
D["weather_code"] = [0] * len(days); D["wind_speed_10m_max"] = [0] * len(days); D["wind_gusts_10m_max"] = [0] * len(days); D["uv_index_max"] = [12] * len(days)
om = {"latitude": -24.27, "longitude": 31.13, "utc_offset_seconds": 7200, "timezone": "Africa/Johannesburg",
      "current": {"time": "2026-10-22T05:45", "interval": 900, "temperature_2m": 24.9, "apparent_temperature": 26.0, "relative_humidity_2m": 60, "weather_code": 0, "wind_speed_10m": 23.4, "wind_direction_10m": 143, "wind_gusts_10m": 37.1, "precipitation": 0.0, "is_day": 1},
      "hourly": H, "daily": D}
json.dump(om, open('fixtures/openmeteo.json', 'w'))
offs = {"ecmwf_ifs025": (0.6, -0.4, 1.0), "gfs_seamless": (1.8, 0.5, 0.0), "icon_seamless": (-0.7, 0.2, 1.5), "ukmo_seamless": (0.3, -0.8, 0.4), "meteofrance_seamless": (1.1, 0.0, 2.2), "gem_seamless": (-1.4, 0.9, 0.0)}
M = {"time": days}
for m, (a, b, rr) in offs.items():
    M[f"temperature_2m_max_{m}"] = [round(v + a, 1) for v in D["temperature_2m_max"]]
    M[f"temperature_2m_min_{m}"] = [round(v + b, 1) for v in D["temperature_2m_min"]]
    M[f"precipitation_sum_{m}"] = [round(rr if d == '2026-10-24' else 0.0, 1) for d in days]
json.dump({"daily": M}, open('fixtures/models.json', 'w'))
metar = []
for i, (h, tt, td, wd, wk) in enumerate([(22, 25, 15, 340, 1), (23, 24, 16, 310, 3), (0, 24, 15, 280, 2), (1, 23, 15, 280, 2), (2, 22, 16, 170, 3), (3, 21, 14, 160, 7)]):
    day = 21 if h >= 22 else 22
    o = dt.datetime(2026, 10, day, h, tzinfo=dt.timezone.utc)
    metar.append({"icaoId": "FAHS", "obsTime": int(o.timestamp()), "reportTime": o.strftime('%Y-%m-%dT%H:%M:%S.000Z'), "temp": tt, "dewp": td, "wdir": wd, "wspd": wk, "rawOb": f"METAR FAHS {o.strftime('%d%H%M')}Z AUTO {wd:03d}{wk:02d}KT //// // ////// {tt}/{td} Q1012", "name": "Hoedspruit Arpt, MP, ZA"})
json.dump(metar[::-1], open('fixtures/metar.json', 'w'))
print(len(H["time"]), "hours", days)
