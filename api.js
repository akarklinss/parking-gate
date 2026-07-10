const ApiClient = (() => {
  let config = {
    apiUrl: "",
    eventKey: "",
    gate: "",
    guard: ""
  };

  function configure(nextConfig) {
    config = { ...config, ...nextConfig };
  }

  function jsonpRequest(params, timeoutMs = 18000) {
    return new Promise((resolve, reject) => {
      if (!config.apiUrl) {
        reject(new Error("Nav norādīts Apps Script API URL."));
        return;
      }

      let settled = false;
      const callbackName =
        "pgCallback_" + Date.now() + "_" + Math.floor(Math.random() * 1000000);
      const script = document.createElement("script");

      const fullParams = {
        ...params,
        key: config.eventKey || "",
        gate: config.gate || "",
        guard: config.guard || "",
        callback: callbackName,
        _: Date.now()
      };

      function cleanup() {
        if (script.parentNode) script.remove();
        try { delete window[callbackName]; } catch (_) { window[callbackName] = undefined; }
      }

      function finish(handler, value) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        cleanup();
        handler(value);
      }

      window[callbackName] = data => finish(resolve, data);

      script.onerror = () =>
        finish(reject, new Error("API skripts neielādējās. Pārbaudi Web App URL un piekļuvi."));

      const query = Object.entries(fullParams)
        .map(([key, value]) => encodeURIComponent(key) + "=" + encodeURIComponent(value))
        .join("&");

      script.src = config.apiUrl.replace(/\?+$/, "") + "?" + query;
      document.head.appendChild(script);

      const timer = setTimeout(() => {
        finish(reject, new Error("API neatbildēja noteiktajā laikā."));
      }, timeoutMs);
    });
  }

  return {
    configure,
    ping: () => jsonpRequest({ action: "ping" }),
    stats: () => jsonpRequest({ action: "stats" }),
    recent: limit => jsonpRequest({ action: "recent", limit: String(limit || 20) }),
    process: (mode, plate, source) =>
      jsonpRequest({
        action: mode === "exit" ? "exit" : "entry",
        plate,
        source: source || "MANUAL"
      })
  };
})();
