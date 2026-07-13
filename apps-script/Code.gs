const PARKING_SHEET_NAME = "PARKING";
const LOG_SHEET_NAME = "LOG";
const DEVICE_SHEET_NAME = "DEVICES";
const TIMEZONE = "Europe/Riga";
const API_KEY_PROPERTY = "PARKING_GATE_KEY";

const COL = {
  PLATE: 1,
  NAME: 2,
  AREA: 3,
  REGISTERED_AT: 4,
  ENTRY_AT: 5,
  EXIT_AT: 6,
  STATUS: 7,
  VALID_FROM: 8,
  VALID_UNTIL: 9,
  NOTES: 10
};

function onEdit(e) {
  if (!e || !e.range) return;

  const sheet = e.range.getSheet();
  if (sheet.getName() !== PARKING_SHEET_NAME) return;

  if (e.range.getColumn() > COL.PLATE || e.range.getLastColumn() < COL.PLATE) {
    return;
  }

  const firstRow = Math.max(e.range.getRow(), 2);
  const lastRow = e.range.getLastRow();

  for (let row = firstRow; row <= lastRow; row++) {
    const plateCell = sheet.getRange(row, COL.PLATE);
    const plate = normalizePlate(plateCell.getValue());

    const registeredCell = sheet.getRange(row, COL.REGISTERED_AT);
    const entryCell = sheet.getRange(row, COL.ENTRY_AT);
    const exitCell = sheet.getRange(row, COL.EXIT_AT);
    const statusCell = sheet.getRange(row, COL.STATUS);

    if (plate) {
      plateCell.setValue(plate);

      if (!registeredCell.getValue()) {
        registeredCell
          .setValue(new Date())
          .setNumberFormat("dd.MM.yyyy HH:mm:ss");
      }

      if (!statusCell.getValue()) {
        statusCell.setValue("READY");
      }
    } else {
      registeredCell.clearContent();
      entryCell.clearContent();
      exitCell.clearContent();
      statusCell.clearContent();
    }
  }
}

function doGet(e) {
  const p = e && e.parameter ? e.parameter : {};
  const callback = sanitizeCallback(p.callback || "callback");
  let result;

  try {
    assertApiKey(p.key || "");

    const action = String(p.action || "ping").toLowerCase();
    const context = {
      gate: cleanText(p.gate || "Main Gate", 80),
      guard: cleanText(p.guard || "", 80),
      device: cleanText(p.device || "", 100),
      source: cleanText(p.source || "MANUAL", 30)
    };

    switch (action) {
      case "entry":
      case "check":
        result = processEntry(p.plate || "", context);
        break;

      case "exit":
        result = processExit(p.plate || "", context);
        break;

      case "stats":
        result = getStats();
        break;

      case "recent":
        result = getRecentLogs(Number(p.limit || 25));
        break;

      case "vehicles":
        result = getVehicles();
        break;

      case "heartbeat":
        result = registerHeartbeat(context);
        break;

      case "ping":
        result = {
          ok: true,
          message: "Parking Gate API is running",
          spreadsheet: SpreadsheetApp.getActiveSpreadsheet().getName()
        };
        break;

      default:
        result = {
          ok: false,
          error: "Nezināma API darbība."
        };
    }
  } catch (error) {
    result = {
      ok: false,
      error: error && error.message ? error.message : String(error)
    };
  }

  return ContentService
    .createTextOutput(callback + "(" + JSON.stringify(result) + ")")
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function processEntry(plateRaw, context) {
  const plate = normalizePlate(plateRaw);

  if (!plate) {
    return {
      ok: false,
      error: "Nav norādīts auto numurs."
    };
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const sheet = getParkingSheet();
    const match = findVehicle(sheet, plate);
    const now = new Date();

    if (!match) {
      appendLog(
        now,
        plate,
        "NOT_FOUND",
        "",
        "",
        context,
        "Auto nav PARKING sarakstā."
      );

      return {
        ok: true,
        found: false,
        result: "NOT_FOUND",
        plate: plate
      };
    }

    const vehicle = match.vehicle;
    const row = match.row;
    const status = normalizeStatus(vehicle.status);
    const validFrom = parseSheetDate(vehicle.validFrom);
    const validUntil = parseSheetDate(vehicle.validUntil);

    if (status === "BLOCKED") {
      appendVehicleLog(now, vehicle, "BLOCKED", context, vehicle.notes);

      return vehicleResponse(vehicle, {
        allowed: false,
        result: "BLOCKED",
        status: "BLOCKED"
      });
    }

    if (validFrom && now < validFrom) {
      appendVehicleLog(
        now,
        vehicle,
        "TOO_EARLY",
        context,
        "Piekļuve derīga no " + formatDate(validFrom)
      );

      return vehicleResponse(vehicle, {
        allowed: false,
        result: "TOO_EARLY",
        validFrom: formatDate(validFrom)
      });
    }

    if (validUntil && now > validUntil) {
      appendVehicleLog(
        now,
        vehicle,
        "EXPIRED",
        context,
        "Piekļuves termiņš beidzās " + formatDate(validUntil)
      );

      return vehicleResponse(vehicle, {
        allowed: false,
        result: "EXPIRED",
        validUntil: formatDate(validUntil)
      });
    }

    if (status === "IN") {
      appendVehicleLog(
        now,
        vehicle,
        "ALREADY_IN",
        context,
        "Auto jau atrodas teritorijā."
      );

      return vehicleResponse(vehicle, {
        allowed: false,
        result: "ALREADY_IN",
        entryTime: formatDate(vehicle.entryAt)
      });
    }

    sheet.getRange(row, COL.ENTRY_AT)
      .setValue(now)
      .setNumberFormat("dd.MM.yyyy HH:mm:ss");

    sheet.getRange(row, COL.EXIT_AT).clearContent();
    sheet.getRange(row, COL.STATUS).setValue("IN");

    appendVehicleLog(
      now,
      vehicle,
      "ENTRY_ALLOWED",
      context,
      vehicle.notes
    );

    return vehicleResponse(vehicle, {
      allowed: true,
      result: "ENTRY_ALLOWED",
      status: "IN",
      entryTime: formatDate(now)
    });
  } finally {
    lock.releaseLock();
  }
}

function processExit(plateRaw, context) {
  const plate = normalizePlate(plateRaw);

  if (!plate) {
    return {
      ok: false,
      error: "Nav norādīts auto numurs."
    };
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const sheet = getParkingSheet();
    const match = findVehicle(sheet, plate);
    const now = new Date();

    if (!match) {
      appendLog(
        now,
        plate,
        "EXIT_NOT_FOUND",
        "",
        "",
        context,
        "Izbraukšanas numurs nav PARKING sarakstā."
      );

      return {
        ok: true,
        found: false,
        result: "EXIT_NOT_FOUND",
        plate: plate
      };
    }

    const vehicle = match.vehicle;
    const row = match.row;
    const status = normalizeStatus(vehicle.status);
    const validUntil = parseSheetDate(vehicle.validUntil);

    if (status !== "IN") {
      appendVehicleLog(
        now,
        vehicle,
        "NOT_IN",
        context,
        "Izbraukšana mēģināta, bet statuss nav IN."
      );

      return vehicleResponse(vehicle, {
        allowed: false,
        result: "NOT_IN",
        status: status
      });
    }

    const lateExit = Boolean(validUntil && now > validUntil);
    const result = lateExit
      ? "EXIT_AFTER_DEADLINE"
      : "EXIT_RECORDED";

    sheet.getRange(row, COL.EXIT_AT)
      .setValue(now)
      .setNumberFormat("dd.MM.yyyy HH:mm:ss");

    sheet.getRange(row, COL.STATUS).setValue("OUT");

    appendVehicleLog(
      now,
      vehicle,
      result,
      context,
      lateExit
        ? "Auto izbrauca pēc termiņa " + formatDate(validUntil)
        : vehicle.notes
    );

    return vehicleResponse(vehicle, {
      allowed: true,
      result: result,
      status: "OUT",
      exitTime: formatDate(now),
      validUntil: validUntil ? formatDate(validUntil) : "",
      lateExit: lateExit
    });
  } finally {
    lock.releaseLock();
  }
}

function getStats() {
  const rows = getParkingSheet().getDataRange().getValues();
  const now = new Date();

  const stats = {
    ok: true,
    total: 0,
    ready: 0,
    in: 0,
    out: 0,
    blocked: 0,
    expiredNow: 0,
    onlineDevices: countOnlineDevices()
  };

  for (let i = 1; i < rows.length; i++) {
    if (!normalizePlate(rows[i][COL.PLATE - 1])) continue;

    stats.total++;

    const status = normalizeStatus(rows[i][COL.STATUS - 1]);
    const validUntil = parseSheetDate(rows[i][COL.VALID_UNTIL - 1]);

    if (status === "IN") {
      stats.in++;
    } else if (status === "OUT") {
      stats.out++;
    } else if (status === "BLOCKED") {
      stats.blocked++;
    } else {
      stats.ready++;
    }

    if (
      status !== "IN" &&
      status !== "OUT" &&
      validUntil &&
      now > validUntil
    ) {
      stats.expiredNow++;
    }
  }

  return stats;
}

function getVehicles() {
  const rows = getParkingSheet().getDataRange().getValues();
  const vehicles = [];

  for (let i = 1; i < rows.length; i++) {
    const plate = normalizePlate(rows[i][COL.PLATE - 1]);
    if (!plate) continue;

    vehicles.push({
      plate: plate,
      name: rows[i][COL.NAME - 1] || "",
      area: rows[i][COL.AREA - 1] || "",
      status: normalizeStatus(rows[i][COL.STATUS - 1]),
      validFrom: rows[i][COL.VALID_FROM - 1]
        ? formatDate(rows[i][COL.VALID_FROM - 1])
        : "",
      validUntil: rows[i][COL.VALID_UNTIL - 1]
        ? formatDate(rows[i][COL.VALID_UNTIL - 1])
        : ""
    });
  }

  return {
    ok: true,
    vehicles: vehicles
  };
}

function getRecentLogs(limit) {
  limit = Math.max(1, Math.min(100, Math.floor(limit || 25)));

  const sheet = ensureLogSheet();
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return {
      ok: true,
      logs: []
    };
  }

  const firstRow = Math.max(2, lastRow - limit + 1);
  const values = sheet
    .getRange(firstRow, 1, lastRow - firstRow + 1, 10)
    .getValues();

  const logs = values.reverse().map(function (row) {
    return {
      time: formatDate(row[0]),
      plate: row[1] || "",
      result: row[2] || "",
      name: row[3] || "",
      area: row[4] || "",
      gate: row[5] || "",
      guard: row[6] || "",
      device: row[7] || "",
      source: row[8] || "",
      note: row[9] || ""
    };
  });

  return {
    ok: true,
    logs: logs
  };
}

function registerHeartbeat(context) {
  const sheet = ensureDeviceSheet();
  const key = [
    context.device,
    context.gate,
    context.guard
  ].join("|");

  const rows = sheet.getDataRange().getValues();
  let targetRow = 0;

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0] || "") === key) {
      targetRow = i + 1;
      break;
    }
  }

  const now = new Date();
  const values = [[
    key,
    context.device,
    context.gate,
    context.guard,
    now
  ]];

  if (targetRow) {
    sheet.getRange(targetRow, 1, 1, 5).setValues(values);
  } else {
    sheet.appendRow(values[0]);
    targetRow = sheet.getLastRow();
  }

  sheet.getRange(targetRow, 5)
    .setNumberFormat("dd.MM.yyyy HH:mm:ss");

  return {
    ok: true,
    time: formatDate(now)
  };
}

function countOnlineDevices() {
  const sheet = ensureDeviceSheet();
  const rows = sheet.getDataRange().getValues();
  const threshold = Date.now() - 35000;
  let count = 0;

  for (let i = 1; i < rows.length; i++) {
    const lastSeen = parseSheetDate(rows[i][4]);

    if (lastSeen && lastSeen.getTime() >= threshold) {
      count++;
    }
  }

  return count;
}

function findVehicle(sheet, plate) {
  const rows = sheet.getDataRange().getValues();

  for (let i = 1; i < rows.length; i++) {
    if (normalizePlate(rows[i][COL.PLATE - 1]) === plate) {
      return {
        row: i + 1,
        vehicle: {
          plate: rows[i][COL.PLATE - 1],
          name: rows[i][COL.NAME - 1] || "",
          area: rows[i][COL.AREA - 1] || "",
          registeredAt: rows[i][COL.REGISTERED_AT - 1] || "",
          entryAt: rows[i][COL.ENTRY_AT - 1] || "",
          exitAt: rows[i][COL.EXIT_AT - 1] || "",
          status: rows[i][COL.STATUS - 1] || "READY",
          validFrom: rows[i][COL.VALID_FROM - 1] || "",
          validUntil: rows[i][COL.VALID_UNTIL - 1] || "",
          notes: rows[i][COL.NOTES - 1] || ""
        }
      };
    }
  }

  return null;
}

function ensureLogSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(LOG_SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(LOG_SHEET_NAME);

    sheet.getRange(1, 1, 1, 10).setValues([[
      "Datums / Laiks",
      "Auto Nr",
      "Rezultāts",
      "Name Surname",
      "Parking Area",
      "Gate",
      "Apsargs",
      "Ierīce",
      "Avots",
      "Piezīme"
    ]]);

    sheet.setFrozenRows(1);
    sheet.getRange("A:A").setNumberFormat("dd.MM.yyyy HH:mm:ss");
  }

  return sheet;
}

function ensureDeviceSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(DEVICE_SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(DEVICE_SHEET_NAME);

    sheet.getRange(1, 1, 1, 5).setValues([[
      "Ierīces atslēga",
      "Ierīce",
      "Gate",
      "Apsargs",
      "Pēdējā aktivitāte"
    ]]);

    sheet.setFrozenRows(1);
    sheet.getRange("E:E").setNumberFormat("dd.MM.yyyy HH:mm:ss");
  }

  return sheet;
}

function appendLog(time, plate, result, name, area, context, note) {
  const sheet = ensureLogSheet();

  sheet.appendRow([
    time || new Date(),
    plate || "",
    result || "",
    name || "",
    area || "",
    context.gate || "",
    context.guard || "",
    context.device || "",
    context.source || "",
    note || ""
  ]);

  sheet.getRange(sheet.getLastRow(), 1)
    .setNumberFormat("dd.MM.yyyy HH:mm:ss");
}

function appendVehicleLog(time, vehicle, result, context, note) {
  appendLog(
    time,
    vehicle.plate,
    result,
    vehicle.name,
    vehicle.area,
    context,
    note || ""
  );
}

function vehicleResponse(vehicle, extra) {
  return Object.assign({
    ok: true,
    found: true,
    plate: vehicle.plate,
    name: vehicle.name,
    area: vehicle.area,
    notes: vehicle.notes,
    currentStatus: normalizeStatus(vehicle.status),
    entryTime: vehicle.entryAt ? formatDate(vehicle.entryAt) : "",
    exitTime: vehicle.exitAt ? formatDate(vehicle.exitAt) : ""
  }, extra || {});
}

function assertApiKey(providedKey) {
  const requiredKey = PropertiesService
    .getScriptProperties()
    .getProperty(API_KEY_PROPERTY);

  if (!requiredKey) return;

  if (String(providedKey || "") !== String(requiredKey)) {
    throw new Error("Nepareiza vai trūkstoša pasākuma atslēga.");
  }
}

function getParkingSheet() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(PARKING_SHEET_NAME);

  if (!sheet) {
    throw new Error('Nav atrasta lapa "' + PARKING_SHEET_NAME + '".');
  }

  return sheet;
}

function normalizePlate(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function normalizeStatus(value) {
  return String(value || "")
    .trim()
    .toUpperCase() || "READY";
}

function parseSheetDate(value) {
  if (!value) return null;

  if (
    Object.prototype.toString.call(value) === "[object Date]" &&
    !isNaN(value.getTime())
  ) {
    return value;
  }

  const date = new Date(value);

  return isNaN(date.getTime())
    ? null
    : date;
}

function formatDate(value) {
  const date = parseSheetDate(value);

  if (!date) {
    return String(value || "");
  }

  return Utilities.formatDate(
    date,
    TIMEZONE,
    "dd.MM.yyyy HH:mm:ss"
  );
}

function sanitizeCallback(value) {
  return String(value || "callback")
    .replace(/[^a-zA-Z0-9_.$]/g, "") || "callback";
}

function cleanText(value, maxLength) {
  return String(value || "")
    .trim()
    .slice(0, maxLength || 100);
}
