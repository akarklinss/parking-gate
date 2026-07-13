import { createWorker } from "tesseract.js";
import {
  consensusCandidates,
  extractOcrCandidates,
  rankAgainstAllowed
} from "../lib/plateMatcher";

let workerPromise = null;

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

  const coverScale = Math.max(
    videoRect.width / sourceWidth,
    videoRect.height / sourceHeight
  );

  const renderedWidth = sourceWidth * coverScale;
  const renderedHeight = sourceHeight * coverScale;
  const hiddenLeft = Math.max(0, (renderedWidth - videoRect.width) / 2);
  const hiddenTop = Math.max(0, (renderedHeight - videoRect.height) / 2);

  const left = (guideRect.left - videoRect.left + hiddenLeft) / coverScale;
  const top = (guideRect.top - videoRect.top + hiddenTop) / coverScale;
  const width = guideRect.width / coverScale;
  const height = guideRect.height / coverScale;

  const padX = width * 0.08;
  const padY = height * 0.18;

  return {
    x: Math.max(0, Math.round(left - padX)),
    y: Math.max(0, Math.round(top - padY)),
    width: Math.min(sourceWidth, Math.round(width + padX * 2)),
    height: Math.min(sourceHeight, Math.round(height + padY * 2))
  };
}

function captureFrame(video, guideElement) {
  const crop = getCrop(video, guideElement);
  const canvas = document.createElement("canvas");
  const outputWidth = 1280;
  const outputHeight = Math.max(
    240,
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

function makeVariants(cv, canvas) {
  const src = cv.imread(canvas);
  const gray = new cv.Mat();
  const equalized = new cv.Mat();
  const adaptive = new cv.Mat();

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.equalizeHist(gray, equalized);
    cv.adaptiveThreshold(
      equalized,
      adaptive,
      255,
      cv.ADAPTIVE_THRESH_GAUSSIAN_C,
      cv.THRESH_BINARY,
      31,
      9
    );

    const originalCanvas = document.createElement("canvas");
    originalCanvas.width = canvas.width;
    originalCanvas.height = canvas.height;
    originalCanvas.getContext("2d").drawImage(canvas, 0, 0);

    const equalizedCanvas = document.createElement("canvas");
    cv.imshow(equalizedCanvas, equalized);

    const adaptiveCanvas = document.createElement("canvas");
    cv.imshow(adaptiveCanvas, adaptive);

    return [originalCanvas, equalizedCanvas, adaptiveCanvas];
  } finally {
    src.delete();
    gray.delete();
    equalized.delete();
    adaptive.delete();
  }
}

async function collectFrames(video, guideElement, frameCount, onStatus) {
  const frames = [];

  for (let index = 0; index < frameCount; index += 1) {
    onStatus?.(`Uzņem kadru ${index + 1}/${frameCount}`);
    frames.push(captureFrame(video, guideElement));
    await new Promise((resolve) => setTimeout(resolve, 180));
  }

  return frames;
}

export async function scanPlate({
  video,
  guideElement,
  allowedVehicles,
  frameCount = 5,
  onStatus,
  onProgress
}) {
  if (!video?.videoWidth || !video?.videoHeight) {
    throw new Error("Kamera vēl nav gatava.");
  }

  const cv = await waitForOpenCv();
  const frames = await collectFrames(
    video,
    guideElement,
    frameCount,
    onStatus
  );

  const bestFrames = frames
    .map((canvas) => ({
      canvas,
      sharpness: sharpnessScore(cv, canvas)
    }))
    .sort((a, b) => b.sharpness - a.sharpness)
    .slice(0, 2);

  const worker = await getWorker(onProgress);
  const readings = [];
  const totalPasses = bestFrames.length * 3;
  let pass = 0;

  for (const frame of bestFrames) {
    const variants = makeVariants(cv, frame.canvas);

    for (const variant of variants) {
      pass += 1;
      onStatus?.(`OCR analīze ${pass}/${totalPasses}`);

      const result = await worker.recognize(variant);
      readings.push({
        rawText: result.data.text || "",
        confidence: Number(result.data.confidence || 0),
        candidates: extractOcrCandidates(result.data.text)
      });
    }
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
