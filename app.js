const $ = (id) => document.getElementById(id),
  KEY = "parkingGateConfigV21";
let mode = "entry",
  source = "MANUAL",
  config = null;
document.addEventListener("DOMContentLoaded", init);
function init() {
  bind();
  network();
  window.addEventListener("online", network);
  window.addEventListener("offline", network);
  const q = new URLSearchParams(location.search),
    saved = JSON.parse(localStorage.getItem(KEY) || "null");
  if (saved) fill(saved);
  if (q.get("api")) $("apiUrlInput").value = q.get("api");
  if (q.get("event")) $("eventNameInput").value = q.get("event");
  if (q.get("key")) $("eventKeyInput").value = q.get("key");
  if (saved && saved.apiUrl && saved.gate && saved.guard) {
    config = saved;
    ApiClient.configure(saved);
    showWork();
    stats();
  } else showSetup();
  if (localStorage.getItem("pgDark") === "1")
    document.body.classList.add("dark");
  if ("serviceWorker" in navigator)
    navigator.serviceWorker.register("sw.js?v=210").catch(() => {});
}
function bind() {
  $("saveSetupBtn").onclick = save;
  $("settingsBtn").onclick = showSetup;
  $("themeBtn").onclick = () => {
    document.body.classList.toggle("dark");
    localStorage.setItem(
      "pgDark",
      document.body.classList.contains("dark") ? "1" : "0",
    );
  };
  $("entryModeBtn").onclick = () => setMode("entry");
  $("exitModeBtn").onclick = () => setMode("exit");
  $("startCameraBtn").onclick = startCam;
  $("scanPlateBtn").onclick = scan;
  $("processBtn").onclick = process;
  $("clearBtn").onclick = clear;
  $("plateInput").oninput = () => {
    const old = $("plateInput").value;
    $("plateInput").value = norm(old);
    if (old !== $("plateInput").value) source = "MANUAL";
  };
  $("adminBtn").onclick = openAdmin;
  $("closeAdminBtn").onclick = () => $("adminDialog").close();
  $("refreshAdminBtn").onclick = loadAdmin;
  $("useSuggestionBtn").onclick = () => {
    $("plateInput").value = $("suggestedPlate").textContent;
    $("suggestionBox").classList.add("hidden");
  };
}
function collect() {
  return {
    eventName: $("eventNameInput").value.trim() || "Parking Gate",
    apiUrl: $("apiUrlInput").value.trim(),
    eventKey: $("eventKeyInput").value.trim(),
    gate: $("gateInput").value.trim(),
    guard: $("guardInput").value.trim(),
  };
}
function fill(c) {
  $("eventNameInput").value = c.eventName || "";
  $("apiUrlInput").value = c.apiUrl || "";
  $("eventKeyInput").value = c.eventKey || "";
  $("gateInput").value = c.gate || "";
  $("guardInput").value = c.guard || "";
}
async function save() {
  const c = collect();
  if (!c.apiUrl.endsWith("/exec") || !c.gate || !c.guard) {
    $("setupMessage").textContent = "Pārbaudi API URL, Gate un apsargu.";
    return;
  }
  ApiClient.configure(c);
  $("setupMessage").textContent = "Pārbauda…";
  try {
    const r = await ApiClient.ping();
    if (!r.ok) throw Error(r.error);
    localStorage.setItem(KEY, JSON.stringify(c));
    config = c;
    showWork();
    stats();
  } catch (e) {
    $("setupMessage").textContent = e.message;
  }
}
function showSetup() {
  CameraController.stop();
  $("workScreen").classList.add("hidden");
  $("setupScreen").classList.remove("hidden");
  if (config) fill(config);
}
function showWork() {
  $("setupScreen").classList.add("hidden");
  $("workScreen").classList.remove("hidden");
  $("eventTitle").textContent = config.eventName;
  $("gateLabel").textContent = config.gate;
  $("guardLabel").textContent = config.guard;
}
function setMode(m) {
  mode = m;
  $("entryModeBtn").classList.toggle("active", m === "entry");
  $("exitModeBtn").classList.toggle("active", m === "exit");
  $("processBtn").textContent =
    m === "entry" ? "PĀRBAUDĪT / IELAIST" : "REĢISTRĒT IZBRAUKŠANU";
  result(
    "neutral",
    "ⓘ",
    m === "entry" ? "Iebraukšana" : "Izbraukšana",
    "",
    "Nolasiet vai ievadiet numuru.",
  );
}
async function startCam() {
  try {
    $("cameraStatus").textContent = "Ieslēdz kameru…";
    await CameraController.start();
    $("scanPlateBtn").disabled = false;
    $("cameraStatus").textContent = "Novieto numurzīmi baltajā rāmī.";
  } catch (e) {
    $("cameraStatus").textContent = "Kameras kļūda: " + e.message;
  }
}
async function scan() {
  $("scanPlateBtn").disabled = true;
  $("cameraStatus").textContent = "Meklē numurzīmi…";
  try {
    const r = await CameraController.recognize(
      (p) => ($("cameraStatus").textContent = "Nolasa… " + p + "%"),
    );
    if (!r.plate) {
      $("cameraStatus").textContent =
        "Numuru neizdevās droši nolasīt. Pielāgo attālumu vai ievadi manuāli.";
      return;
    }
    $("plateInput").value = r.plate;
    source = "OCR";
    $("cameraStatus").textContent =
      "Nolasīts " + r.plate + ". Pārbaudi un izlabo, ja vajag.";
  } catch (e) {
    $("cameraStatus").textContent = e.message;
  } finally {
    $("scanPlateBtn").disabled = false;
  }
}
async function process() {
  const plate = norm($("plateInput").value);
  if (!plate)
    return result(
      "warning",
      "!",
      "Nav numura",
      "",
      "Ievadi vai nolasi numuru.",
    );
  $("suggestionBox").classList.add("hidden");
  result("info", "…", "Pārbauda", plate, "Sazinās ar Google Sheet…");
  try {
    const d = await ApiClient.process(mode, plate, source);
    if (!d.ok) throw Error(d.error);
    render(d, plate);
    if (d.suggestion && d.suggestion !== plate) {
      $("suggestedPlate").textContent = d.suggestion;
      $("suggestionBox").classList.remove("hidden");
    }
    feedback(d.result);
    stats();
  } catch (e) {
    result("bad", "✕", "Savienojuma kļūda", plate, e.message);
  }
}
function render(d, p) {
  const detail = [d.name, d.area, d.notes].filter(Boolean).join("<br>");
  const map = {
      ENTRY_ALLOWED: ["ok", "✓", "ATĻAUTS", detail],
      ALREADY_IN: [
        "warning",
        "!",
        "JAU IEBRAUCIS",
        detail + "<br>Iebrauca: " + (d.entryTime || ""),
      ],
      BLOCKED: ["bad", "✕", "BLOĶĒTS", detail],
      TOO_EARLY: [
        "warning",
        "⏱",
        "VĒL NAV DERĪGS",
        detail + "<br>Derīgs no: " + (d.validFrom || ""),
      ],
      EXPIRED: [
        "bad",
        "⌛",
        "TERMIŅŠ BEIDZIES",
        detail + "<br>Derīgs līdz: " + (d.validUntil || ""),
      ],
      NOT_FOUND: ["bad", "✕", "NAV SARAKSTĀ", "Pārbaudi numuru."],
      EXIT_RECORDED: ["ok", "✓", "IZBRAUKŠANA REĢISTRĒTA", detail],
      EXIT_AFTER_DEADLINE: ["warning", "!", "IZBRAUCA PĒC DEADLINE", detail],
      NOT_IN: ["warning", "!", "NAV STATUSA IN", detail],
      EXIT_NOT_FOUND: [
        "bad",
        "✕",
        "NAV SARAKSTĀ",
        "Izbraukšanu nevar reģistrēt.",
      ],
    },
    x = map[d.result] || ["bad", "✕", "KĻŪDA", d.result || ""];
  result(x[0], x[1], x[2], d.plate || p, x[3]);
}
function result(type, icon, title, plate, details) {
  $("resultCard").className = "result " + type;
  $("resultIcon").textContent = icon;
  $("resultTitle").textContent = title;
  $("resultPlate").textContent = plate;
  $("resultDetails").innerHTML = details || "";
  $("resultCard").scrollIntoView({ behavior: "smooth", block: "center" });
}
async function stats() {
  try {
    const s = await ApiClient.stats();
    $("totalCount").textContent = s.total;
    $("inCount").textContent = s.in;
    $("outCount").textContent = s.out;
  } catch (e) {}
}
function clear() {
  $("plateInput").value = "";
  source = "MANUAL";
  $("suggestionBox").classList.add("hidden");
  result("neutral", "ⓘ", "Gatavs darbam", "", "Nolasiet vai ievadiet numuru.");
}
function norm(v) {
  return String(v || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}
function network() {
  const on = navigator.onLine;
  $("networkBanner").textContent = on ? "ONLINE" : "NAV INTERNETA";
  $("networkBanner").className = "network " + (on ? "online" : "offline");
}
async function openAdmin() {
  $("adminDialog").showModal();
  loadAdmin();
}
async function loadAdmin() {
  try {
    const [s, l] = await Promise.all([ApiClient.stats(), ApiClient.recent(20)]);
    ["Total", "Ready", "In", "Out", "Blocked"].forEach(
      (k) => ($("admin" + k).textContent = s[k.toLowerCase()]),
    );
    $("adminExpired").textContent = s.expiredNow;
    $("recentLogs").innerHTML = l.logs
      .map(
        (x) =>
          '<div class="log-item"><b>' +
          x.plate +
          " · " +
          x.result +
          "</b>" +
          x.time +
          "<br>" +
          x.gate +
          " · " +
          x.guard +
          "</div>",
      )
      .join("");
  } catch (e) {
    $("recentLogs").textContent = e.message;
  }
}
function feedback(r) {
  if (navigator.vibrate)
    navigator.vibrate(
      ["ENTRY_ALLOWED", "EXIT_RECORDED"].includes(r) ? 80 : [150, 70, 150],
    );
  try {
    const A = window.AudioContext || window.webkitAudioContext,
      c = new A(),
      o = c.createOscillator(),
      g = c.createGain();
    o.connect(g);
    g.connect(c.destination);
    o.frequency.value = ["ENTRY_ALLOWED", "EXIT_RECORDED"].includes(r)
      ? 880
      : 260;
    g.gain.setValueAtTime(0.07, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.18);
    o.start();
    o.stop(c.currentTime + 0.18);
  } catch (e) {}
}
