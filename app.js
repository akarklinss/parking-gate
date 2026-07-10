const PROFILE_KEY = "parkingGateProfilesV3";
const ACTIVE_PROFILE_KEY = "parkingGateActiveProfileV3";

const state = {
  mode: "entry",
  profiles: [],
  activeProfileId: "",
  lastSource: "MANUAL",
  pollTimer: null
};

const $ = id => document.getElementById(id);

window.addEventListener("DOMContentLoaded", init);

function init() {
  bindEvents();
  importConfigFromUrl();
  loadProfiles();
  renderProfileSelect();
  updateOnlineBadge();

  window.addEventListener("online", updateOnlineBadge);
  window.addEventListener("offline", updateOnlineBadge);

  const active = getActiveProfile();

  if (active) {
    fillProfile(active);
    activateProfile(active, false);
  } else {
    showSetup();
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js?v=301").catch(() => {});
  }
}

function bindEvents() {
  $("newProfileBtn").addEventListener("click", clearProfileForm);
  $("profileSelect").addEventListener("change", selectProfile);
  $("saveProfileBtn").addEventListener("click", saveProfile);
  $("deleteProfileBtn").addEventListener("click", deleteProfile);

  $("settingsBtn").addEventListener("click", showSetup);
  $("entryModeBtn").addEventListener("click", () => setMode("entry"));
  $("exitModeBtn").addEventListener("click", () => setMode("exit"));

  $("startCameraBtn").addEventListener("click", startCamera);
  $("scanBtn").addEventListener("click", scanPlate);

  $("plateInput").addEventListener("input", () => {
    $("plateInput").value = normalizePlate($("plateInput").value);
    state.lastSource = "MANUAL";
    hideSuggestion();
  });

  $("plateInput").addEventListener("keydown", event => {
    if (event.key === "Enter") processPlate();
  });

  $("processBtn").addEventListener("click", processPlate);
  $("clearBtn").addEventListener("click", clearWorkForm);
  $("useSuggestionBtn").addEventListener("click", useSuggestion);

  $("openAdminBtn").addEventListener("click", openAdmin);
  $("closeAdminBtn").addEventListener("click", () => $("adminDialog").close());
  $("refreshAdminBtn").addEventListener("click", loadAdmin);
}

function loadProfiles() {
  try {
    state.profiles = JSON.parse(localStorage.getItem(PROFILE_KEY) || "[]");
    state.activeProfileId = localStorage.getItem(ACTIVE_PROFILE_KEY) || "";
  } catch (_) {
    state.profiles = [];
    state.activeProfileId = "";
  }
}

function persistProfiles() {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(state.profiles));
  localStorage.setItem(ACTIVE_PROFILE_KEY, state.activeProfileId || "");
}

function renderProfileSelect() {
  const select = $("profileSelect");
  select.innerHTML = "";

  if (!state.profiles.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Nav saglabātu pasākumu";
    select.appendChild(option);
    return;
  }

  state.profiles.forEach(profile => {
    const option = document.createElement("option");
    option.value = profile.id;
    option.textContent = profile.eventName + " · " + profile.gate;
    option.selected = profile.id === state.activeProfileId;
    select.appendChild(option);
  });
}

function getActiveProfile() {
  return state.profiles.find(profile => profile.id === state.activeProfileId) || null;
}

function selectProfile() {
  const profile = state.profiles.find(item => item.id === $("profileSelect").value);
  if (profile) fillProfile(profile);
}

function clearProfileForm() {
  $("eventNameInput").value = "";
  $("apiUrlInput").value = "";
  $("eventKeyInput").value = "";
  $("gateInput").value = "";
  $("guardInput").value = "";
  $("deviceInput").value = "";
  $("profileSelect").value = "";
  showSetupMessage("", "");
}

function collectProfile() {
  const selectedId = $("profileSelect").value;

  return {
    id: selectedId || "event_" + Date.now(),
    eventName: $("eventNameInput").value.trim() || "Parking Gate",
    apiUrl: $("apiUrlInput").value.trim(),
    eventKey: $("eventKeyInput").value.trim(),
    gate: $("gateInput").value.trim(),
    guard: $("guardInput").value.trim(),
    device: $("deviceInput").value.trim()
  };
}

function fillProfile(profile) {
  $("eventNameInput").value = profile.eventName || "";
  $("apiUrlInput").value = profile.apiUrl || "";
  $("eventKeyInput").value = profile.eventKey || "";
  $("gateInput").value = profile.gate || "";
  $("guardInput").value = profile.guard || "";
  $("deviceInput").value = profile.device || "";
  $("profileSelect").value = profile.id || "";
}

async function saveProfile() {
  const profile = collectProfile();

  if (!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec/i.test(profile.apiUrl)) {
    showSetupMessage("Ievadi derīgu Apps Script /exec URL.", "error");
    return;
  }

  if (!profile.gate || !profile.guard || !profile.device) {
    showSetupMessage("Ievadi Gate, apsargu un ierīces nosaukumu.", "error");
    return;
  }

  $("saveProfileBtn").disabled = true;
  showSetupMessage("Pārbauda savienojumu…", "");

  try {
    ApiClient.configure(profile);
    const ping = await ApiClient.ping();

    if (!ping.ok) throw new Error(ping.error || "API neatbildēja pareizi.");

    const existingIndex = state.profiles.findIndex(item => item.id === profile.id);

    if (existingIndex >= 0) state.profiles[existingIndex] = profile;
    else state.profiles.push(profile);

    state.activeProfileId = profile.id;
    persistProfiles();
    renderProfileSelect();
    activateProfile(profile, true);
    showSetupMessage("Savienojums darbojas.", "success");
  } catch (error) {
    showSetupMessage(error.message, "error");
  } finally {
    $("saveProfileBtn").disabled = false;
  }
}

function deleteProfile() {
  const id = $("profileSelect").value;
  if (!id) return;

  state.profiles = state.profiles.filter(profile => profile.id !== id);

  if (state.activeProfileId === id) {
    state.activeProfileId = state.profiles[0]?.id || "";
  }

  persistProfiles();
  renderProfileSelect();

  const next = getActiveProfile();
  if (next) fillProfile(next);
  else clearProfileForm();
}

function activateProfile(profile, refresh) {
  state.activeProfileId = profile.id;
  persistProfiles();
  ApiClient.configure(profile);

  $("eventTitle").textContent = profile.eventName;
  $("gateLabel").textContent = profile.gate;
  $("guardLabel").textContent = profile.guard;
  $("deviceLabel").textContent = profile.device;
  $("adminEventTitle").textContent = profile.eventName;

  $("setupScreen").classList.add("hidden");
  $("workScreen").classList.remove("hidden");

  if (refresh) refreshStats();
  startPolling();
}

function showSetup() {
  CameraController.stop();
  stopPolling();
  $("workScreen").classList.add("hidden");
  $("setupScreen").classList.remove("hidden");

  const active = getActiveProfile();
  if (active) fillProfile(active);
}

function showSetupMessage(text, type) {
  const element = $("setupMessage");
  element.textContent = text;
  element.className = "message" + (type ? " " + type : "");
}

function setMode(mode) {
  state.mode = mode;

  $("entryModeBtn").classList.toggle("active", mode === "entry");
  $("exitModeBtn").classList.toggle("active", mode === "exit");
  $("exitModeBtn").classList.toggle("exit", mode === "exit");

  $("processBtn").textContent =
    mode === "entry" ? "PĀRBAUDĪT / IELAIST" : "REĢISTRĒT IZBRAUKŠANU";

  showResult(
    "neutral",
    "ⓘ",
    mode === "entry" ? "Iebraukšanas režīms" : "Izbraukšanas režīms",
    "",
    "Nolasi vai ievadi auto numuru."
  );
}

async function startCamera() {
  $("startCameraBtn").disabled = true;
  showCameraStatus("Ieslēdz kameru…", "");

  try {
    await CameraController.start();
    showCameraStatus("Kamera gatava. Novieto numurzīmi baltajā rāmī.", "");
    $("scanBtn").disabled = false;
    $("startCameraBtn").textContent = "Restartēt kameru";
  } catch (error) {
    showCameraStatus("Kameras kļūda: " + error.message, "error");
  } finally {
    $("startCameraBtn").disabled = false;
  }
}

async function scanPlate() {
  if (!CameraController.isRunning()) {
    showCameraStatus("Vispirms ieslēdz kameru.", "error");
    return;
  }

  $("scanBtn").disabled = true;
  showCameraStatus("Sagatavo OCR…", "");

  try {
    const result = await CameraController.recognize(progress => {
      showCameraStatus("Nolasa numuru… " + progress + "%", "");
    });

    if (!result.plate) {
      const raw = String(result.rawText || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 40);

      showCameraStatus(
        raw
          ? "Numuru neizdevās droši nolasīt. OCR redzēja: " + raw
          : "Numuru neizdevās droši nolasīt. Pamēģini vēlreiz vai ievadi manuāli.",
        "error"
      );
      return;
    }

    $("plateInput").value = result.plate;
    state.lastSource = "OCR";
    showCameraStatus(
      "Nolasīts: " + result.plate + ". Pārbaudi un vajadzības gadījumā izlabo.",
      "success"
    );
  } catch (error) {
    showCameraStatus("OCR kļūda: " + error.message, "error");
  } finally {
    $("scanBtn").disabled = false;
  }
}

function showCameraStatus(text, type) {
  const element = $("cameraStatus");
  element.textContent = text;
  element.className = "message" + (type ? " " + type : "");
}

async function processPlate() {
  const plate = normalizePlate($("plateInput").value);
  $("plateInput").value = plate;
  hideSuggestion();

  if (!plate) {
    showResult("warning", "!", "Nav ievadīts numurs", "", "Ievadi auto numuru.");
    return;
  }

  $("processBtn").disabled = true;
  showResult("info", "…", "Pārbauda", plate, "Sazinās ar Google Sheet…");

  try {
    const data = await ApiClient.process(state.mode, plate, state.lastSource);

    if (!data.ok) throw new Error(data.error || "Nezināma API kļūda.");

    renderResult(data, plate);

    if (data.suggestion) showSuggestion(data.suggestion);

    feedback(data.result);
    await refreshStats();
  } catch (error) {
    showResult("bad", "✕", "Savienojuma kļūda", plate, escapeHtml(error.message));
  } finally {
    $("processBtn").disabled = false;
  }
}

function renderResult(data, submittedPlate) {
  const plate = data.plate || submittedPlate;
  const person = [data.name, data.area]
    .filter(Boolean)
    .map(escapeHtml)
    .join("<br>");

  const notes = data.notes
    ? "<br><small>" + escapeHtml(data.notes) + "</small>"
    : "";

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
    ["bad", "✕", "NEZINĀMS REZULTĀTS", escapeHtml(data.message || "")];

  showResult(view[0], view[1], view[2], plate, view[3]);
}

function showResult(type, icon, title, plate, details) {
  $("resultCard").className = "result " + type;
  $("resultIcon").textContent = icon;
  $("resultTitle").textContent = title;
  $("resultPlate").textContent = plate || "";
  $("resultDetails").innerHTML = details || "";
}

function showSuggestion(plate) {
  $("suggestionText").textContent = "Vai domāts " + plate + "?";
  $("useSuggestionBtn").dataset.plate = plate;
  $("suggestionBox").classList.remove("hidden");
}

function hideSuggestion() {
  $("suggestionBox").classList.add("hidden");
  $("useSuggestionBtn").dataset.plate = "";
}

function useSuggestion() {
  const plate = $("useSuggestionBtn").dataset.plate;
  if (!plate) return;

  $("plateInput").value = plate;
  state.lastSource = "SUGGESTION";
  hideSuggestion();
}

function clearWorkForm() {
  $("plateInput").value = "";
  state.lastSource = "MANUAL";
  hideSuggestion();
  showResult("neutral", "ⓘ", "Gatavs darbam", "", "Nolasi vai ievadi auto numuru.");
}

function startPolling() {
  stopPolling();
  refreshStats();
  state.pollTimer = setInterval(refreshStats, 5000);
}

function stopPolling() {
  if (state.pollTimer) clearInterval(state.pollTimer);
  state.pollTimer = null;
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

    $("adminTotal").textContent = stats.total;
    $("adminReady").textContent = stats.ready;
    $("adminIn").textContent = stats.in;
    $("adminOut").textContent = stats.out;
    $("adminBlocked").textContent = stats.blocked;
    $("adminExpired").textContent = stats.expiredNow;

    renderQr();

    $("recentLogs").innerHTML = recent.logs.length
      ? recent.logs.map(log => `
          <article class="log-item">
            <div class="log-top">
              <span>${escapeHtml(log.plate || "—")} · ${escapeHtml(log.result)}</span>
              <span>${escapeHtml(log.time)}</span>
            </div>
            <div class="log-meta">
              ${escapeHtml(log.name || "")}
              ${log.area ? " · " + escapeHtml(log.area) : ""}
              <br>
              ${escapeHtml(log.gate || "")}
              ${log.guard ? " · " + escapeHtml(log.guard) : ""}
              ${log.device ? " · " + escapeHtml(log.device) : ""}
              ${log.source ? " · " + escapeHtml(log.source) : ""}
            </div>
          </article>
        `).join("")
      : "<div class='message'>LOG vēl nav ierakstu.</div>";
  } catch (error) {
    $("recentLogs").innerHTML =
      "<div class='message error'>" + escapeHtml(error.message) + "</div>";
  }
}

function renderQr() {
  const profile = getActiveProfile();
  if (!profile || !window.QRCode) return;

  const url = new URL(location.origin + location.pathname);
  url.searchParams.set("event", profile.eventName);
  url.searchParams.set("api", profile.apiUrl);

  if (profile.eventKey) {
    url.searchParams.set("key", profile.eventKey);
  }

  QRCode.toCanvas(
    $("qrCanvas"),
    url.toString(),
    { width: 260, margin: 1 },
    () => {}
  );
}

function importConfigFromUrl() {
  const params = new URLSearchParams(location.search);
  const api = params.get("api");

  if (!api) return;

  $("eventNameInput").value = params.get("event") || "";
  $("apiUrlInput").value = api;
  $("eventKeyInput").value = params.get("key") || "";
}

function updateOnlineBadge() {
  const badge = $("onlineBadge");
  const online = navigator.onLine;
  badge.textContent = online ? "ONLINE" : "NAV INTERNETA";
  badge.className = "badge " + (online ? "online" : "offline");
}

function normalizePlate(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function feedback(result) {
  const positive = ["ENTRY_ALLOWED", "EXIT_RECORDED"].includes(result);
  const warning = ["ALREADY_IN", "TOO_EARLY", "EXIT_AFTER_DEADLINE", "NOT_IN"].includes(result);

  if (navigator.vibrate) {
    navigator.vibrate(
      positive ? 80 : warning ? [100, 70, 100] : [180, 80, 180]
    );
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
