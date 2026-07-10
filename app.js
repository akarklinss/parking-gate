const STORAGE_KEY = "parkingGateConfigV2";

const state = {
  mode: "entry",
  config: null,
  lastSource: "MANUAL"
};

const $ = id => document.getElementById(id);

window.addEventListener("DOMContentLoaded", init);

async function init() {
  bindEvents();
  applyQueryConfiguration();

  const saved = loadConfig();
  if (saved) fillSetup(saved);

  if (saved && saved.apiUrl && saved.gate && saved.guard) {
    state.config = saved;
    ApiClient.configure(saved);
    showWorkScreen();
    await refreshStats();
  } else {
    showSetupScreen();
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js?v=200").catch(() => {});
  }
}

function bindEvents() {
  $("saveSetupBtn").addEventListener("click", saveSetup);
  $("settingsBtn").addEventListener("click", showSetupScreen);

  $("entryModeBtn").addEventListener("click", () => setMode("entry"));
  $("exitModeBtn").addEventListener("click", () => setMode("exit"));

  $("startCameraBtn").addEventListener("click", startCamera);
  $("scanPlateBtn").addEventListener("click", scanPlate);

  $("processBtn").addEventListener("click", processPlate);
  $("clearBtn").addEventListener("click", clearWorkForm);
  $("plateInput").addEventListener("input", normalizePlateInput);
  $("plateInput").addEventListener("keydown", event => {
    if (event.key === "Enter") processPlate();
  });

  $("adminBtn").addEventListener("click", openAdmin);
  $("statTotalBtn").addEventListener("click", openAdmin);
  $("closeAdminBtn").addEventListener("click", () => $("adminDialog").close());
  $("refreshAdminBtn").addEventListener("click", loadAdmin);
}

function applyQueryConfiguration() {
  const params = new URLSearchParams(location.search);
  const api = params.get("api");
  const event = params.get("event");
  const key = params.get("key");

  if (api) $("apiUrlInput").value = api;
  if (event) $("eventNameInput").value = event;
  if (key) $("eventKeyInput").value = key;
}

function fillSetup(config) {
  $("eventNameInput").value = config.eventName || "";
  $("apiUrlInput").value = config.apiUrl || "";
  $("eventKeyInput").value = config.eventKey || "";
  $("gateInput").value = config.gate || "";
  $("guardInput").value = config.guard || "";
}

function collectSetup() {
  return {
    eventName: $("eventNameInput").value.trim() || "Parking Gate",
    apiUrl: $("apiUrlInput").value.trim(),
    eventKey: $("eventKeyInput").value.trim(),
    gate: $("gateInput").value.trim(),
    guard: $("guardInput").value.trim()
  };
}

async function saveSetup() {
  const config = collectSetup();
  const message = $("setupMessage");
  message.className = "message";

  if (!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec(?:\?.*)?$/i.test(config.apiUrl)) {
    message.textContent = "Ievadi derīgu Apps Script Web App /exec adresi.";
    message.classList.add("error");
    return;
  }
  if (!config.gate || !config.guard) {
    message.textContent = "Ievadi Gate un apsarga vārdu vai ID.";
    message.classList.add("error");
    return;
  }

  $("saveSetupBtn").disabled = true;
  message.textContent = "Pārbauda savienojumu…";

  try {
    ApiClient.configure(config);
    const result = await ApiClient.ping();

    if (!result.ok) throw new Error(result.error || "API neatbildēja pareizi.");

    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    state.config = config;
    message.textContent = "Savienojums darbojas.";
    message.classList.add("success");
    showWorkScreen();
    await refreshStats();
  } catch (error) {
    message.textContent = error.message;
    message.classList.add("error");
  } finally {
    $("saveSetupBtn").disabled = false;
  }
}

function loadConfig() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  } catch (_) {
    return null;
  }
}

function showSetupScreen() {
  CameraController.stop();
  $("workScreen").classList.add("hidden");
  $("setupScreen").classList.remove("hidden");
  if (state.config) fillSetup(state.config);
}

function showWorkScreen() {
  $("setupScreen").classList.add("hidden");
  $("workScreen").classList.remove("hidden");

  const config = state.config || collectSetup();
  $("eventTitle").textContent = config.eventName || "Parking Gate";
  $("gateLabel").textContent = config.gate || "Gate";
  $("guardLabel").textContent = config.guard || "Apsargs";
  $("adminEventName").textContent = config.eventName || "Parking Gate";
  updateProcessButton();
}

function setMode(mode) {
  state.mode = mode;

  $("entryModeBtn").classList.toggle("active", mode === "entry");
  $("exitModeBtn").classList.toggle("active", mode === "exit");
  $("exitModeBtn").classList.toggle("exit", mode === "exit");

  updateProcessButton();
  showResult("neutral", "ⓘ",
    mode === "entry" ? "Iebraukšanas režīms" : "Izbraukšanas režīms",
    "", "Nolasiet vai ievadiet auto numuru.");
}

function updateProcessButton() {
  $("processBtn").textContent =
    state.mode === "entry" ? "PĀRBAUDĪT / IELAIST" : "REĢISTRĒT IZBRAUKŠANU";
}

async function startCamera() {
  $("startCameraBtn").disabled = true;
  $("cameraStatus").textContent = "Ieslēdz kameru…";

  try {
    await CameraController.start();
    $("cameraStatus").textContent =
      "Kamera gatava. Novieto numurzīmi baltajā rāmī.";
    $("scanPlateBtn").disabled = false;
    $("startCameraBtn").textContent = "Restartēt kameru";
  } catch (error) {
    $("cameraStatus").textContent = "Kameras kļūda: " + error.message;
    $("cameraStatus").classList.add("error");
  } finally {
    $("startCameraBtn").disabled = false;
  }
}

async function scanPlate() {
  if (!CameraController.isRunning()) {
    $("cameraStatus").textContent = "Vispirms ieslēdz kameru.";
    return;
  }

  $("scanPlateBtn").disabled = true;
  $("cameraStatus").textContent = "Sagatavo OCR…";

  try {
    const result = await CameraController.recognize(progress => {
      $("cameraStatus").textContent = "Nolasa numuru… " + progress + "%";
    });

    if (!result.plate) {
      $("cameraStatus").textContent =
        "Numuru neizdevās droši nolasīt. Piebrauc tuvāk vai ievadi manuāli.";
      return;
    }

    $("plateInput").value = normalizePlate(result.plate);
    state.lastSource = "OCR";
    $("cameraStatus").textContent =
      "Nolasīts: " + result.plate + ". Pārbaudi un vajadzības gadījumā izlabo.";
    $("plateInput").focus();
  } catch (error) {
    $("cameraStatus").textContent = "OCR kļūda: " + error.message;
  } finally {
    $("scanPlateBtn").disabled = false;
  }
}

function normalizePlateInput() {
  const before = $("plateInput").value;
  const after = normalizePlate(before);
  $("plateInput").value = after;
  if (before !== after || state.lastSource !== "OCR") state.lastSource = "MANUAL";
}

function normalizePlate(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

async function processPlate() {
  const plate = normalizePlate($("plateInput").value);
  $("plateInput").value = plate;

  if (!plate) {
    showResult("warning", "!", "Nav ievadīts numurs", "", "Ievadi vai nolasi auto numuru.");
    return;
  }

  $("processBtn").disabled = true;
  showResult("info", "…", "Pārbauda", plate, "Sazinās ar Google Sheet…");

  try {
    const data = await ApiClient.process(state.mode, plate, state.lastSource);

    if (!data.ok) throw new Error(data.error || "Nezināma API kļūda.");

    renderApiResult(data, plate);
    playFeedback(data);
    await refreshStats();
  } catch (error) {
    showResult("bad", "✕", "Savienojuma kļūda", plate, escapeHtml(error.message));
    vibrate([180, 80, 180]);
  } finally {
    $("processBtn").disabled = false;
  }
}

function renderApiResult(data, submittedPlate) {
  const plate = data.plate || submittedPlate;
  const person = [data.name, data.area].filter(Boolean).map(escapeHtml).join("<br>");
  const notes = data.notes ? "<br><small>" + escapeHtml(data.notes) + "</small>" : "";

  const views = {
    ENTRY_ALLOWED: ["ok", "✓", "ATĻAUTS", person + notes],
    ALREADY_IN: ["warning", "!", "JAU IEBRAUCIS",
      person + "<br>Iebrauca: " + escapeHtml(data.entryTime || "")],
    BLOCKED: ["bad", "✕", "BLOĶĒTS", person + notes],
    TOO_EARLY: ["warning", "⏱", "VĒL NAV DERĪGS",
      person + "<br>Derīgs no: " + escapeHtml(data.validFrom || "")],
    EXPIRED: ["bad", "⌛", "TERMIŅŠ BEIDZIES",
      person + "<br>Derīgs līdz: " + escapeHtml(data.validUntil || "")],
    NOT_FOUND: ["bad", "✕", "NAV SARAKSTĀ", "Pārbaudi nolasīto numuru."],
    EXIT_RECORDED: ["ok", "✓", "IZBRAUKŠANA REĢISTRĒTA",
      person + "<br>Izbrauca: " + escapeHtml(data.exitTime || "")],
    EXIT_AFTER_DEADLINE: ["warning", "!", "IZBRAUCA PĒC DEADLINE",
      person + "<br>Izbrauca: " + escapeHtml(data.exitTime || "")],
    NOT_IN: ["warning", "!", "NAV STATUSA IN", person],
    EXIT_NOT_FOUND: ["bad", "✕", "NAV SARAKSTĀ", "Izbraukšanu nevar reģistrēt."]
  };

  const view = views[data.result] ||
    ["bad", "✕", "NEZINĀMS REZULTĀTS", escapeHtml(data.message || data.result || "")];

  showResult(view[0], view[1], view[2], plate, view[3]);
}

function showResult(type, icon, title, plate, details) {
  const card = $("resultCard");
  card.className = "result " + type;
  $("resultIcon").textContent = icon;
  $("resultTitle").textContent = title;
  $("resultPlate").textContent = plate || "";
  $("resultDetails").innerHTML = details || "";
  card.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function refreshStats() {
  try {
    const stats = await ApiClient.stats();
    if (!stats.ok) return;
    $("totalCount").textContent = stats.total;
    $("inCount").textContent = stats.in;
    $("outCount").textContent = stats.out;
  } catch (_) {
    $("totalCount").textContent = "–";
    $("inCount").textContent = "–";
    $("outCount").textContent = "–";
  }
}

function clearWorkForm() {
  $("plateInput").value = "";
  state.lastSource = "MANUAL";
  showResult("neutral", "ⓘ", "Gatavs darbam", "", "Nolasiet vai ievadiet auto numuru.");
  $("plateInput").focus();
}

async function openAdmin() {
  $("adminDialog").showModal();
  await loadAdmin();
}

async function loadAdmin() {
  $("recentLogs").innerHTML = "<div class='message'>Ielādē…</div>";

  try {
    const [stats, recent] = await Promise.all([
      ApiClient.stats(),
      ApiClient.recent(20)
    ]);

    if (!stats.ok) throw new Error(stats.error || "Statistikas kļūda.");
    if (!recent.ok) throw new Error(recent.error || "LOG kļūda.");

    $("adminTotal").textContent = stats.total;
    $("adminReady").textContent = stats.ready;
    $("adminIn").textContent = stats.in;
    $("adminOut").textContent = stats.out;
    $("adminBlocked").textContent = stats.blocked;
    $("adminExpired").textContent = stats.expiredNow;

    if (!recent.logs.length) {
      $("recentLogs").innerHTML = "<div class='message'>LOG vēl nav ierakstu.</div>";
      return;
    }

    $("recentLogs").innerHTML = recent.logs.map(log => `
      <article class="log-item">
        <div class="log-top">
          <span>${escapeHtml(log.plate || "—")} · ${escapeHtml(log.result)}</span>
          <span>${escapeHtml(log.time)}</span>
        </div>
        <div class="log-meta">
          ${escapeHtml(log.name || "")}
          ${log.area ? " · " + escapeHtml(log.area) : ""}
          <br>${escapeHtml(log.gate || "")}
          ${log.guard ? " · " + escapeHtml(log.guard) : ""}
          ${log.source ? " · " + escapeHtml(log.source) : ""}
        </div>
      </article>
    `).join("");
  } catch (error) {
    $("recentLogs").innerHTML =
      "<div class='message error'>" + escapeHtml(error.message) + "</div>";
  }
}

function playFeedback(data) {
  const positive = ["ENTRY_ALLOWED", "EXIT_RECORDED"].includes(data.result);
  const warning = ["ALREADY_IN", "TOO_EARLY", "EXIT_AFTER_DEADLINE", "NOT_IN"].includes(data.result);

  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      const ctx = new AudioCtx();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.frequency.value = positive ? 880 : warning ? 520 : 240;
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.18);
    }
  } catch (_) {}

  if (positive) vibrate(80);
  else if (warning) vibrate([100, 70, 100]);
  else vibrate([180, 80, 180]);
}

function vibrate(pattern) {
  if (navigator.vibrate) navigator.vibrate(pattern);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
