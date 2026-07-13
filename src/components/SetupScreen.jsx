import { useCallback, useEffect, useState } from "react";
import QrLoginScanner from "./QrLoginScanner";

const EMPTY_CONFIG = {
  eventName: "",
  apiUrl: "",
  eventKey: "",
  gate: "",
  guard: "",
  device: ""
};

export default function SetupScreen({
  initialConfig,
  onSave,
  busy,
  message,
  theme,
  onToggleTheme
}) {
  const [form, setForm] = useState({
    ...EMPTY_CONFIG,
    ...initialConfig
  });
  const [qrOpen, setQrOpen] = useState(false);

  useEffect(() => {
    setForm({
      ...EMPTY_CONFIG,
      ...initialConfig
    });
  }, [initialConfig]);

  const update = (key, value) => {
    setForm((current) => ({
      ...current,
      [key]: value
    }));
  };

  const handleQrDetected = useCallback((qrConfig) => {
    setForm((current) => ({
      ...current,
      ...qrConfig
    }));
    setQrOpen(false);
  }, []);

  return (
    <section className="screen setup-screen">
      <header className="brand setup-brand">
        <div className="brand-left">
          <div className="brand-logo">P</div>
          <div>
            <h1>Parking Gate</h1>
            <p>Aktīvā pasākuma konfigurācija</p>
          </div>
        </div>

        <button
          type="button"
          className="icon-button theme-button"
          onClick={onToggleTheme}
          aria-label="Mainīt dienas vai nakts režīmu"
        >
          {theme === "dark" ? "☀" : "☾"}
        </button>
      </header>

      <div className="card">
        <button
          type="button"
          className="qr-login-button"
          onClick={() => setQrOpen(true)}
        >
          ▣ Pieslēgties ar QR kodu
        </button>

        <p className="setup-hint">
          QR aizpildīs pasākuma nosaukumu, Apps Script URL un atslēgu.
          Gate, apsargu un ierīci ievadi šajā telefonā.
        </p>

        <label>Pasākuma nosaukums</label>
        <input
          value={form.eventName}
          onChange={(event) => update("eventName", event.target.value)}
          placeholder="Summer Festival 2026"
        />

        <label>Apps Script Web App URL</label>
        <input
          value={form.apiUrl}
          onChange={(event) => update("apiUrl", event.target.value)}
          placeholder="https://script.google.com/macros/s/.../exec"
          inputMode="url"
        />

        <label>
          Pasākuma atslēga <span>(neobligāti)</span>
        </label>
        <input
          value={form.eventKey}
          onChange={(event) => update("eventKey", event.target.value)}
          type="password"
          autoComplete="off"
        />

        <label>Gate / iebrauktuve</label>
        <input
          value={form.gate}
          onChange={(event) => update("gate", event.target.value)}
          placeholder="VIP Gate"
        />

        <label>Apsargs</label>
        <input
          value={form.guard}
          onChange={(event) => update("guard", event.target.value)}
          placeholder="Jānis vai ID-12"
        />

        <label>Ierīces nosaukums</label>
        <input
          value={form.device}
          onChange={(event) => update("device", event.target.value)}
          placeholder="iPhone Gate 1"
        />

        <button
          className="primary large"
          disabled={busy}
          onClick={() => onSave(form)}
        >
          {busy ? "Pārbauda savienojumu…" : "Saglabāt un sākt darbu"}
        </button>

        {message ? (
          <p className={`message ${message.type || ""}`}>
            {message.text}
          </p>
        ) : null}
      </div>

      <QrLoginScanner
        open={qrOpen}
        onClose={() => setQrOpen(false)}
        onDetected={handleQrDetected}
      />
    </section>
  );
}
