export class ParkingApiClient {
  constructor(config) {
    this.configure(config);
  }

  configure(config) {
    this.config = {
      apiUrl: "",
      eventKey: "",
      gate: "",
      guard: "",
      device: "",
      ...config
    };
  }

  request(params, timeoutMs = 20000) {
    return new Promise((resolve, reject) => {
      if (!this.config.apiUrl) {
        reject(new Error("Nav norādīts Apps Script API URL."));
        return;
      }

      let settled = false;
      const callbackName =
        "pgCallback_" + Date.now() + "_" + Math.floor(Math.random() * 1e7);
      const script = document.createElement("script");

      const fullParams = {
        ...params,
        key: this.config.eventKey || "",
        gate: this.config.gate || "",
        guard: this.config.guard || "",
        device: this.config.device || "",
        callback: callbackName,
        _: Date.now()
      };

      const cleanup = () => {
        if (script.parentNode) script.remove();
        try {
          delete window[callbackName];
        } catch {
          window[callbackName] = undefined;
        }
      };

      const finish = (handler, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        cleanup();
        handler(value);
      };

      window[callbackName] = (data) => finish(resolve, data);

      script.onerror = () =>
        finish(
          reject,
          new Error("API skripts neielādējās. Pārbaudi /exec URL un piekļuvi.")
        );

      const query = Object.entries(fullParams)
        .map(([key, value]) =>
          encodeURIComponent(key) + "=" + encodeURIComponent(value)
        )
        .join("&");

      script.src = this.config.apiUrl.replace(/\?+$/, "") + "?" + query;
      document.head.appendChild(script);

      const timer = setTimeout(
        () => finish(reject, new Error("API neatbildēja noteiktajā laikā.")),
        timeoutMs
      );
    });
  }

  ping() {
    return this.request({ action: "ping" });
  }

  stats() {
    return this.request({ action: "stats" });
  }

  recent(limit = 25) {
    return this.request({ action: "recent", limit });
  }

  vehicles() {
    return this.request({ action: "vehicles" }, 30000);
  }

  heartbeat() {
    return this.request({ action: "heartbeat" });
  }

  process(mode, plate, source = "MANUAL") {
    return this.request({
      action: mode === "exit" ? "exit" : "entry",
      plate,
      source
    });
  }
}
