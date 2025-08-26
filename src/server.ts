// src/server.ts
import "dotenv/config";
import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || "3000";
const API_BASE = "https://aeroapi.flightaware.com/aeroapi";
const API_KEY = process.env.FLIGHTAWARE_API_KEY;

// util: ventana [00:00Z, +1 día) para YYYY-MM-DD
function dayWindow(dateOnly: string) {
  const startDate = new Date(`${dateOnly}T00:00:00Z`);
  const endDate = new Date(startDate.getTime() + 24 * 3600 * 1000);
  return { start: startDate.toISOString(), end: endDate.toISOString(), endDate };
}

// util: parsea "IB1234" → { airline:"IB", flightNumber:"1234" }
function splitIdent(ident: string) {
  const m = ident.trim().toUpperCase().match(/^([A-Z]{2,3})(\d{1,4}[A-Z]?)$/);
  if (!m) return null;
  const airline = m[1];
  const digits = (m[2].match(/\d+/) || [""])[0];
  return { airline, flightNumber: digits };
}

// log básico
app.use((req, _res, next) => { console.log(`${new Date().toISOString()} ${req.method} ${req.path}`); next(); });

// healthcheck (para Railway)
app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok", apiKey: API_KEY ? "present" : "missing", now: new Date().toISOString() });
});

// (opcional) Resolver identificador canónico IATA/ICAO
app.get("/api/flights/:ident/canonical", async (req, res) => {
  try {
    if (!API_KEY) return res.status(500).json({ error: "API key missing" });
    const url = `${API_BASE}/flights/${encodeURIComponent(req.params.ident)}/canonical`;
    const r = await fetch(url, { headers: { "x-apikey": API_KEY, Accept: "application/json" } });
    const text = await r.text();
    return res.status(r.status).type("application/json").send(text);
  } catch (e: any) {
    res.status(500).json({ error: "Proxy error", details: String(e?.message || e) });
  }
});

// endpoint unificado (decide flights vs schedules según la fecha)
app.get("/api/flight/by-date", async (req, res) => {
  try {
    if (!API_KEY) return res.status(500).json({ error: "API key missing" });

    const ident = String(req.query.ident || "").trim(); // p.ej. IB1234
    const date  = String(req.query.date  || "").trim(); // YYYY-MM-DD
    if (!ident || !date) return res.status(400).json({ error: "ident and date are required" });

    const { start, end, endDate } = dayWindow(date);
    const diffHours = (new Date(`${date}T00:00:00Z`).getTime() - Date.now()) / 36e5;

    let url: string;

    if (diffHours > 48) {
      // → FUTURO LEJANO: schedules (hasta ~12 meses)
      const parsed = splitIdent(ident);
      if (!parsed) return res.status(400).json({ error: "ident format not recognized (e.g., IB1234)" });
      const date_end = endDate.toISOString().slice(0, 10); // YYYY-MM-DD
      url =
        `${API_BASE}/schedules/${date}/${date_end}` +
        `?airline=${encodeURIComponent(parsed.airline)}` +
        `&flight_number=${encodeURIComponent(parsed.flightNumber)}` +
        `&max_pages=1`;
    } else {
      // → ≤48h: flights (estado en tiempo real; límite +2 días)
      url =
        `${API_BASE}/flights/${encodeURIComponent(ident)}` +
        `?start=${encodeURIComponent(start)}` +
        `&end=${encodeURIComponent(end)}` +
        `&ident_type=designator&max_pages=1`;
    }

    const r = await fetch(url, { headers: { "x-apikey": API_KEY, Accept: "application/json" } });
    const text = await r.text();
    return res.status(r.status).type("application/json").send(text);
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: "Proxy error", details: String(e?.message || e) });
  }
});

// alias REST cómodo: /api/flights/:ident/by-date/:date
app.get("/api/flights/:ident/by-date/:date", (req, res) => {
  const qs = new URLSearchParams({ ident: req.params.ident, date: req.params.date }).toString();
  res.redirect(307, `/api/flight/by-date?${qs}`);
});

// 404
app.use("*", (req, res) => res.status(404).json({ error: "Not found", path: req.originalUrl }));

app.listen(Number(PORT), "0.0.0.0", () => console.log(`✅ API listening on :${PORT}`));
