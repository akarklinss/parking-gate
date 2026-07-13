import { QRCodeCanvas } from "qrcode.react";

function buildQrUrl(config) {
  const url = new URL(window.location.origin + "/parking-gate/");
  url.searchParams.set("event", config.eventName);
  url.searchParams.set("api", config.apiUrl);

  if (config.eventKey) {
    url.searchParams.set("key", config.eventKey);
  }

  return url.toString();
}

export default function AdminPanel({
  open,
  onClose,
  config,
  stats,
  logs,
  loading,
  onRefresh
}) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="modal"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            <h2>Pasākuma pārskats</h2>
            <p>{config.eventName}</p>
          </div>
          <button className="icon-button" onClick={onClose}>✕</button>
        </header>

        <div className="admin-stats">
          <div><strong>{stats?.total ?? "–"}</strong><span>Sarakstā</span></div>
          <div><strong>{stats?.ready ?? "–"}</strong><span>Gatavi</span></div>
          <div><strong>{stats?.in ?? "–"}</strong><span>Teritorijā</span></div>
          <div><strong>{stats?.out ?? "–"}</strong><span>Izbraukuši</span></div>
          <div><strong>{stats?.blocked ?? "–"}</strong><span>Bloķēti</span></div>
          <div><strong>{stats?.onlineDevices ?? "–"}</strong><span>Online ierīces</span></div>
        </div>

        <section className="card qr-card">
          <h3>QR kods jaunai ierīcei</h3>
          <p>
            QR aizpilda pasākumu un API. Jaunajā ierīcē atliek ievadīt
            Gate, apsargu un ierīces nosaukumu.
          </p>
          <QRCodeCanvas
            value={buildQrUrl(config)}
            size={240}
            includeMargin
          />
        </section>

        <button onClick={onRefresh} disabled={loading}>
          {loading ? "Atjauno…" : "Atjaunot"}
        </button>

        <h3>Pēdējie notikumi</h3>
        <div className="log-list">
          {logs?.length ? (
            logs.map((log, index) => (
              <article className="log-item" key={`${log.time}-${index}`}>
                <div className="log-top">
                  <strong>{log.plate || "—"} · {log.result}</strong>
                  <span>{log.time}</span>
                </div>
                <div className="log-meta">
                  {[log.name, log.area].filter(Boolean).join(" · ")}
                  <br />
                  {[log.gate, log.guard, log.device, log.source]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </article>
            ))
          ) : (
            <p className="message">LOG vēl nav ierakstu.</p>
          )}
        </div>
      </section>
    </div>
  );
}
