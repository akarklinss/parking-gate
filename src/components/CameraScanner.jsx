import { useEffect, useRef, useState } from "react";
import { prepareOcr, scanPlate } from "../services/ocrEngine";

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
  const [rawCandidates, setRawCandidates] = useState([]);
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

      // Mobilajā ierīcē pietiek ar 1x priekšskatījumu.
      // Tas būtiski samazina CPU slodzi.
      const targetWidth = Math.max(1, Math.round(width));
      const targetHeight = Math.max(1, Math.round(height));

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
    setRawCandidates([]);
    setSuggestions([]);
    setStatus("Ieslēdz kameru…");
    stopCamera();

    try {
      let stream;

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 }
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

      setCameraReady(true);
      setStatus("Kamera gatava. Sagatavo OCR…");

      // OCR modelis ielādējas fonā, nevis tikai pēc pogas nospiešanas.
      prepareOcr((message) => setStatus(message))
        .then(() => {
          setStatus("Kamera un OCR gatavi. Numurzīmi ievieto baltajā rāmī.");
        })
        .catch(() => {
          setStatus("Kamera gatava. OCR ielādēsies pie pirmās nolasīšanas.");
        });
    } catch (error) {
      stopCamera();
      setStatus(`Kameras kļūda: ${error.message}`);
    }
  }

  async function runScan() {
    if (!cameraReady || scanning) return;

    setScanning(true);
    setRawCandidates([]);
    setSuggestions([]);
    setStatus("Sagatavo nolasīšanu…");

    // Apstādina canvas priekšskatījumu, lai OCR laikā netērētu CPU.
    stopPreviewLoop();

    // Ļauj React vispirms uz ekrāna parādīt "Analizē…".
    await new Promise((resolve) => setTimeout(resolve, 80));

    try {
      const result = await scanPlate({
        video: videoRef.current,
        guideElement: guideRef.current,
        allowedVehicles,
        frameCount: 4,
        onStatus: setStatus,
        onProgress: (progress) =>
          setStatus(`OCR nolasīšana… ${progress}%`)
      });

      setRawCandidates(result.rawCandidates || []);
      setSuggestions(result.suggestions || []);

      if (result.bestRaw) {
        const listedMatch = result.best
          ? ` Tuvākais saraksta variants: ${result.best.plate}.`
          : " Numurs var nebūt PARKING sarakstā.";

        setStatus(
          `OCR nolasīja: ${result.bestRaw}.${listedMatch} Apstiprini numuru zemāk.`
        );
      } else {
        setStatus(
          "OCR neizdevās nolasīt nevienu numuru. Pamēģini vēlreiz vai ievadi manuāli."
        );
      }
    } catch (error) {
      setStatus(`OCR kļūda: ${error.message}`);
    } finally {
      setScanning(false);

      if (streamRef.current) {
        drawPreviewFrame();
      }
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

        {scanning ? (
          <div className="scan-overlay">
            <div className="scan-spinner" />
            <strong>Analizē numurzīmi…</strong>
            <span>Neaizver aplikāciju</span>
          </div>
        ) : null}
      </div>

      <div className="camera-buttons">
        <button type="button" onClick={startCamera} disabled={scanning}>
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

      {rawCandidates.length ? (
        <div className="candidate-list">
          <p className="candidate-heading">OCR nolasītie numuri</p>
          {rawCandidates.map((candidate, index) => (
            <button
              type="button"
              key={`raw-${candidate}`}
              className="candidate-button raw-candidate-button"
              onClick={() => onSelectCandidate(candidate, "OCR_RAW")}
            >
              <strong>{candidate}</strong>
              <span>{index === 0 ? "Labākais OCR variants" : "OCR variants"}</span>
            </button>
          ))}
        </div>
      ) : null}

      {suggestions.length ? (
        <div className="candidate-list listed-candidate-list">
          <p className="candidate-heading">Līdzīgākie numuri PARKING sarakstā</p>
          {suggestions.map((candidate) => (
            <button
              type="button"
              key={`listed-${candidate.plate}`}
              className="candidate-button"
              onClick={() =>
                onSelectCandidate(candidate.plate, "OCR_LIST_MATCH")
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
