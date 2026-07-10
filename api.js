const ApiClient = (() => {
  let c = {};
  function configure(n) {
    c = { ...c, ...n };
  }
  function req(params) {
    return new Promise((resolve, reject) => {
      if (!c.apiUrl) return reject(new Error("Nav norādīts API URL."));
      const cb = "pg_" + Date.now() + "_" + Math.floor(Math.random() * 1e6),
        s = document.createElement("script");
      let done = false;
      const clean = () => {
        delete window[cb];
        s.remove();
      };
      window[cb] = (d) => {
        if (done) return;
        done = true;
        clearTimeout(t);
        clean();
        resolve(d);
      };
      s.onerror = () => {
        if (done) return;
        done = true;
        clearTimeout(t);
        clean();
        reject(new Error("API skripts neielādējās."));
      };
      const q = new URLSearchParams({
        ...params,
        key: c.eventKey || "",
        gate: c.gate || "",
        guard: c.guard || "",
        callback: cb,
        _: Date.now(),
      });
      s.src = c.apiUrl + "?" + q;
      document.head.appendChild(s);
      const t = setTimeout(() => {
        if (done) return;
        done = true;
        clean();
        reject(new Error("API neatbildēja laikā."));
      }, 18000);
    });
  }
  return {
    configure,
    ping: () => req({ action: "ping" }),
    stats: () => req({ action: "stats" }),
    recent: (n) => req({ action: "recent", limit: n || 20 }),
    process: (mode, plate, source) =>
      req({
        action: mode === "exit" ? "exit" : "entry",
        plate,
        source: source || "MANUAL",
      }),
  };
})();
