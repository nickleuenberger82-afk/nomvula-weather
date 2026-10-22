# Nomvula Weather

Live weather, fire danger, walk and drive planning and daily records for Nomvula,
Klaserie Private Nature Reserve (-24.273728, 31.133282).

- **Forecast tab:** right now, heads-up alerts, next 24 hours, the week ahead, temperature arc, sun and moon, what to pack.
- **Detail tab:** per day walking window, drive timing, after-dark moon, Lowveld fire danger index, alerts, field notes, 48-hour chart, hour-by-hour table, model comparison, sun and moon table, sources.
- **Records tab:** month, year and all-time records, calendar, day-by-day chart, your own gauge and thermometer readings, CSV export and import.

## What runs where

| Part | File | What it does |
|---|---|---|
| Page | `public/` | The app itself. Works offline with the last forecast. |
| Forecast API | `netlify/functions/forecast.mjs` | `GET /api/forecast` builds the forecast from Open-Meteo, MET Norway (yr.no), six global models and the Hoedspruit (FAHS) station. Cached for 15 minutes. Other apps (the guest app, a morning brief) can read it as plain JSON. |
| Records API | `netlify/functions/records.mjs` | `GET /api/records` returns every day on record. `POST` saves your own readings and needs the passcode. |
| Hourly logger | `netlify/functions/logger.mjs` | Runs every hour on Netlify's scheduler. Logs a reading, updates today's and yesterday's record, fills any missing days (up to a month back) and refreshes the forecast cache. |

Records live in Netlify Blobs (store `nomvula-weather`). The records from the
old Nomvula Weather app (9 Oct 2026 onwards) are loaded the first time the app
runs. Days missing from the old app (15 to 17 Oct) are filled from Open-Meteo on
the logger's first run.

## Deploy

Drag-and-drop (Netlify Drop) won't work for this one, because it only uploads
the page and leaves out the functions. Use either route below.

### Route A: GitHub (recommended)

1. Create a new GitHub repository called `nomvula-weather` and upload everything
   in this folder (including `package-lock.json`).
2. In Netlify: **Add new site → Import an existing project → GitHub**, pick the repo.
   Netlify reads `netlify.toml`, so leave the build settings as they are.
3. In the site's **Site configuration → Environment variables**, add
   `WEATHER_PASSCODE` with a passcode of your choice. Without it the app still
   shows everything, but nobody can save readings.
4. **Deploys → Trigger deploy** so the passcode takes effect.

### Route B: Netlify CLI

```
npm install
npx netlify-cli login
npx netlify-cli init            # or: link, if the site already exists
npx netlify-cli env:set WEATHER_PASSCODE "your-passcode"
npx netlify-cli deploy --prod
```

The hourly logger only runs on the production deploy.

## After it's live

- Open the link on your phone and **Add to Home Screen**.
- On the Records tab, tap any day and enter the passcode once per phone to add
  rain, max/min or wind. Your rain readings feed the fire danger index.
- Netlify → **Logs → Functions → logger** shows each hourly run.
- To check everything at once: open `/api/forecast?fresh` in a browser.

## Local preview and tests

```
npm install
npm test                 # functions against saved API responses
node test/serve.mjs      # preview on http://localhost:8787, passcode "test"
```

Both use the saved responses in `test/fixtures` and a throwaway local store, so
they don't touch the live records.
