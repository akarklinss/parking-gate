import { useCallback, useEffect, useMemo, useState } from "react";
import SetupScreen from "./components/SetupScreen";
import ConnectionBadge from "./components/ConnectionBadge";
import StatsBar from "./components/StatsBar";
import CameraScanner from "./components/CameraScanner";
import ResultCard from "./components/ResultCard";
import AdminPanel from "./components/AdminPanel";
import { ParkingApiClient } from "./services/apiClient";
import { normalizePlate } from "./lib/plateMatcher";
import { usePolling } from "./hooks/usePolling";

const CONFIG_KEY = "parkingGateActiveConfigV5";
const THEME_KEY = "parkingGateTheme";

function readQueryConfig() {
  const params = new URLSearchParams(window.location.search);
  const apiUrl = params.get("api");

  if (!apiUrl) return null;

  return {
    eventName: params.get("event") || "",
    apiUrl,
    eventKey: params.get("key") || "",
    gate: "",
    guard: "",
    device: ""
  };
}

function readSavedConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem(CONFIG_KEY) || "null");
    return readQueryConfig() || saved;
  } catch {
    return readQueryConfig();
  }
}

export default function App() {
  const [config, setConfig] = useState(readSavedConfig);
  const [setupOpen, setSetupOpen] = useState(!config);
  const [setupBusy, setSetupBusy] = useState(false);
  const [setupMessage, setSetupMessage] = useState(null);

  const [mode, setMode] = useState("entry");
  const [plate, setPlate] = useState("");
  const [source, setSource] = useState("MANUAL");
  const [result, setResult] = useState(null);

  const [stats, setStats] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [logs, setLogs] = useState([]);
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminLoading, setAdminLoading] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "dark" || saved === "light") return saved;
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  });
  const [screenFlash, setScreenFlash] = useState("");

  const api = useMemo(
    () => (config ? new ParkingApiClient(config) : null),
    [config]
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  };

  const triggerScreenFlash = (resultCode) => {
    const positive = ["ENTRY_ALLOWED", "EXIT_RECORDED"].includes(resultCode);
    const warning = [
      "ALREADY_IN",
      "TOO_EARLY",
      "EXIT_AFTER_DEADLINE",
      "NOT_IN"
    ].includes(resultCode);

    const next = positive ? "success" : warning ? "warning" : "error";
    setScreenFlash("");
    window.setTimeout(() => setScreenFlash(next), 20);
    window.setTimeout(() => setScreenFlash(""), 1800);
  };

  useEffect(() => {
    const onlineHandler = () => setOnline(true);
    const offlineHandler = () => setOnline(false);
    const updateHandler = () => setUpdateAvailable(true);

    window.addEventListener("online", onlineHandler);
    window.addEventListener("offline", offlineHandler);
    window.addEventListener(
      "parking-gate-update-available",
      updateHandler
    );

    return () => {
      window.removeEventListener("online", onlineHandler);
      window.removeEventListener("offline", offlineHandler);
      window.removeEventListener(
        "parking-gate-update-available",
        updateHandler
      );
    };
  }, []);

  const refreshStats = useCallback(async () => {
    if (!api) return;

    try {
      const data = await api.stats();
      if (data.ok) setStats(data);
    } catch {
      // Online indikators jau parāda savienojuma stāvokli.
    }
  }, [api]);

  const refreshVehicles = useCallback(async () => {
    if (!api) return;

    try {
      const data = await api.vehicles();
      if (data.ok) setVehicles(data.vehicles || []);
    } catch {
      // Manuālā ievade joprojām darbojas.
    }
  }, [api]);

  const heartbeat = useCallback(async () => {
    if (!api) return;
    try {
      await api.heartbeat();
    } catch {
      // Heartbeat nav kritiska darbība.
    }
  }, [api]);

  usePolling(refreshStats, 5000, Boolean(api && !setupOpen));
  usePolling(heartbeat, 10000, Boolean(api && !setupOpen));
  usePolling(refreshVehicles, 60000, Boolean(api && !setupOpen));

  useEffect(() => {
    if (!api || setupOpen) return;
    refreshVehicles();
  }, [api, setupOpen, refreshVehicles]);

  const saveConfig = async (nextConfig) => {
    setSetupBusy(true);
    setSetupMessage(null);

    if (
      !/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec/i.test(
        nextConfig.apiUrl
      )
    ) {
      setSetupMessage({
        type: "error",
        text: "Ievadi derīgu Apps Script /exec URL."
      });
      setSetupBusy(false);
      return;
    }

    if (!nextConfig.gate || !nextConfig.guard || !nextConfig.device) {
      setSetupMessage({
        type: "error",
        text: "Ievadi Gate, apsargu un ierīces nosaukumu."
      });
      setSetupBusy(false);
      return;
    }

    try {
      const client = new ParkingApiClient(nextConfig);
      const ping = await client.ping();

      if (!ping.ok) {
        throw new Error(ping.error || "API neatbildēja pareizi.");
      }

      localStorage.setItem(CONFIG_KEY, JSON.stringify(nextConfig));
      setConfig(nextConfig);
      setSetupOpen(false);
      setSetupMessage(null);
    } catch (error) {
      setSetupMessage({
        type: "error",
        text: error.message
      });
    } finally {
      setSetupBusy(false);
    }
  };

  const processPlate = async () => {
    const normalized = normalizePlate(plate);
    setPlate(normalized);

    if (!normalized || !api) return;

    setResult({ pending: true });

    try {
      const data = await api.process(mode, normalized, source);
      setResult(data);
      triggerScreenFlash(data.result);
      refreshStats();

      if (navigator.vibrate) {
        const positive = [
          "ENTRY_ALLOWED",
          "EXIT_RECORDED"
        ].includes(data.result);

        navigator.vibrate(
          positive ? 80 : [140, 70, 140]
        );
      }
    } catch (error) {
      setResult({
        result: "ERROR",
        plate: normalized,
        notes: error.message
      });
    }
  };

  const loadAdmin = async () => {
    if (!api) return;

    setAdminLoading(true);

    try {
      const [statsData, logsData] = await Promise.all([
        api.stats(),
        api.recent(30)
      ]);

      if (statsData.ok) setStats(statsData);
      if (logsData.ok) setLogs(logsData.logs || []);
    } finally {
      setAdminLoading(false);
    }
  };

  const openAdmin = async () => {
    setAdminOpen(true);
    await loadAdmin();
  };

  if (setupOpen || !config) {
    return (
      <main className="app-shell">
        <SetupScreen
          initialConfig={config || readQueryConfig()}
          onSave={saveConfig}
          busy={setupBusy}
          message={setupMessage}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1>{config.eventName || "Parking Gate"}</h1>
          <p>
            {config.gate} · {config.guard} · {config.device}
          </p>
        </div>

        <div className="topbar-actions">
          <ConnectionBadge online={online} />
          <button
            className="icon-button theme-button"
            onClick={toggleTheme}
            aria-label="Mainīt dienas vai nakts režīmu"
          >
            {theme === "dark" ? "☀" : "☾"}
          </button>
          <button
            className="icon-button"
            onClick={() => setSetupOpen(true)}
            aria-label="Mainīt pasākumu vai iestatījumus"
          >
            ⚙
          </button>
        </div>
      </header>

      {updateAvailable ? (
        <button
          className="update-banner"
          onClick={() => window.location.reload()}
        >
          Pieejama jauna versija — atjaunināt
        </button>
      ) : null}

      <section className="mode-switch">
        <button
          className={mode === "entry" ? "active" : ""}
          onClick={() => setMode("entry")}
        >
          IEBRAUKŠANA
        </button>
        <button
          className={mode === "exit" ? "active exit" : ""}
          onClick={() => setMode("exit")}
        >
          IZBRAUKŠANA
        </button>
      </section>

      <StatsBar stats={stats} onOpenAdmin={openAdmin} />

      <CameraScanner
        allowedVehicles={vehicles}
        onSelectCandidate={(candidate, candidateSource) => {
          setPlate(candidate);
          setSource(candidateSource);
        }}
      />

      <section className="card">
        <label>Auto numurs</label>
        <input
          className="plate-input"
          value={plate}
          onChange={(event) => {
            setPlate(normalizePlate(event.target.value));
            setSource("MANUAL");
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") processPlate();
          }}
          placeholder="AB1234"
          inputMode="latin"
          autoCapitalize="characters"
          autoComplete="off"
        />

        <button className="primary large" onClick={processPlate}>
          {mode === "entry"
            ? "PĀRBAUDĪT / IELAIST"
            : "REĢISTRĒT IZBRAUKŠANU"}
        </button>

        <button
          className="secondary"
          onClick={() => {
            setPlate("");
            setSource("MANUAL");
            setResult(null);
          }}
        >
          Notīrīt
        </button>
      </section>

      <ResultCard result={result} pendingPlate={plate} />

      <button className="secondary full-width" onClick={openAdmin}>
        Statistika, ierīces un darbību vēsture
      </button>

      {screenFlash ? (
        <div
          className={`screen-flash screen-flash-${screenFlash}`}
          aria-hidden="true"
        />
      ) : null}

      <AdminPanel
        open={adminOpen}
        onClose={() => setAdminOpen(false)}
        config={config}
        stats={stats}
        logs={logs}
        loading={adminLoading}
        onRefresh={loadAdmin}
      />
    </main>
  );
}
