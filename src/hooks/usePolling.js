import { useEffect } from "react";

export function usePolling(callback, intervalMs, enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;

    callback();
    const timer = window.setInterval(callback, intervalMs);

    return () => window.clearInterval(timer);
  }, [callback, intervalMs, enabled]);
}
