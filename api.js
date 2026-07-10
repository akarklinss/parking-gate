const ApiClient = (() => {
  let config = {};

  function configure(nextConfig) {
    config = { ...config, ...nextConfig };
  }

  function request(params, timeoutMs = 18000) {
    return new Promise((resolve, reject) => {
      if (!config.apiUrl) {
        reject(new Error("Nav norādīts Apps Script API URL."));
        return;
      }

      let finished = false;
      const callbackName =
        "pgCallback_" + Date.now() + "_" + Math.floor(Math.random() * 1000000);
      const script = document.createElement("script");

      const queryParams = {
        ...params,
        key: config.eventKey || "",
        gate: config.gate || "",
        guard: config.guard || "",
        device: config.device || "",
        callback: callbackName,
        _: Date.now()
      };

      function cleanup() {
        clearTimeout(timer);
        try { delete window[callbackName]; } catch (_) {}
        if (script.parentNode) script.remove();
      }

      function finish(handler, value) {
        if (finished) return;
        finished = true;
        cleanup();
        handler(value);
      }

      window[callbackName] = data => finish(resolve, data);

      script.onerror = () => {
        finish(
          reject,
          new Error("API skripts neielādējās. Pārbaudi /exec URL un piekļuvi.")
        );
      };

      const query = Object.entries(queryParams)
        .map(([key, value]) =>
          encodeURIComponent(key) + "=" + encodeURIComponent(value)
        )
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
    ping: () => request({ action: "ping" }),
    stats: () => request({ action: "stats" }),
    recent: limit => request({ action: "recent", limit: String(limit || 20) }),
    process: (mode, plate, source) =>
      request({
        action: mode === "exit" ? "exit" : "entry",
        plate,
        source: source || "MANUAL"
      })
  };
})();
