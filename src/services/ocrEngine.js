import { createWorker } from "tesseract.js";
import {
  consensusCandidates,
  extractOcrCandidates,
  rankAgainstAllowed
} from "../lib/plateMatcher";

let workerPromise = null;

function nextPaint() {
  return new Promise((resolve) =>
    requestAnimationFrame(() => setTimeout(resolve, 0))
  );
}

async function getWorker(onProgress) {
  if (workerPromise) return workerPromise;

  workerPromise = createWorker("eng", 1, {
    logger(message) {
      if (
        message.status === "recognizing text" &&
        typeof onProgress === "function"
      ) {
        onProgress(Math.round((message.progress || 0) * 100));
      }
    }
  }).then(async (worker) => {
    await worker.setParameters({
      tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
      preserve_interword_spaces: "0",
      tessedit_pageseg_mode: "7"
    });

    return worker;
  });

  return workerPromise;
}

export async function prepareOcr(onStatus) {
  onStatus?.("Ielādē OCR modeli…");
  await getWorker();
  onStatus?.("OCR gatavs.");
}

async function waitForOpenCv(timeoutMs = 20000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (window.cv) {
      const cv = typeof window.cv.then === "function"
        ? await window.cv
        : window.cv;

      if (cv?.Mat && cv?.Laplacian) {
        window.cv = cv;
        return cv;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  throw new Error("OpenCV neielādējās. Pārbaudi interneta savienojumu.");
}

function getCrop(video, guideElement) {
  const videoRect = video.getBoundingClientRect();
  const guideRect = guideElement.getBoundingClientRect();

  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;

  // Video ir paslēpts, tāpēc izmanto kameras zonas izmērus.
  const cameraWrap = guideElement.parentElement;
  const wrapRect = cameraWrap.getBoundingClientRect();

  const coverScale = Math.max(
    wrapRect.width / sourceWidth,
    wrapRect.height / sourceHeight
  );

  const renderedWidth = sourceWidth * coverScale;
  const renderedHeight = sourceHeight * coverScale;
  const hiddenLeft = Math.max(0, (renderedWidth - wrapRect.width) / 2);
  const hiddenTop = Math.max(0, (renderedHeight - wrapRect.height) / 2);

  const left =
    (guideRect.left - wrapRect.left + hiddenLeft) / coverScale;

  const top =
    (guideRect.top - wrapRect.top + hiddenTop) / coverScale;

  const width = guideRect.width / coverScale;
  const height = guideRect.height / coverScale;

  const padX = width * 0.08;
  const padY = height * 0.18;

  return {
    x: Math.max(0, Math.round(left - padX)),
    y: Math.max(0, Math.round(top - padY)),
    width: Math.min(
      sourceWidth,
      Math.round(width + padX * 2)
    ),
    height: Math.min(
      sourceHeight,
      Math.round(height + padY * 2)
    )
  };
}

function captureFrame(video, guideElement) {
  const crop = getCrop(video, guideElement);
  const canvas = document.createElement("canvas");

  // 900 px ir pietiekami OCR, bet daudz vieglāk iPhone nekā 1280 px.
  const outputWidth = 900;
  const outputHeight = Math.max(
    180,
    Math.round(outputWidth * crop.height / crop.width)
  );

  canvas.width = outputWidth;
  canvas.height = outputHeight;

  const context = canvas.getContext("2d", {
    willReadFrequently: true
  });

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  context.drawImage(
    video,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    outputWidth,
    outputHeight
  );

  return canvas;
}

function sharpnessScore(cv, canvas) {
  const src = cv.imread(canvas);
  const gray = new cv.Mat();
  const laplacian = new cv.Mat();
  const mean = new cv.Mat();
  const stddev = new cv.Mat();

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.Laplacian(gray, laplacian, cv.CV_64F);
    cv.meanStdDev(laplacian, mean, stddev);

    return Math.pow(stddev.doubleAt(0, 0), 2);
  } finally {
    src.delete();
    gray.delete();
    laplacian.delete();
    mean.delete();
    stddev.delete();
  }
}

function makeEqualizedVariant(cv, canvas) {
  const src = cv.imread(canvas);
  const gray = new cv.Mat();
  const equalized = new cv.Mat();

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.equalizeHist(gray, equalized);

    const result = document.createElement("canvas");
    cv.imshow(result, equalized);
    return result;
  } finally {
    src.delete();
    gray.delete();
    equalized.delete();
  }
}

async function collectFrames(
  video,
  guideElement,
  frameCount,
  onStatus
) {
  const frames = [];

  for (let index = 0; index < frameCount; index += 1) {
    onStatus?.(`Uzņem kadru ${index + 1}/${frameCount}`);
    await nextPaint();
    frames.push(captureFrame(video, guideElement));
    await new Promise((resolve) => setTimeout(resolve, 140));
  }

  return frames;
}

export async function scanPlate({
  video,
  guideElement,
  allowedVehicles,
  frameCount = 3,
  onStatus,
  onProgress
}) {
  if (!video?.videoWidth || !video?.videoHeight) {
    throw new Error("Kamera vēl nav gatava.");
  }

  onStatus?.("Sagatavo attēlu…");
  await nextPaint();

  const cv = await waitForOpenCv();

  const frames = await collectFrames(
    video,
    guideElement,
    frameCount,
    onStatus
  );

  onStatus?.("Izvēlas asāko kadru…");
  await nextPaint();

  const bestFrame = frames
    .map((canvas) => ({
      canvas,
      sharpness: sharpnessScore(cv, canvas)
    }))
    .sort((a, b) => b.sharpness - a.sharpness)[0];

  const variants = [
    bestFrame.canvas,
    makeEqualizedVariant(cv, bestFrame.canvas)
  ];

  const worker = await getWorker(onProgress);
  const readings = [];

  for (let index = 0; index < variants.length; index += 1) {
    onStatus?.(`OCR analīze ${index + 1}/${variants.length}`);
    await nextPaint();

    const result = await worker.recognize(variants[index]);

    readings.push({
      rawText: result.data.text || "",
      confidence: Number(result.data.confidence || 0),
      candidates: extractOcrCandidates(result.data.text)
    });
  }

  const consensus = consensusCandidates(readings);

  const suggestions = rankAgainstAllowed(
    consensus,
    allowedVehicles,
    3
  );

  return {
    readings,
    consensus,
    suggestions,
    best: suggestions[0] || null
  };
}
