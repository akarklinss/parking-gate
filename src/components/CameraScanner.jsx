import { useEffect, useRef, useState } from "react";
import { scanPlate } from "../services/ocrEngine";

export default function CameraScanner({
  allowedVehicles,
  onSelectCandidate
}) {
  const videoRef = useRef(null);
  const guideRef = useRef(null);
  const streamRef = useRef(null);

  const [cameraReady, setCameraReady] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [status, setStatus] = useState("Kamera nav ieslēgta.");
  const [suggestions, setSuggestions] = useState([]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const startCamera = async () => {
    setStatus("Ieslēdz kameru…");
    streamRef.current?.getTracks().forEach((track) => track.stop());

    let stream;

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      });
    } catch {
      stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false
      });
    }

    streamRef.current = stream;
    videoRef.current.srcObject = stream;
    await videoRef.current.play();

    try {
      const track = stream.getVideoTracks()[0];
      const capabilities = track.getCapabilities?.() || {};
      const advanced = [];

      if (capabilities.focusMode?.includes("continuous")) {
        advanced.push({ focusMode: "continuous" });
      }

      if (capabilities.zoom) {
        const zoom = Math.min(
          capabilities.zoom.max,
          Math.max(capabilities.zoom.min, capabilities.zoom.min + 1)
        );
        advanced.push({ zoom });
      }

      if (advanced.length) {
        await track.applyConstraints({ advanced });
      }
    } catch {
      // Ierīce neatbalsta manuālu fokusēšanu vai zoom.
    }

    setCameraReady(true);
    setStatus("Kamera gatava. Numurzīmi ievieto baltajā rāmī.");
  };

  const runScan = async () => {
    if (!cameraReady) return;

    setScanning(true);
    setSuggestions([]);

    try {
      const result = await scanPlate({
        video: videoRef.current,
        guideElement: guideRef.current,
        allowedVehicles,
        frameCount: 5,
        onStatus: setStatus,
        onProgress: (progress) =>
          setStatus(`OCR nolasīšana… ${progress}%`)
      });

      setSuggestions(result.suggestions);

      if (result.best) {
        const percent = Math.round(result.best.similarity * 100);
        setStatus(
          `Labākais kandidāts: ${result.best.plate} (${percent}%). Apstiprini zemāk.`
        );
      } else {
        setStatus(
          "Drošs kandidāts netika atrasts. Pamēģini vēlreiz vai ievadi manuāli."
        );
      }
    } catch (error) {
      setStatus(`OCR kļūda: ${error.message}`);
    } finally {
      setScanning(false);
    }
  };

  return (
    <section className="card camera-card">
      <div className="camera-wrap">
        <video ref={videoRef} autoPlay playsInline muted />
        <div ref={guideRef} className="plate-guide" />
      </div>

      <div className="camera-buttons">
        <button onClick={startCamera}>
          📷 {cameraReady ? "Restartēt kameru" : "Sākt kameru"}
        </button>
        <button
          className="accent"
          disabled={!cameraReady || scanning}
          onClick={runScan}
        >
          {scanning ? "Analizē…" : "Nolasīt numuru"}
        </button>
      </div>

      <p className="message">{status}</p>

      {suggestions.length ? (
        <div className="candidate-list">
          {suggestions.map((candidate) => (
            <button
              key={candidate.plate}
              className="candidate-button"
              onClick={() => onSelectCandidate(candidate.plate, "OCR_MATCH")}
            >
              <strong>{candidate.plate}</strong>
              <span>
                {Math.round(candidate.similarity * 100)}%
                {candidate.name ? ` · ${candidate.name}` : ""}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
