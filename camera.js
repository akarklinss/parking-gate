const CameraController = (() => {
  let stream = null;
  let worker = null;
  let workerPromise = null;

  const video = () => document.getElementById("cameraPreview");
  const canvas = () => document.getElementById("captureCanvas");

  async function start() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("Šis pārlūks neatbalsta kameras piekļuvi.");
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
    } catch (firstError) {
      // iPhone/Safari rezerves variants ar vienkāršākiem nosacījumiem.
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
        logger: message => {
          if (message.status === "recognizing text" && typeof onProgress === "function") {
            onProgress(Math.round((message.progress || 0) * 100));
          }
        }
      });

      await created.setParameters({
        tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
        tessedit_pageseg_mode: "7",
        preserve_interword_spaces: "0"
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

  function capturePlateRegion() {
    if (!isRunning()) throw new Error("Vispirms ieslēdz kameru.");

    const source = video();
    const target = canvas();
    const context = target.getContext("2d", { willReadFrequently: true });

    const sourceWidth = source.videoWidth;
    const sourceHeight = source.videoHeight;

    // Izgriež centrālo horizontālo zonu, kur lietotājs ievieto numurzīmi.
    const cropWidth = Math.floor(sourceWidth * 0.84);
    const cropHeight = Math.floor(sourceHeight * 0.32);
    const cropX = Math.floor((sourceWidth - cropWidth) / 2);
    const cropY = Math.floor((sourceHeight - cropHeight) / 2);

    // Ierobežo izmēru, lai OCR telefonā nebūtu pārāk smags.
    const outputWidth = Math.min(1280, cropWidth);
    const outputHeight = Math.max(180, Math.round(outputWidth * cropHeight / cropWidth));

    target.width = outputWidth;
    target.height = outputHeight;

    context.drawImage(
      source,
      cropX, cropY, cropWidth, cropHeight,
      0, 0, outputWidth, outputHeight
    );

    // Vienkārša kontrasta uzlabošana.
    const imageData = context.getImageData(0, 0, outputWidth, outputHeight);
    const pixels = imageData.data;

    for (let i = 0; i < pixels.length; i += 4) {
      const gray = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
      const contrasted = gray > 135 ? 255 : 0;
      pixels[i] = contrasted;
      pixels[i + 1] = contrasted;
      pixels[i + 2] = contrasted;
    }

    context.putImageData(imageData, 0, 0);
    return target;
  }

  function extractPlateCandidate(text) {
    const cleaned = String(text || "")
      .toUpperCase()
      .replace(/[^A-Z0-9\s-]/g, " ")
      .split(/\s+/)
      .map(value => value.replace(/[^A-Z0-9]/g, ""))
      .filter(Boolean);

    const candidates = cleaned
      .filter(value => value.length >= 4 && value.length <= 9)
      .sort((a, b) => {
        const aMixed = /[A-Z]/.test(a) && /\d/.test(a) ? 1 : 0;
        const bMixed = /[A-Z]/.test(b) && /\d/.test(b) ? 1 : 0;
        return bMixed - aMixed || Math.abs(6 - a.length) - Math.abs(6 - b.length);
      });

    return candidates[0] || "";
  }

  async function recognize(onProgress) {
    const image = capturePlateRegion();
    const ocrWorker = await getWorker(onProgress);
    const result = await ocrWorker.recognize(image);
    return {
      plate: extractPlateCandidate(result.data.text),
      rawText: result.data.text || "",
      confidence: Number(result.data.confidence || 0)
    };
  }

  return { start, stop, isRunning, recognize };
})();
