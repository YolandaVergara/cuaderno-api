// src/server.ts
import express from "express";
import cors from "cors";
import "dotenv/config"

const app = express();
app.use(cors());
app.use(express.json());

const PORT = parseInt(process.env.PORT || "3000", 10);
const API_BASE = "https://aeroapi.flightaware.com/aeroapi";
const API_KEY = process.env.FLIGHTAWARE_API_KEY;

if (!API_KEY) {
  console.warn("⚠️ Falta FLIGHTAWARE_API_KEY en variables de entorno");
}

// Utilidad: ventana [00:00Z, +1 día 00:00Z] para una fecha YYYY-MM-DD
function dayWindowISO(dateOnly: string) {
  const startDate = new Date(`${dateOnly}T00:00:00Z`);
  const start = startDate.toISOString();
  const end = new Date(startDate.getTime() + 24 * 3600 * 1000).toISOString();
  return { start, end };
}

// Health
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    apiKey: API_KEY ? "present" : "missing",
    now: new Date().toISOString(),
  });
});
// GET /api/flight/by-date?ident=IB1234&date=2025-09-01
app.get("/api/flight/by-date", async (req, res) => {
  try {
    const API_KEY = process.env.FLIGHTAWARE_API_KEY;
    if (!API_KEY) return res.status(500).json({ error: "API key missing" });

    const ident = String(req.query.ident || "").trim();
    const date = String(req.query.date || "").trim();
    if (!ident || !date) {
      return res.status(400).json({ error: "ident and date are required" });
    }

    const startDate = new Date(date + "T00:00:00Z");
    const diffMs = startDate.getTime() - Date.now();
    const diffHours = diffMs / 36e5;

    if (diffHours > 48) {

      const m = ident.match(/^([A-Z]{2,3})(\d{1,4}[A-Z]?)$/i);
      if (!m) return res.status(400).json({ error: "ident format not recognized" });
      const airline = m[1].toUpperCase();          
      const flightNumber = m[2].replace(/\D/g, "");

      const endDate = new Date(startDate.getTime() + 24 * 3600 * 1000);
      const url =
        `https://aeroapi.flightaware.com/aeroapi/schedules/${date}/${endDate.toISOString().slice(0,10)}` +
        `?airline=${encodeURIComponent(airline)}&flight_number=${encodeURIComponent(flightNumber)}&max_pages=1`;

      const r = await fetch(url, { headers: { "x-apikey": API_KEY, Accept: "application/json" } });
      const text = await r.text();
      if (!r.ok) return res.status(r.status).send(text);

      return res.type("application/json").send(text);
    } else {
      const startISO = startDate.toISOString();
      const endISO = new Date(startDate.getTime() + 24 * 3600 * 1000).toISOString();
      const url =
        `https://aeroapi.flightaware.com/aeroapi/flights/${encodeURIComponent(ident)}` +
        `?start=${encodeURIComponent(startISO)}&end=${encodeURIComponent(endISO)}&ident_type=designator&max_pages=1`;

      const r = await fetch(url, { headers: { "x-apikey": API_KEY, Accept: "application/json" } });
      const text = await r.text();
      return res.status(r.status).type("application/json").send(text);
    }
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: "Proxy error", details: String(e?.message || e) });
  }
});

app.get("/api/flights/:ident/canonical", async (req, res) => {
  try {
    if (!API_KEY) return res.status(500).json({ error: "API key missing" });
    const url = `${API_BASE}/flights/${encodeURIComponent(
      req.params.ident
    )}/canonical`;

    const r = await fetch(url, { headers: { "x-apikey": API_KEY, Accept: "application/json" } });
    const text = await r.text();
    return res.status(r.status).type("application/json").send(text);
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: "Proxy error", details: String(e?.message || e) });
  }
});

app.get("/api/flights/:ident/by-date/:date", async (req, res) => {
  try {
    if (!API_KEY) return res.status(500).json({ error: "API key missing" });

    const { ident, date } = req.params;
    const { start, end } = dayWindowISO(date); // [00:00Z, +1d 00:00Z)

    // ident_type=designator ayuda cuando pasas IATA (IB1234) en vez de ICAO (IBE1234)
    const url =
      `${API_BASE}/flights/${encodeURIComponent(ident)}` +
      `?start=${encodeURIComponent(start)}` +
      `&end=${encodeURIComponent(end)}` +
      `&ident_type=designator&max_pages=1`;

    const r = await fetch(url, { headers: { "x-apikey": API_KEY, Accept: "application/json" } });
    const text = await r.text();
    return res.status(r.status).type("application/json").send(text);
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: "Proxy error", details: String(e?.message || e) });
  }
});

// 404
app.use("*", (req, res) => {
  res.status(404).json({ error: "Not found", path: req.originalUrl });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server on :${PORT}`);
});

export default app;
