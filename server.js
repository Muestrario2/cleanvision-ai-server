/**
 * CleanVision AI — Servidor central (corre en la laptop, en el WiFi de la feria)
 * --------------------------------------------------------------------------------
 * Este servidor hace tres trabajos:
 *
 *  1. Sirve /cart.html al celular montado en el camión. Esa página abre la
 *     cámara (la webcam externa o la propia del celular, lo que elijan) y
 *     corre la IA DIRECTO en el navegador del celular — no necesita nada
 *     instalado, solo Chrome.
 *
 *  2. Recibe (POST /report) el resultado de cada clasificación que el
 *     celular calculó, junto con una foto comprimida del momento.
 *
 *  3. Sirve el panel de resultados (GET /) para que cualquier otro celular
 *     o laptop, conectado al mismo WiFi, vea el video y las estadísticas
 *     en vivo.
 *
 * Uso:
 *   npm install
 *   npm start
 *   (deja esto corriendo durante toda la demo)
 */

const express = require("express");
const path = require("path");

const PORT = 4000;
const HISTORY_MAX = 25;
const CONNECTION_TIMEOUT_MS = 3000; // si no llega un reporte en este tiempo, se considera "sin señal"

const MODEL_DIR = path.join(__dirname, "model");
const PUBLIC_DIR = path.join(__dirname, "public");

const app = express();
app.use(express.json({ limit: "5mb" })); // el POST /report incluye una foto en base64
app.use(express.static(PUBLIC_DIR));
app.use("/model", express.static(MODEL_DIR)); // el celular carga el modelo desde aquí

// ============================================================
// Estado en memoria
// ============================================================

const state = {
  latestFrame: null, // Buffer JPEG
  latestPrediction: null, // { className, confidence }
  allProbs: [],
  lastReportTime: 0,
  history: [],
  session: {
    startTime: Date.now(),
    totalReadings: 0,
    perClass: {}, // className -> { count, confidenceSum }
  },
};

function registerReading(prediction) {
  state.session.totalReadings += 1;
  if (!state.session.perClass[prediction.className]) {
    state.session.perClass[prediction.className] = { count: 0, confidenceSum: 0 };
  }
  const bucket = state.session.perClass[prediction.className];
  bucket.count += 1;
  bucket.confidenceSum += prediction.confidence;

  state.history.unshift({
    time: new Date().toLocaleTimeString("es-PE", { hour12: false }),
    className: prediction.className,
    confidence: prediction.confidence,
  });
  if (state.history.length > HISTORY_MAX) state.history.pop();
}

function buildSessionSummary(classNames) {
  const total = state.session.totalReadings;
  const elapsedSec = Math.round((Date.now() - state.session.startTime) / 1000);
  const perClass = classNames.map((name) => {
    const bucket = state.session.perClass[name] || { count: 0, confidenceSum: 0 };
    return {
      className: name,
      count: bucket.count,
      pctTime: total > 0 ? +((bucket.count / total) * 100).toFixed(1) : 0,
      avgConfidence: bucket.count > 0 ? +(bucket.confidenceSum / bucket.count).toFixed(1) : 0,
    };
  });
  return { totalReadings: total, elapsedSec, perClass };
}

// ============================================================
// Rutas
// ============================================================

// El celular (cart.html) manda esto cada ~1 segundo.
app.post("/report", (req, res) => {
  const { className, confidence, all, frame } = req.body || {};
  if (!className || typeof confidence !== "number") {
    return res.status(400).json({ error: "Falta className o confidence" });
  }

  state.latestPrediction = { className, confidence };
  state.allProbs = Array.isArray(all) ? all : [];
  state.lastReportTime = Date.now();
  registerReading({ className, confidence });

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
  const classNames = state.allProbs.map((p) => p.className);
  const connected = Date.now() - state.lastReportTime < CONNECTION_TIMEOUT_MS && state.lastReportTime > 0;
  res.set("Cache-Control", "no-store");
  res.json({
    connected,
    top: state.latestPrediction,
    all: state.allProbs,
    history: state.history,
    session: buildSessionSummary(classNames.length ? classNames : Object.keys(state.session.perClass)),
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`\nCleanVision AI — servidor central corriendo.\n`);
  console.log(`En el celular del camión, abre en Chrome:`);
  console.log(`   http://<IP-de-esta-laptop>:${PORT}/cart.html\n`);
  console.log(`Para ver el panel en vivo desde cualquier otro dispositivo:`);
  console.log(`   http://<IP-de-esta-laptop>:${PORT}\n`);
  console.log(`Para saber la IP de esta laptop: Windows -> ipconfig, Mac/Linux -> ifconfig`);
});
