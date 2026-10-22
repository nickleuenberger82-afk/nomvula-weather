/* Local preview: serves /public and runs the functions against saved API
   responses (test/fixtures) and a throwaway file store. Not deployed.
   Usage: node test/serve.mjs [port] */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.dirname(fileURLToPath(import.meta.url));
process.env.WX_FIXTURES ||= path.join(root, "fixtures");
process.env.WX_LOCAL_STORE ||= path.join(root, "..", ".wx-store");
process.env.WEATHER_PASSCODE ||= "test";
const fns = { "/api/forecast": (await import("../netlify/functions/forecast.mjs")).default, "/api/records": (await import("../netlify/functions/records.mjs")).default };
const { logOnce } = await import("../netlify/functions/logger.mjs");
await logOnce();
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".webmanifest": "application/manifest+json", ".json": "application/json", ".woff2": "font/woff2" };
const port = +process.argv[2] || 8787;
http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://localhost:${port}`);
  if (fns[u.pathname]) {
    const body = req.method === "POST" ? await new Promise(r => { let b = ""; req.on("data", c => (b += c)); req.on("end", () => r(b)); }) : undefined;
    const out = await fns[u.pathname](new Request(u, { method: req.method, headers: req.headers, body }));
    res.writeHead(out.status, Object.fromEntries(out.headers)); res.end(Buffer.from(await out.arrayBuffer())); return;
  }
  let p = path.join(root, "..", "public", u.pathname === "/" ? "index.html" : u.pathname);
  if (process.env.WX_FONTS && u.pathname.startsWith("/__fonts/")) p = path.join(process.env.WX_FONTS, path.basename(u.pathname));
  fs.readFile(p, (err, data) => { if (err) { res.writeHead(404); res.end("not found"); return; } res.writeHead(200, { "Content-Type": TYPES[path.extname(p)] || "application/octet-stream" }); res.end(data); });
}).listen(port, () => console.log(`Preview on http://localhost:${port}`));
