const CameraController = (() => {
  let stream = null;
  let worker = null;
  let workerPromise = null;
  let cvReadyPromise = null;

  const video = () => document.getElementById("cameraPreview");
  const captureCanvas = () => document.getElementById("captureCanvas");
  const previewCanvas = () => document.getElementById("platePreviewCanvas");

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
    } catch (_) {
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
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

  async function waitForOpenCv(timeoutMs = 20000) {
    if (cvReadyPromise) return cvReadyPromise;

    cvReadyPromise = new Promise((resolve, reject) => {
      const started = Date.now();

      async function check() {
        try {
          if (window.cv) {
            const resolvedCv = typeof window.cv.then === "function"
              ? await window.cv
              : window.cv;

            if (resolvedCv && resolvedCv.Mat && resolvedCv.findContours) {
              window.cv = resolvedCv;
              resolve(resolvedCv);
              return;
            }
          }
        } catch (_) {}

        if (Date.now() - started > timeoutMs) {
          reject(new Error("OpenCV neielādējās. Pārbaudi interneta savienojumu."));
          return;
        }
        setTimeout(check, 150);
      }

      window.addEventListener("opencv-ready", check, { once: true });
      check();
    });

    try {
      return await cvReadyPromise;
    } catch (error) {
      cvReadyPromise = null;
      throw error;
    }
  }

  async function getWorker(onProgress) {
    if (worker) return worker;
    if (workerPromise) return workerPromise;

    workerPromise = (async () => {
      if (!window.Tesseract) {
        throw new Error("Tesseract OCR bibliotēka nav ielādējusies.");
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

  function captureCurrentFrame() {
    if (!isRunning()) throw new Error("Vispirms ieslēdz kameru.");

    const source = video();
    const target = captureCanvas();
    const maxWidth = 1280;
    const scale = Math.min(1, maxWidth / source.videoWidth);

    target.width = Math.round(source.videoWidth * scale);
    target.height = Math.round(source.videoHeight * scale);

    const context = target.getContext("2d", { willReadFrequently: true });
    context.drawImage(source, 0, 0, target.width, target.height);
    return target;
  }

  function detectPlateRegion(cv, sourceCanvas) {
    const src = cv.imread(sourceCanvas);
    const gray = new cv.Mat();
    const blurred = new cv.Mat();
    const edges = new cv.Mat();
    const closed = new cv.Mat();
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 3));

    let bestRect = null;
    let bestScore = -1;

    try {
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
      cv.bilateralFilter(gray, blurred, 9, 75, 75, cv.BORDER_DEFAULT);
      cv.Canny(blurred, edges, 60, 180);
      cv.morphologyEx(edges, closed, cv.MORPH_CLOSE, kernel, new cv.Point(-1, -1), 2);
      cv.findContours(closed, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

      const imageArea = src.cols * src.rows;

      for (let i = 0; i < contours.size(); i++) {
        const contour = contours.get(i);
        const area = Math.abs(cv.contourArea(contour));

        if (area < imageArea * 0.0015 || area > imageArea * 0.22) {
          contour.delete();
          continue;
        }

        const rect = cv.boundingRect(contour);
        const aspect = rect.width / Math.max(1, rect.height);
        const fillRatio = area / Math.max(1, rect.width * rect.height);

        if (rect.width < 90 || rect.height < 22 || aspect < 2.0 || aspect > 6.8 || fillRatio < 0.18) {
          contour.delete();
          continue;
        }

        const centerX = rect.x + rect.width / 2;
        const centerY = rect.y + rect.height / 2;
        const distanceX = Math.abs(centerX - src.cols / 2) / src.cols;
        const distanceY = Math.abs(centerY - src.rows / 2) / src.rows;
        const centerScore = 1 - Math.min(0.75, distanceX + distanceY);
        const aspectScore = 1 / (1 + Math.abs(aspect - 4.5));
        const sizeScore = Math.min(1, area / (imageArea * 0.025));
        const score = aspectScore * 4 + fillRatio * 2 + sizeScore * 2 + centerScore * 3;

        if (score > bestScore) {
          bestScore = score;
          bestRect = rect;
        }
        contour.delete();
      }

      if (!bestRect) {
        throw new Error("OpenCV neatrada numurzīmes formas taisnstūri baltajā rāmī.");
      }

      const paddingX = Math.round(bestRect.width * 0.08);
      const paddingY = Math.round(bestRect.height * 0.22);
      const x = Math.max(0, bestRect.x - paddingX);
      const y = Math.max(0, bestRect.y - paddingY);
      const width = Math.min(src.cols - x, bestRect.width + paddingX * 2);
      const height = Math.min(src.rows - y, bestRect.height + paddingY * 2);

      const roi = src.roi(new cv.Rect(x, y, width, height));
      const enlarged = new cv.Mat();
      const targetWidth = Math.max(700, Math.min(1400, width * 4));
      const targetHeight = Math.round(targetWidth * height / width);

      cv.resize(roi, enlarged, new cv.Size(targetWidth, targetHeight), 0, 0, cv.INTER_CUBIC);
      roi.delete();
      return enlarged;
    } finally {
      src.delete();
      gray.delete();
      blurred.delete();
      edges.delete();
      closed.delete();
      contours.delete();
      hierarchy.delete();
      kernel.delete();
    }
  }

  function createOcrCanvases(cv, detectedPlate) {
    const colorCanvas = document.createElement("canvas");
    cv.imshow(colorCanvas, detectedPlate);

    const gray = new cv.Mat();
    const normalized = new cv.Mat();
    const thresholded = new cv.Mat();

    try {
      cv.cvtColor(detectedPlate, gray, cv.COLOR_RGBA2GRAY);
      cv.equalizeHist(gray, normalized);
      cv.adaptiveThreshold(
        normalized,
        thresholded,
        255,
        cv.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv.THRESH_BINARY,
        31,
        11
      );

      const thresholdCanvas = document.createElement("canvas");
      cv.imshow(thresholdCanvas, thresholded);

      const visiblePreview = previewCanvas();
      visiblePreview.width = thresholdCanvas.width;
      visiblePreview.height = thresholdCanvas.height;
      visiblePreview.getContext("2d").drawImage(thresholdCanvas, 0, 0);
      document.getElementById("platePreviewWrap").classList.remove("hidden");

      return [thresholdCanvas, colorCanvas];
    } finally {
      gray.delete();
      normalized.delete();
      thresholded.delete();
    }
  }

  function normalizeCandidate(value) {
    return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  }

  function candidateScore(candidate, confidence) {
    const value = normalizeCandidate(candidate);
    if (value.length < 4 || value.length > 9) return -100;

    let score = Number(confidence || 0) / 10;
    if (/[A-Z]/.test(value) && /\d/.test(value)) score += 8;
    if (/^[A-Z]{1,3}\d{1,4}$/.test(value)) score += 12;
    if (/^[A-Z]{2}\d{4}$/.test(value)) score += 5;
    if (/^[A-Z]{4,9}$/.test(value)) score -= 14;
    if (/^\d{4,9}$/.test(value)) score -= 4;
    score -= Math.abs(6 - value.length);
    return score;
  }

  function extractCandidates(text) {
    const values = String(text || "")
      .toUpperCase()
      .split(/\s+/)
      .map(normalizeCandidate)
      .filter(value => value.length >= 4 && value.length <= 9);

    const joined = normalizeCandidate(text);
    if (joined.length >= 4 && joined.length <= 9) values.push(joined);
    return [...new Set(values)];
  }

  async function recognize(onProgress) {
    const cv = await waitForOpenCv();
    const frame = captureCurrentFrame();
    let plateMat = null;

    try {
      plateMat = detectPlateRegion(cv, frame);
      const ocrImages = createOcrCanvases(cv, plateMat);
      const ocrWorker = await getWorker(onProgress);

      let best = { plate: "", score: -Infinity, rawText: "", confidence: 0 };

      for (const image of ocrImages) {
        const result = await ocrWorker.recognize(image);
        const candidates = extractCandidates(result.data.text);

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
      }

      if (!best.plate || !/[A-Z]/.test(best.plate) || !/\d/.test(best.plate)) {
        return { plate: "", rawText: best.rawText, confidence: best.confidence, detected: true };
      }

      return { plate: best.plate, rawText: best.rawText, confidence: best.confidence, detected: true };
    } finally {
      if (plateMat) plateMat.delete();
    }
  }

  return { start, stop, isRunning, recognize, waitForOpenCv };
})();
