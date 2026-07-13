import { useEffect, useRef, useState } from "react";
import { scanPlate } from "../services/ocrEngine";

export default function CameraScanner({
  allowedVehicles,
  onSelectCandidate
}) {
  const videoRef = useRef(null);
  const previewCanvasRef = useRef(null);
  const guideRef = useRef(null);
  const streamRef = useRef(null);
  const animationFrameRef = useRef(null);

  const [cameraReady, setCameraReady] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [status, setStatus] = useState("Kamera nav ieslēgta.");
  const [suggestions, setSuggestions] = useState([]);

  useEffect(() => {
    return () => stopCamera();
  }, []);

  function stopPreviewLoop() {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }

  function stopCamera() {
    stopPreviewLoop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    const video = videoRef.current;

    if (video) {
      video.pause();
      video.srcObject = null;
    }

    setCameraReady(false);
  }

  function drawPreviewFrame() {
    const video = videoRef.current;
    const canvas = previewCanvasRef.current;

    if (!video || !canvas || !streamRef.current) return;

    if (
      video.readyState >= 2 &&
      video.videoWidth > 0 &&
      video.videoHeight > 0
    ) {
      const width = canvas.clientWidth || 640;
      const height = canvas.clientHeight || 480;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const targetWidth = Math.max(1, Math.round(width * ratio));
      const targetHeight = Math.max(1, Math.round(height * ratio));

      if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
      }

      const context = canvas.getContext("2d");
      const sourceRatio = video.videoWidth / video.videoHeight;
      const targetRatio = targetWidth / targetHeight;

      let sx = 0;
      let sy = 0;
      let sw = video.videoWidth;
      let sh = video.videoHeight;

      if (sourceRatio > targetRatio) {
        sw = video.videoHeight * targetRatio;
        sx = (video.videoWidth - sw) / 2;
      } else {
        sh = video.videoWidth / targetRatio;
        sy = (video.videoHeight - sh) / 2;
      }

      context.drawImage(
        video,
        sx,
        sy,
        sw,
        sh,
        0,
        0,
        targetWidth,
        targetHeight
      );
    }

    animationFrameRef.current = requestAnimationFrame(drawPreviewFrame);
  }

  async function startCamera() {
    setCameraReady(false);
    setSuggestions([]);
    setStatus("Ieslēdz kameru…");
    stopCamera();

    try {
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

      const video = videoRef.current;
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      video.setAttribute("playsinline", "");
      video.setAttribute("webkit-playsinline", "");

      await video.play();

      stopPreviewLoop();
      drawPreviewFrame();
      await new Promise((resolve) => setTimeout(resolve, 300));

      setCameraReady(true);
      setStatus("Kamera gatava. Numurzīmi ievieto baltajā rāmī.");
    } catch (error) {
      stopCamera();
      setStatus(`Kameras kļūda: ${error.message}`);
    }
  }

  async function runScan() {
    if (!cameraReady || scanning) return;

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
  }

  return (
    <section className="card camera-card">
      <video
        ref={videoRef}
        className="camera-source-video"
        autoPlay
        playsInline
        muted
      />

      <div className="camera-wrap">
        <canvas
          ref={previewCanvasRef}
          className="camera-preview-canvas"
        />
        <div ref={guideRef} className="plate-guide" />
      </div>

      <div className="camera-buttons">
        <button type="button" onClick={startCamera}>
          📷 {cameraReady ? "Restartēt kameru" : "Sākt kameru"}
        </button>

        <button
          type="button"
          className="accent scan-button"
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
              type="button"
              key={candidate.plate}
              className="candidate-button"
              onClick={() =>
                onSelectCandidate(candidate.plate, "OCR_MATCH")
              }
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
