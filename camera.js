const CameraController = (() => {
  let stream = null;
  let worker = null;
  let workerPromise = null;

  const video = () => document.getElementById("cameraPreview");
  const hiddenCanvas = () => document.getElementById("captureCanvas");
  const guide = () => document.querySelector(".plate-guide");

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

    const videoElement = video();
    videoElement.srcObject = stream;
    await videoElement.play();

    // Mēģina ieslēgt nepārtrauktu fokusu, ja ierīce to atbalsta.
    try {
      const track = stream.getVideoTracks()[0];
      const capabilities = track.getCapabilities ? track.getCapabilities() : {};

      if (capabilities.focusMode?.includes("continuous")) {
        await track.applyConstraints({
          advanced: [{ focusMode: "continuous" }]
        });
      }
    } catch (_) {
      // Ne visas pārlūkprogrammas atbalsta focusMode.
    }
  }

  function stop() {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      stream = null;
    }

    const videoElement = video();

    if (videoElement) {
      videoElement.srcObject = null;
    }
  }

  function isRunning() {
    const videoElement = video();

    return Boolean(
      stream &&
      videoElement &&
      videoElement.readyState >= 2 &&
      videoElement.videoWidth > 0 &&
      videoElement.videoHeight > 0
    );
  }

  async function getWorker(onProgress) {
    if (worker) return worker;
    if (workerPromise) return workerPromise;

    workerPromise = (async () => {
      if (!window.Tesseract) {
        throw new Error("OCR bibliotēka nav ielādējusies.");
      }

      const createdWorker = await Tesseract.createWorker("eng", 1, {
        logger(message) {
          if (
            message.status === "recognizing text" &&
            typeof onProgress === "function"
          ) {
            onProgress(Math.round((message.progress || 0) * 100));
          }
        }
      });

      await createdWorker.setParameters({
        tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
        preserve_interword_spaces: "0"
      });

      worker = createdWorker;
      return worker;
    })();

    try {
      return await workerPromise;
    } finally {
      workerPromise = null;
    }
  }

  /**
   * Precīzi pārvērš balto ekrāna rāmi par koordinātēm kameras oriģinālajā kadrā.
   * Tas ir svarīgi iPhone, jo video izmanto object-fit: cover.
   */
  function getGuideCropInSourcePixels() {
    const videoElement = video();
    const guideElement = guide();

    if (!guideElement) {
      throw new Error("Numurzīmes rāmis nav atrasts.");
    }

    const videoRect = videoElement.getBoundingClientRect();
    const guideRect = guideElement.getBoundingClientRect();

    const sourceWidth = videoElement.videoWidth;
    const sourceHeight = videoElement.videoHeight;

    const coverScale = Math.max(
      videoRect.width / sourceWidth,
      videoRect.height / sourceHeight
    );

    const renderedWidth = sourceWidth * coverScale;
    const renderedHeight = sourceHeight * coverScale;

    const hiddenLeft = Math.max(0, (renderedWidth - videoRect.width) / 2);
    const hiddenTop = Math.max(0, (renderedHeight - videoRect.height) / 2);

    const guideLeftInsideVideo = guideRect.left - videoRect.left;
    const guideTopInsideVideo = guideRect.top - videoRect.top;

    let sourceX = (guideLeftInsideVideo + hiddenLeft) / coverScale;
    let sourceY = (guideTopInsideVideo + hiddenTop) / coverScale;
    let sourceCropWidth = guideRect.width / coverScale;
    let sourceCropHeight = guideRect.height / coverScale;

    // Nedaudz paplašina rāmi, lai nenogrieztu numurzīmes malas.
    const paddingX = sourceCropWidth * 0.08;
    const paddingY = sourceCropHeight * 0.16;

    sourceX -= paddingX;
    sourceY -= paddingY;
    sourceCropWidth += paddingX * 2;
    sourceCropHeight += paddingY * 2;

    sourceX = Math.max(0, sourceX);
    sourceY = Math.max(0, sourceY);
    sourceCropWidth = Math.min(sourceWidth - sourceX, sourceCropWidth);
    sourceCropHeight = Math.min(sourceHeight - sourceY, sourceCropHeight);

    return {
      x: Math.round(sourceX),
      y: Math.round(sourceY),
      width: Math.round(sourceCropWidth),
      height: Math.round(sourceCropHeight)
    };
  }

  function captureOriginalCrop() {
    if (!isRunning()) {
      throw new Error("Vispirms ieslēdz kameru.");
    }

    const videoElement = video();
    const targetCanvas = hiddenCanvas();
    const crop = getGuideCropInSourcePixels();

    // Palielina izgriezumu, jo Tesseract labāk lasa lielākus simbolus.
    const outputWidth = 1400;
    const outputHeight = Math.max(
      260,
      Math.round(outputWidth * crop.height / crop.width)
    );

    targetCanvas.width = outputWidth;
    targetCanvas.height = outputHeight;

    const context = targetCanvas.getContext("2d", {
      willReadFrequently: true
    });

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";

    context.drawImage(
      videoElement,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      0,
      0,
      outputWidth,
      outputHeight
    );

    return targetCanvas;
  }

  function cloneCanvas(sourceCanvas) {
    const result = document.createElement("canvas");
    result.width = sourceCanvas.width;
    result.height = sourceCanvas.height;
    result.getContext("2d").drawImage(sourceCanvas, 0, 0);
    return result;
  }

  function makeGrayscaleCanvas(sourceCanvas, contrast = 1.4) {
    const result = cloneCanvas(sourceCanvas);
    const context = result.getContext("2d", {
      willReadFrequently: true
    });

    const imageData = context.getImageData(
      0,
      0,
      result.width,
      result.height
    );

    const pixels = imageData.data;

    for (let i = 0; i < pixels.length; i += 4) {
      const gray =
        0.299 * pixels[i] +
        0.587 * pixels[i + 1] +
        0.114 * pixels[i + 2];

      const adjusted = Math.max(
        0,
        Math.min(255, (gray - 128) * contrast + 128)
      );

      pixels[i] = adjusted;
      pixels[i + 1] = adjusted;
      pixels[i + 2] = adjusted;
    }

    context.putImageData(imageData, 0, 0);
    return result;
  }

  function makeThresholdCanvas(sourceCanvas, threshold, invert = false) {
    const result = makeGrayscaleCanvas(sourceCanvas, 1.55);
    const context = result.getContext("2d", {
      willReadFrequently: true
    });

    const imageData = context.getImageData(
      0,
      0,
      result.width,
      result.height
    );

    const pixels = imageData.data;

    for (let i = 0; i < pixels.length; i += 4) {
      const gray = pixels[i];
      let value = gray >= threshold ? 255 : 0;

      if (invert) {
        value = 255 - value;
      }

      pixels[i] = value;
      pixels[i + 1] = value;
      pixels[i + 2] = value;
    }

    context.putImageData(imageData, 0, 0);
    return result;
  }

  function normalizeText(value) {
    return String(value || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
  }

  function getCandidates(text) {
    const rawText = String(text || "").toUpperCase();

    const tokens = rawText
      .split(/\s+/)
      .map(normalizeText)
      .filter(value => value.length >= 4 && value.length <= 9);

    const joined = normalizeText(rawText);

    if (joined.length >= 4 && joined.length <= 9) {
      tokens.push(joined);
    }

    return [...new Set(tokens)];
  }

  function candidateScore(value, confidence) {
    const candidate = normalizeText(value);

    if (candidate.length < 4 || candidate.length > 9) {
      return -1000;
    }

    const hasLetters = /[A-Z]/.test(candidate);
    const hasDigits = /\d/.test(candidate);

    if (!hasLetters || !hasDigits) {
      return -100;
    }

    let score = Number(confidence || 0) / 10;

    // Standarta Latvijas un daudzu ES numuru izkārtojums.
    if (/^[A-Z]{1,3}\d{1,5}$/.test(candidate)) {
      score += 28;
    }

    if (/^[A-Z]{2}\d{4}$/.test(candidate)) {
      score += 12;
    }

    score -= Math.abs(candidate.length - 6) * 1.5;

    return score;
  }

  async function recognizeImage(workerInstance, image, pageSegMode, onProgress) {
    await workerInstance.setParameters({
      tessedit_pageseg_mode: String(pageSegMode),
      tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    });

    const result = await workerInstance.recognize(image);
    const candidates = getCandidates(result.data.text);

    let best = {
      plate: "",
      score: -Infinity,
      rawText: result.data.text || "",
      confidence: Number(result.data.confidence || 0)
    };

    for (const candidate of candidates) {
      const score = candidateScore(candidate, result.data.confidence);

      if (score > best.score) {
        best = {
          plate: candidate,
          score,
          rawText: result.data.text || "",
          confidence: Number(result.data.confidence || 0)
        };
      }
    }

    return best;
  }

  async function recognize(onProgress) {
    const original = captureOriginalCrop();

    // Nelieto tikai vienu agresīvu melnbaltu filtru.
    // OCR izmēģina oriģinālu un vairākus atšķirīgus apstrādes variantus.
    const variants = [
      cloneCanvas(original),
      makeGrayscaleCanvas(original, 1.25),
      makeGrayscaleCanvas(original, 1.75),
      makeThresholdCanvas(original, 105, false),
      makeThresholdCanvas(original, 135, false),
      makeThresholdCanvas(original, 165, false),
      makeThresholdCanvas(original, 135, true)
    ];

    const workerInstance = await getWorker(onProgress);

    let overallBest = {
      plate: "",
      score: -Infinity,
      rawText: "",
      confidence: 0
    };

    for (let index = 0; index < variants.length; index++) {
      // PSM 7: viena teksta rinda. PSM 13: viena neapstrādāta teksta rinda.
      for (const pageSegMode of [7, 13]) {
        const result = await recognizeImage(
          workerInstance,
          variants[index],
          pageSegMode,
          onProgress
        );

        if (result.score > overallBest.score) {
          overallBest = result;
        }

        // Ja kandidāts izskatās ļoti pārliecinošs, nav jāturpina visi 14 mēģinājumi.
        if (overallBest.score >= 34) {
          return overallBest;
        }
      }
    }

    return overallBest;
  }

  return {
    start,
    stop,
    isRunning,
    recognize
  };
})();
