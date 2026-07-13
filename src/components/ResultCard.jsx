const RESULT_VIEW = {
  ENTRY_ALLOWED: ["ok", "✓", "ATĻAUTS"],
  ALREADY_IN: ["warning", "!", "JAU IEBRAUCIS"],
  BLOCKED: ["bad", "✕", "BLOĶĒTS"],
  TOO_EARLY: ["warning", "⏱", "VĒL NAV DERĪGS"],
  EXPIRED: ["bad", "⌛", "TERMIŅŠ BEIDZIES"],
  NOT_FOUND: ["bad", "✕", "NAV SARAKSTĀ"],
  EXIT_RECORDED: ["ok", "✓", "IZBRAUKŠANA REĢISTRĒTA"],
  EXIT_AFTER_DEADLINE: ["warning", "!", "IZBRAUCA PĒC DEADLINE"],
  NOT_IN: ["warning", "!", "NAV STATUSA IN"],
  EXIT_NOT_FOUND: ["bad", "✕", "NAV SARAKSTĀ"],
  ERROR: ["bad", "✕", "KĻŪDA"]
};

function detailsFor(result) {
  if (!result) return "Nolasi vai ievadi auto numuru.";

  const person = [result.name, result.area].filter(Boolean).join(" · ");

  if (result.result === "ALREADY_IN") {
    return `${person} Iebrauca: ${result.entryTime || ""}`.trim();
  }

  if (result.result === "TOO_EARLY") {
    return `${person} Derīgs no: ${result.validFrom || ""}`.trim();
  }

  if (result.result === "EXPIRED") {
    return `${person} Derīgs līdz: ${result.validUntil || ""}`.trim();
  }

  if (
    result.result === "EXIT_RECORDED" ||
    result.result === "EXIT_AFTER_DEADLINE"
  ) {
    return `${person} Izbrauca: ${result.exitTime || ""}`.trim();
  }

  return [person, result.notes].filter(Boolean).join(" · ");
}

export default function ResultCard({ result, pendingPlate }) {
  if (!result) {
    return (
      <section className="result-card neutral">
        <div className="result-icon">ⓘ</div>
        <div className="result-title">Gatavs darbam</div>
        <div className="result-details">
          Nolasi vai ievadi auto numuru.
        </div>
      </section>
    );
  }

  if (result.pending) {
    return (
      <section className="result-card info">
        <div className="result-icon">…</div>
        <div className="result-title">Pārbauda</div>
        <div className="result-plate">{pendingPlate}</div>
        <div className="result-details">
          Sazinās ar Google Sheet…
        </div>
      </section>
    );
  }

  const view = RESULT_VIEW[result.result] || [
    "bad",
    "✕",
    "NEZINĀMS REZULTĀTS"
  ];

  return (
    <section className={`result-card ${view[0]}`}>
      <div className="result-icon">{view[1]}</div>
      <div className="result-title">{view[2]}</div>
      <div className="result-plate">{result.plate}</div>
      <div className="result-details">{detailsFor(result)}</div>
    </section>
  );
}
