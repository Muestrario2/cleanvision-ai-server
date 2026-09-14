/**
 * CleanVision AI — Servidor central v2
 * --------------------------------------
 * Ahora acepta dos modos de cámara (remota vía celular, directa vía laptop
 * + webcam), ambos mandan sus lecturas al mismo lugar, y cada lectura
 * puede venir etiquetada con una "locación" (nombre de la maqueta/escenario)
 * para poder comparar estadísticas entre maquetas distintas.
 *
 * NOTA sobre persistencia: todo esto vive en memoria (variable `state`).
 * Si el servidor se reinicia (por ejemplo, Render lo pone a dormir y
 * despierta de nuevo), el historial se pierde. Para un historial que
 * sobreviva entre sesiones/días, hace falta una base de datos — ver
 * README-V2.md.
 */

const express = require("express");
const path = require("path");

const PORT = process.env.PORT || 4000;
const HISTORY_MAX = 40; // cuántas lecturas recientes se muestran en la tabla
const FULL_LOG_MAX = 5000; // cuántas lecturas se guardan para el export CSV
const CONNECTION_TIMEOUT_MS = 3000;

const MODEL_DIR = path.join(__dirname, "model");
const PUBLIC_DIR = path.join(__dirname, "public");

const app = express();
app.use(express.json({ limit: "5mb" }));
app.use(express.static(PUBLIC_DIR));
app.use("/model", express.static(MODEL_DIR));

// ============================================================
// Estado en memoria
// ============================================================

const state = {
  latestFrame: null,
  latestPrediction: null,
  allProbs: [],
  lastReportTime: 0,
  lastMode: null, // "remoto" | "directo"
  lastLocation: null,
  history: [], // últimas HISTORY_MAX lecturas (para la tabla)
  fullLog: [], // hasta FULL_LOG_MAX lecturas (para exportar CSV)
  session: {
    startTime: Date.now(),
    totalReadings: 0,
    perClass: {}, // className -> { count, confidenceSum }
  },
  byLocation: {}, // locationName -> { totalReadings, perClass: {...} }
};

function ensureLocation(name) {
  if (!state.byLocation[name]) {
    state.byLocation[name] = { totalReadings: 0, perClass: {} };
  }
  return state.byLocation[name];
}

function registerReading({ className, confidence, location, mode }) {
  const loc = location || "Sin locación";

  // Estadísticas globales de sesión
  state.session.totalReadings += 1;
  if (!state.session.perClass[className]) state.session.perClass[className] = { count: 0, confidenceSum: 0 };
  state.session.perClass[className].count += 1;
  state.session.perClass[className].confidenceSum += confidence;

  // Estadísticas por locación
  const bucket = ensureLocation(loc);
  bucket.totalReadings += 1;
  if (!bucket.perClass[className]) bucket.perClass[className] = { count: 0, confidenceSum: 0 };
  bucket.perClass[className].count += 1;
  bucket.perClass[className].confidenceSum += confidence;

  const entry = {
    time: new Date().toLocaleTimeString("es-PE", { hour12: false }),
    timestamp: Date.now(),
    className,
    confidence,
    location: loc,
    mode: mode || "desconocido",
  };

  state.history.unshift(entry);
  if (state.history.length > HISTORY_MAX) state.history.pop();

  state.fullLog.push(entry);
  if (state.fullLog.length > FULL_LOG_MAX) state.fullLog.shift();
}

function summarizePerClass(perClassObj, classNames) {
  const total = Object.values(perClassObj).reduce((s, c) => s + c.count, 0);
  return classNames.map((name) => {
    const b = perClassObj[name] || { count: 0, confidenceSum: 0 };
    return {
      className: name,
      count: b.count,
      pctTime: total > 0 ? +((b.count / total) * 100).toFixed(1) : 0,
      avgConfidence: b.count > 0 ? +(b.confidenceSum / b.count).toFixed(1) : 0,
    };
  });
}

function buildSessionSummary(classNames) {
  const elapsedSec = Math.round((Date.now() - state.session.startTime) / 1000);
  return {
    totalReadings: state.session.totalReadings,
    elapsedSec,
    perClass: summarizePerClass(state.session.perClass, classNames),
  };
}

function buildLocationSummary(classNames) {
  return Object.entries(state.byLocation).map(([location, bucket]) => ({
    location,
    totalReadings: bucket.totalReadings,
    perClass: summarizePerClass(bucket.perClass, classNames),
  }));
}

// ============================================================
// Rutas
// ============================================================

app.post("/report", (req, res) => {
  const { className, confidence, all, frame, location, mode } = req.body || {};
  if (!className || typeof confidence !== "number") {
    return res.status(400).json({ error: "Falta className o confidence" });
  }

  state.latestPrediction = { className, confidence };
  state.allProbs = Array.isArray(all) ? all : [];
  state.lastReportTime = Date.now();
  state.lastMode = mode || null;
  state.lastLocation = location || null;

  registerReading({ className, confidence, location, mode });

  if (frame) {
    const base64 = frame.replace(/^data:image\/\w+;base64,/, "");
    state.latestFrame = Buffer.from(base64, "base64");
  }

  res.json({ ok: true });
});

app.get("/frame.jpg", (req, res) => {
  if (!state.latestFrame) return res.status(503).send("Todavía no llegó ningún frame.");
  res.set("Content-Type", "image/jpeg");
  res.set("Cache-Control", "no-store");
  res.send(state.latestFrame);
});

app.get("/stats.json", (req, res) => {
  const classNames = [...new Set(state.allProbs.map((p) => p.className))];
  const connected = Date.now() - state.lastReportTime < CONNECTION_TIMEOUT_MS && state.lastReportTime > 0;
  res.set("Cache-Control", "no-store");
  res.json({
    connected,
    mode: state.lastMode,
    location: state.lastLocation,
    top: state.latestPrediction,
    all: state.allProbs,
    history: state.history,
    session: buildSessionSummary(classNames),
    locations: buildLocationSummary(classNames),
  });
});

app.get("/export.csv", (req, res) => {
  const rows = ["hora,timestamp,locacion,modo,clase,confianza"];
  for (const r of state.fullLog) {
    rows.push(`${r.time},${r.timestamp},"${r.location}",${r.mode},${r.className},${r.confidence}`);
  }
  res.set("Content-Type", "text/csv; charset=utf-8");
  res.set("Content-Disposition", "attachment; filename=cleanvision_sesion.csv");
  res.send(rows.join("\n"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`\nCleanVision AI v2 — servidor corriendo en el puerto ${PORT}.`);
  console.log(`Entra a: http://localhost:${PORT}  (o tu URL de Render)\n`);
});
