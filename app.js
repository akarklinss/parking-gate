const plateInput = document.getElementById("plateInput");
const checkBtn = document.getElementById("checkBtn");
const clearBtn = document.getElementById("clearBtn");
const resultEl = document.getElementById("result");

const totalCount = document.getElementById("totalCount");
const enteredCount = document.getElementById("enteredCount");
const remainingCount = document.getElementById("remainingCount");

document.getElementById("startCameraBtn").addEventListener("click", startCamera);
document.getElementById("stopCameraBtn").addEventListener("click", stopCamera);
document.getElementById("refreshStatsBtn").addEventListener("click", loadStats);

checkBtn.addEventListener("click", checkPlate);
clearBtn.addEventListener("click", clearScreen);

plateInput.addEventListener("input", () => {
  plateInput.value = normalizePlate(plateInput.value);
});

plateInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") checkPlate();
});

window.addEventListener("load", () => {
  loadStats();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js");
  }
});

function normalizePlate(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

async function checkPlate() {
  const plate = normalizePlate(plateInput.value);
  plateInput.value = plate;

  if (!plate) {
    showResult("Ievadi auto numuru.", "neutral");
    return;
  }

  showResult("Pārbauda sarakstā...", "neutral");

  try {
    const data = await checkPlateApi(plate);

    if (!data.ok) {
      showResult("Kļūda: " + escapeHtml(data.error || "Nezināma kļūda"), "bad");
      return;
    }

    if (data.found && data.alreadyEntered) {
      showResult(
        "🟠 JAU IEBRAUCIS<br><br>" +
        "<strong>" + escapeHtml(data.plate) + "</strong><br>" +
        escapeHtml(data.name) + "<br>" +
        escapeHtml(data.area) + "<br><br>" +
        "<small>Iebrauca: " + escapeHtml(data.entryTime) + "</small>",
        "warning"
      );
    } else if (data.found) {
      showResult(
        "🟢 ATĻAUTS<br><br>" +
        "<strong>" + escapeHtml(data.plate) + "</strong><br>" +
        escapeHtml(data.name) + "<br>" +
        escapeHtml(data.area) + "<br><br>" +
        "<small>Iebrauca: " + escapeHtml(data.entryTime) + "</small>",
        "ok"
      );
    } else {
      showResult(
        "🔴 NAV SARAKSTĀ<br><br><strong>" + escapeHtml(plate) + "</strong>",
        "bad"
      );
    }

    loadStats();
  } catch (err) {
    showResult("Savienojuma kļūda: " + escapeHtml(err.message), "bad");
  }
}

async function loadStats() {
  try {
    const stats = await getStatsApi();

    if (!stats.ok) return;

    totalCount.textContent = stats.total;
    enteredCount.textContent = stats.entered;
    remainingCount.textContent = stats.remaining;
  } catch (err) {
    totalCount.textContent = "–";
    enteredCount.textContent = "–";
    remainingCount.textContent = "–";
  }
}

function clearScreen() {
  plateInput.value = "";
  showResult("Ievadi auto numuru un spied “Pārbaudīt / Ielaist”.", "neutral");
  plateInput.focus();
}

function showResult(html, type) {
  resultEl.className = "result " + type;
  resultEl.innerHTML = html;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
