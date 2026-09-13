// ============================================================
// CONFIGURACIÓN
// ============================================================
const MODEL_URL = "/model/"; // el mismo servidor sirve el modelo, sin CORS ni links externos
const REPORT_INTERVAL_MS = 900; // cada cuánto se envía un reporte al servidor
const JPEG_QUALITY = 0.6; // calidad de la foto enviada (más baja = más liviano y rápido)

// ============================================================

const deviceSelect = document.getElementById("deviceSelect");
const startBtn = document.getElementById("startBtn");
const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const sendDot = document.getElementById("sendDot");
const statusText = document.getElementById("statusText");
const lastClass = document.getElementById("lastClass");
const lastConf = document.getElementById("lastConf");
const sentCount = document.getElementById("sentCount");

let model, running = false, sentTotal = 0;

async function listCameras() {
  // Pide permiso una vez para que el navegador muestre los nombres reales de cámara
  try {
    const tmp = await navigator.mediaDevices.getUserMedia({ video: true });
    tmp.getTracks().forEach((t) => t.stop());
  } catch (err) {
    statusText.textContent = "Permiso de cámara denegado";
    throw err;
  }

  const devices = await navigator.mediaDevices.enumerateDevices();
  const cameras = devices.filter((d) => d.kind === "videoinput");

  deviceSelect.innerHTML = "";
  cameras.forEach((cam, i) => {
    const opt = document.createElement("option");
    opt.value = cam.deviceId;
    opt.textContent = cam.label || `Cámara ${i + 1}`;
    deviceSelect.appendChild(opt);
  });

  if (cameras.length === 0) {
    deviceSelect.innerHTML = "<option>No se encontró ninguna cámara</option>";
  }
}

async function startCamera(deviceId) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { deviceId: deviceId ? { exact: deviceId } : undefined },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();
}

async function loadModel() {
  model = await tmImage.load(MODEL_URL + "model.json", MODEL_URL + "metadata.json");
}

function captureFrameAsJPEG() {
  const w = video.videoWidth, h = video.videoHeight;
  if (!w || !h) return null;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}

async function sendReport(top, all, frameDataUrl) {
  try {
    await fetch("/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        className: top.className,
        confidence: top.confidence,
        all,
        frame: frameDataUrl,
      }),
    });
    sentTotal += 1;
    sentCount.textContent = String(sentTotal);
    sendDot.className = "on";
    setTimeout(() => (sendDot.className = ""), 200);
  } catch (err) {
    console.error("No se pudo enviar el reporte:", err);
  }
}

async function loop() {
  if (!running) return;
  const predictions = await model.predict(video);
  const all = predictions.map((p) => ({ className: p.className, confidence: +(p.probability * 100).toFixed(1) }));
  let top = all[0];
  for (const p of all) if (p.confidence > top.confidence) top = p;

  lastClass.textContent = top.className;
  lastConf.textContent = top.confidence.toFixed(1) + "%";

  const frame = captureFrameAsJPEG();
  await sendReport(top, all, frame);

  setTimeout(loop, REPORT_INTERVAL_MS);
}

async function start() {
  startBtn.disabled = true;
  startBtn.textContent = "Cargando…";
  try {
    statusText.textContent = "Cargando modelo…";
    await loadModel();

    statusText.textContent = "Abriendo cámara…";
    await startCamera(deviceSelect.value);

    running = true;
    statusText.textContent = "Enviando en vivo";
    startBtn.textContent = "Corriendo";
    loop();
  } catch (err) {
    console.error(err);
    statusText.textContent = "Error: " + err.message;
    startBtn.disabled = false;
    startBtn.textContent = "Reintentar";
  }
}

listCameras().catch(() => {});
startBtn.addEventListener("click", start);
