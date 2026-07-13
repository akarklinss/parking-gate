import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";

function parseConfig(value) {
  try {
    const url = new URL(value);
    const apiUrl = url.searchParams.get("api") || "";

    if (!apiUrl) {
      throw new Error("QR kodā nav Apps Script URL.");
    }

    return {
      eventName: url.searchParams.get("event") || "",
      apiUrl,
      eventKey: url.searchParams.get("key") || ""
    };
  } catch (error) {
    throw new Error(error.message || "QR kods nav derīgs.");
  }
}

export default function QrLoginScanner({ open, onClose, onDetected }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const frameRef = useRef(null);
  const lastScanRef = useRef(0);
  const [status, setStatus] = useState("Sagatavo kameru…");

  useEffect(() => {
    if (!open) return undefined;

    let cancelled = false;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 640 },
            height: { ideal: 480 }
          },
          audio: false
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        const video = videoRef.current;
        video.srcObject = stream;
        video.setAttribute("playsinline", "");
        video.setAttribute("webkit-playsinline", "");
        await video.play();
        setStatus("Novieto konfigurācijas QR kodu rāmī.");
        frameRef.current = requestAnimationFrame(scanFrame);
      } catch (error) {
        setStatus(`Kameras kļūda: ${error.message}`);
      }
    }

    function scanFrame(timestamp) {
      if (cancelled) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (
        video?.readyState >= 2 &&
        video.videoWidth > 0 &&
        timestamp - lastScanRef.current >= 120
      ) {
        lastScanRef.current = timestamp;
        const width = 640;
        const height = Math.round(width * video.videoHeight / video.videoWidth);
        canvas.width = width;
        canvas.height = height;

        const context = canvas.getContext("2d", { willReadFrequently: true });
        context.drawImage(video, 0, 0, width, height);
        const image = context.getImageData(0, 0, width, height);
        const code = jsQR(image.data, image.width, image.height, {
          inversionAttempts: "dontInvert"
        });

        if (code?.data) {
          try {
            const parsed = parseConfig(code.data);
            setStatus("QR kods nolasīts.");
            stop();
            onDetected(parsed);
            return;
          } catch (error) {
            setStatus(error.message);
          }
        }
      }

      frameRef.current = requestAnimationFrame(scanFrame);
    }

    function stop() {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    }

    start();

    return () => {
      cancelled = true;
      stop();
    };
  }, [open, onDetected]);

  if (!open) return null;

  return (
    <div className="modal-backdrop qr-login-backdrop" onClick={onClose}>
      <section className="modal qr-login-modal" onClick={(event) => event.stopPropagation()}>
        <header className="modal-header">
          <div>
            <h2>Pieslēgties ar QR</h2>
            <p>Noskenē administratora konfigurācijas QR kodu.</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose}>✕</button>
        </header>

        <div className="qr-scanner-wrap">
          <video
            ref={videoRef}
            className="qr-source-video"
            autoPlay
            muted
            playsInline
          />
          <canvas ref={canvasRef} className="qr-preview-canvas" />
          <div className="qr-guide" />
        </div>

        <p className="message">{status}</p>
      </section>
    </div>
  );
}
