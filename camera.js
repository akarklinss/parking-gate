const CameraController = (() => {
  let stream = null;
  let worker = null;
  let workerPromise = null;

  const video = () => document.getElementById("cameraPreview");
  const canvas = () => document.getElementById("captureCanvas");

  async function start() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("Šis pārlūks neatbalsta kameru.");
    }

    stop();

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      });
    } catch (_) {
      stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false
      });
    }

    video().srcObject = stream;
    await video().play();
  }

  function stop() {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      stream = null;
    }

    if (video()) video().srcObject = null;
  }

  function isRunning() {
    return Boolean(stream && video() && video().readyState >= 2);
  }

  async function getWorker(onProgress) {
    if (worker) return worker;
    if (workerPromise) return workerPromise;

    workerPromise = (async () => {
      if (!window.Tesseract) {
        throw new Error("OCR bibliotēka nav ielādējusies.");
      }

      const created = await Tesseract.createWorker("eng", 1, {
        logger(message) {
          if (
            message.status === "recognizing text" &&
            typeof onProgress === "function"
          ) {
            onProgress(Math.round((message.progress || 0) * 100));
          }
        }
      });

      await created.setParameters({
        tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
        tessedit_pageseg_mode: "7"
      });

      worker = created;
      return worker;
    })();

    try {
      return await workerPromise;
    } finally {
      workerPromise = null;
    }
  }

  function captureGuideArea() {
    if (!isRunning()) throw new Error("Vispirms ieslēdz kameru.");

    const source = video();
    const target = canvas();
    const sourceWidth = source.videoWidth;
    const sourceHeight = source.videoHeight;

    const cropWidth = Math.floor(sourceWidth * 0.82);
    const cropHeight = Math.floor(sourceHeight * 0.28);
    const cropX = Math.floor((sourceWidth - cropWidth) / 2);
    const cropY = Math.floor((sourceHeight - cropHeight) / 2);

    const outputWidth = Math.min(1400, Math.max(800, cropWidth));
    const outputHeight = Math.max(
      180,
      Math.round(outputWidth * cropHeight / cropWidth)
    );

    target.width = outputWidth;
    target.height = outputHeight;

    const ctx = target.getContext("2d", { willReadFrequently: true });

    ctx.drawImage(
      source,
      cropX, cropY, cropWidth, cropHeight,
      0, 0, outputWidth, outputHeight
    );

    const imageData = ctx.getImageData(0, 0, outputWidth, outputHeight);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const adjusted = gray > 140 ? 255 : 0;
      data[i] = adjusted;
      data[i + 1] = adjusted;
      data[i + 2] = adjusted;
    }

    ctx.putImageData(imageData, 0, 0);
    return target;
  }

  function selectCandidate(text) {
    const tokens = String(text || "")
      .toUpperCase()
      .split(/\s+/)
      .map(value => value.replace(/[^A-Z0-9]/g, ""))
      .filter(value => value.length >= 4 && value.length <= 9);

    const candidates = [...new Set(tokens)].filter(value => {
      return /[A-Z]/.test(value) && /\d/.test(value);
    });

    candidates.sort((a, b) => {
      const aScore =
        (/^[A-Z]{1,3}\d{1,4}$/.test(a) ? 10 : 0) -
        Math.abs(a.length - 6);
      const bScore =
        (/^[A-Z]{1,3}\d{1,4}$/.test(b) ? 10 : 0) -
        Math.abs(b.length - 6);
      return bScore - aScore;
    });

    return candidates[0] || "";
  }

  async function recognize(onProgress) {
    const image = captureGuideArea();
    const ocrWorker = await getWorker(onProgress);
    const result = await ocrWorker.recognize(image);

    return {
      plate: selectCandidate(result.data.text),
      rawText: result.data.text || "",
      confidence: Number(result.data.confidence || 0)
    };
  }

  return {
    start,
    stop,
    isRunning,
    recognize
  };
})();
