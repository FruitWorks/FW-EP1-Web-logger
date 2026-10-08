const SERVICE_UUID = "7d6b2a10-2f5d-4f6c-9d5f-1f4b9c0a1101";
const DATA_UUID = "7d6b2a11-2f5d-4f6c-9d5f-1f4b9c0a1101";
const DEVICE_PREFIX = "Fruitworks-EP1";
const PACKET_SIZE = 18;
const EMG_SAMPLES_PER_PACKET = 5;
const EMG_RATE = 500;
const GRAPH_RATE = 45;

const $ = id => document.getElementById(id);
const els = {
  connectBtn: $("connectBtn"), disconnectBtn: $("disconnectBtn"), recordBtn: $("recordBtn"), saveBtn: $("saveBtn"),
  status: $("status"), message: $("message"), canvas: $("emgCanvas"),
  samples: $("samples"), packets: $("packets"), lost: $("lost"), bad: $("bad"),
  ax: $("ax"), ay: $("ay"), az: $("az"), deviceName: $("deviceName"), streamRate: $("streamRate")
};

let device = null;
let server = null;
let characteristic = null;
let userDisconnect = false;
let reconnectTimer = null;
let reconnectAttempt = 0;
let reconnectBusy = false;

let lastSequence = null;
let packetCount = 0;
let lostPackets = 0;
let badPackets = 0;
let sampleCount = 0;
let streamStart = 0;
let lastRateUpdate = 0;
let samplesSinceRate = 0;

const DISPLAY_POINTS = 2500;
const graph = new Float32Array(DISPLAY_POINTS);
let graphWrite = 0;
let graphCount = 0;

let recording = false;
let csvRows = [];
let recordSampleIndex = 0;

function setStatus(text, kind="disconnected") {
  els.status.className = `status ${kind}`;
  els.status.lastChild.textContent = text;
}
function setMessage(text) { els.message.textContent = text; }
function setButtons() {
  const connected = !!(server && server.connected);
  els.connectBtn.disabled = connected || reconnectBusy;
  els.disconnectBtn.disabled = !device;
  els.recordBtn.disabled = !connected;
  els.recordBtn.textContent = recording ? "Stop Recording" : "Start Recording";
  els.saveBtn.disabled = csvRows.length === 0 || recording;
}
function resetStreamCounters() {
  lastSequence = null; packetCount = 0; lostPackets = 0; badPackets = 0; sampleCount = 0;
  streamStart = performance.now(); samplesSinceRate = 0;
  els.samples.textContent = "0"; els.packets.textContent = "0"; els.lost.textContent = "0"; els.bad.textContent = "0"; els.streamRate.textContent = "0 samples/s";
}

function resetGraph() { graph.fill(0); graphWrite = 0; graphCount = 0; }
function pushGraph(v) { graph[graphWrite] = v; graphWrite = (graphWrite + 1) % DISPLAY_POINTS; graphCount = Math.min(DISPLAY_POINTS, graphCount + 1); }

function parsePacket(dataView) {
  if (dataView.byteLength !== PACKET_SIZE) { badPackets++; els.bad.textContent = badPackets; return; }
  const seq = dataView.getUint16(0, true);
  const emg = new Int16Array(EMG_SAMPLES_PER_PACKET);
  for (let i=0;i<EMG_SAMPLES_PER_PACKET;i++) emg[i] = dataView.getInt16(2 + i*2, true);
  const ax = dataView.getInt16(12, true);
  const ay = dataView.getInt16(14, true);
  const az = dataView.getInt16(16, true);

  if (lastSequence !== null) {
    const delta = (seq - lastSequence + 65536) % 65536;
    if (delta > 1 && delta < 1000) lostPackets += delta - 1;
  }
  lastSequence = seq; packetCount++;
  els.packets.textContent = packetCount.toLocaleString();
  els.lost.textContent = lostPackets.toLocaleString();
  els.ax.textContent = `${ax} mg`; els.ay.textContent = `${ay} mg`; els.az.textContent = `${az} mg`;

  const now = performance.now();
  for (let i=0;i<EMG_SAMPLES_PER_PACKET;i++) {
    pushGraph(emg[i]);
    if (recording) csvRows.push(`${recordSampleIndex},${(recordSampleIndex/EMG_RATE).toFixed(6)},${emg[i]},${ax},${ay},${az},${seq}`);
    recordSampleIndex++;
  }
  sampleCount += EMG_SAMPLES_PER_PACKET;
  samplesSinceRate += EMG_SAMPLES_PER_PACKET;
  els.samples.textContent = sampleCount.toLocaleString();
  if (now - lastRateUpdate >= 1000) {
    els.streamRate.textContent = `${Math.round(samplesSinceRate * 1000 / (now-lastRateUpdate || 1))} samples/s`;
    samplesSinceRate = 0; lastRateUpdate = now;
  }
}

function onNotification(event) {
  try { parsePacket(event.target.value); } catch (e) { badPackets++; els.bad.textContent = badPackets; }
}

async function connectDevice(target=device) {
  if (!target) return false;
  reconnectBusy = true; setButtons(); setStatus("Connecting…", "connecting"); setMessage("Connecting to EP1…");
  try {
    if (!target.gatt) throw new Error("Bluetooth GATT is unavailable.");
    server = target.gatt.connected ? target.gatt : await target.gatt.connect();
    const service = await server.getPrimaryService(SERVICE_UUID);
    characteristic = await service.getCharacteristic(DATA_UUID);
    characteristic.removeEventListener("characteristicvaluechanged", onNotification);
    characteristic.addEventListener("characteristicvaluechanged", onNotification);
    await characteristic.startNotifications();
    device = target;
    device.removeEventListener("gattserverdisconnected", onDisconnected);
    device.addEventListener("gattserverdisconnected", onDisconnected);
    reconnectAttempt = 0; reconnectBusy = false;
    setStatus("Connected", "connected"); setMessage("Live EMG is streaming.");
    els.deviceName.textContent = device.name || DEVICE_PREFIX;
    resetStreamCounters(); resetGraph(); setButtons();
    return true;
  } catch (err) {
    reconnectBusy = false;
    setStatus("Connection failed", "error");
    setMessage(humanError(err));
    setButtons();
    return false;
  }
}

function humanError(err) {
  if (!err) return "Bluetooth connection failed.";
  if (err.name === "NotFoundError") return "No EP1 device was selected.";
  if (err.name === "NotSupportedError") return "Web Bluetooth is not available in this browser.";
  if (err.name === "SecurityError") return "Bluetooth is blocked by the browser or page security policy.";
  return err.message || String(err);
}

async function chooseDevice() {
  if (!navigator.bluetooth) { setStatus("Unsupported", "error"); setMessage("Open this app in Chromium/Chrome with Web Bluetooth support."); return; }
  userDisconnect = false;
  try {
    const target = await navigator.bluetooth.requestDevice({
      filters: [{ namePrefix: DEVICE_PREFIX, services: [SERVICE_UUID] }]
    });
    device = target;
    await connectDevice(device);
  } catch (err) {
    reconnectBusy = false;
    setStatus("Disconnected", "disconnected");
    setMessage(humanError(err));
    setButtons();
  }
}

async function autoConnectPreviouslyGranted() {
  if (!navigator.bluetooth?.getDevices) return;
  try {
    const devices = await navigator.bluetooth.getDevices();
    const target = devices.find(d => d.name && d.name.startsWith(DEVICE_PREFIX));
    if (target) {
      device = target;
      setMessage("Previously permitted EP1 found. Click Connect to start.");
    }
  } catch (_) {}
}

function onDisconnected() {
  characteristic = null; server = null;
  setStatus("Disconnected", "disconnected");
  if (userDisconnect) { setMessage("Disconnected by user."); setButtons(); return; }
  setMessage("EP1 disconnected. Reconnecting…");
  scheduleReconnect();
}

function scheduleReconnect() {
  if (userDisconnect || !device || reconnectTimer || reconnectBusy) return;
  const delay = Math.min(8000, 500 * Math.pow(2, reconnectAttempt++));
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    if (userDisconnect || !device) return;
    const ok = await connectDevice(device);
    if (!ok && !userDisconnect) scheduleReconnect();
  }, delay);
}

async function disconnectUser() {
  userDisconnect = true;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  reconnectAttempt = 0; reconnectBusy = false;
  try { if (characteristic) characteristic.removeEventListener("characteristicvaluechanged", onNotification); } catch (_) {}
  try { if (device?.gatt?.connected) device.gatt.disconnect(); } catch (_) {}
  characteristic = null; server = null;
  setStatus("Disconnected", "disconnected"); setMessage("Disconnected by user."); setButtons();
}

function startRecording() {
  if (!server?.connected) return;
  recording = true; csvRows = []; recordSampleIndex = 0;
  setMessage("Recording raw EMG and accelerometer data…"); setButtons();
}
function stopRecording() { recording = false; setMessage(`Recording stopped: ${recordSampleIndex.toLocaleString()} samples.`); setButtons(); }
function saveCSV() {
  if (!csvRows.length) return;
  const header = "sample_index,time_s,emg,ax_mg,ay_mg,az_mg,packet_sequence\n";
  const blob = new Blob([header + csvRows.join("\n") + "\n"], {type:"text/csv;charset=utf-8"});
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().replace(/[:.]/g,"-"); a.download = `Fruitworks_EP1_${stamp}.csv`;
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function draw() {
  const c = els.canvas, ctx = c.getContext("2d");
  const w = c.width, h = c.height; ctx.clearRect(0,0,w,h);
  ctx.strokeStyle = "#171717"; ctx.lineWidth = 1;
  for (let i=1;i<8;i++) { const y=i*h/8; ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke(); }
  for (let i=1;i<10;i++) { const x=i*w/10; ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke(); }
  if (!graphCount) { requestAnimationFrame(draw); return; }
  let max=2000; for(let i=0;i<graphCount;i++) max=Math.max(max,Math.abs(graph[i])); max*=1.15;
  ctx.strokeStyle="#e04a16"; ctx.lineWidth=2; ctx.beginPath();
  const start=(graphWrite-graphCount+DISPLAY_POINTS)%DISPLAY_POINTS;
  for(let i=0;i<graphCount;i++) { const idx=(start+i)%DISPLAY_POINTS; const x=i/(DISPLAY_POINTS-1)*w; const y=h/2-(graph[idx]/max)*(h*0.44); if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y); }
  ctx.stroke(); requestAnimationFrame(draw);
}

els.connectBtn.addEventListener("click", chooseDevice);
els.disconnectBtn.addEventListener("click", disconnectUser);
els.recordBtn.addEventListener("click", () => recording ? stopRecording() : startRecording());
els.saveBtn.addEventListener("click", saveCSV);

if (!window.isSecureContext) { setStatus("HTTPS required", "error"); setMessage("Web Bluetooth requires a secure context. Serve this app over HTTPS."); }
else if (!navigator.bluetooth) { setStatus("Unsupported", "error"); setMessage("Open this app in Chromium/Chrome with Web Bluetooth support."); }
else { autoConnectPreviouslyGranted(); }

setButtons();
lastRateUpdate = performance.now();
draw();
