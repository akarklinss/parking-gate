import { createWorker } from "tesseract.js";
import {
  consensusCandidates,
  extractOcrCandidates,
  rankAgainstAllowed
} from "../lib/plateMatcher";

let workerPromise = null;
let workerInstance = null;

function nextPaint() {
  return new Promise((resolve) =>
    requestAnimationFrame(() => setTimeout(resolve, 0))
  );
}

async function createOcrWorker(onProgress) {
  const worker = await createWorker("eng", 1, {
    logger(message) {
      if (
        message.status === "recognizing text" &&
        typeof onProgress === "function"
      ) {
        onProgress(Math.round((message.progress || 0) * 100));
      }
    }
  });

  await worker.setParameters({
    tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
    preserve_interword_spaces: "0",
    tessedit_pageseg_mode: "7"
  });

  workerInstance = worker;
  return worker;
}

async function getWorker(onProgress) {
  if (!workerPromise) {
    workerPromise = createOcrWorker(onProgress).catch((error) => {
      workerPromise = null;
      workerInstance = null;
      throw error;
    });
  }

  return workerPromise;
}

async function resetWorker() {
  try {
    await workerInstance?.terminate();
  } catch {
    // Ignorē terminēšanas kļūdu.
  }

  workerInstance = null;
  workerPromise = null;
}

export async function prepareOcr(onStatus) {
  onStatus?.("Ielādē OCR modeli…");
  await getWorker();
  onStatus?.("OCR gatavs.");
}

function getCrop(video, guideElement) {
  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;

  const cameraWrap = guideElement.parentElement;
  const wrapRect = cameraWrap.getBoundingClientRect();
  const guideRect = guideElement.getBoundingClientRect();

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

  const x = Math.max(0, left - padX);
  const y = Math.max(0, top - padY);

  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(
      Math.min(sourceWidth - x, width + padX * 2)
    ),
    height: Math.round(
      Math.min(sourceHeight - y, height + padY * 2)
    )
  };
}

function captureFrame(video, guideElement) {
  const crop = getCrop(video, guideElement);
  const canvas = document.createElement("canvas");

  const outputWidth = 760;
  const outputHeight = Math.max(
    170,
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

function makeContrastVariant(sourceCanvas) {
  const canvas = document.createElement("canvas");
  canvas.width = sourceCanvas.width;
  canvas.height = sourceCanvas.height;

  const context = canvas.getContext("2d", {
    willReadFrequently: true
  });

  context.drawImage(sourceCanvas, 0, 0);

  const imageData = context.getImageData(
    0,
    0,
    canvas.width,
    canvas.height
  );

  const pixels = imageData.data;

  for (let index = 0; index < pixels.length; index += 4) {
    const gray =
      0.299 * pixels[index] +
      0.587 * pixels[index + 1] +
      0.114 * pixels[index + 2];

    const contrasted = Math.max(
      0,
      Math.min(255, (gray - 128) * 1.45 + 128)
    );

    pixels[index] = contrasted;
    pixels[index + 1] = contrasted;
    pixels[index + 2] = contrasted;
  }

  context.putImageData(imageData, 0, 0);
  return canvas;
}

async function recognizeWithTimeout(worker, image, timeoutMs = 22000) {
  let timer;

  try {
    return await Promise.race([
      worker.recognize(image),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(
            new Error(
              "OCR neatbildēja 22 sekundēs. Pamēģini vēlreiz vai ievadi manuāli."
            )
          );
        }, timeoutMs);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function scanPlate({
  video,
  guideElement,
  allowedVehicles,
  frameCount = 2,
  onStatus,
  onProgress
}) {
  if (!video?.videoWidth || !video?.videoHeight) {
    throw new Error("Kamera vēl nav gatava.");
  }

  onStatus?.("Uzņem attēlu…");
  await nextPaint();

  const firstFrame = captureFrame(video, guideElement);

  await new Promise((resolve) => setTimeout(resolve, 180));

  const secondFrame =
    frameCount > 1
      ? captureFrame(video, guideElement)
      : firstFrame;

  onStatus?.("Sagatavo OCR…");
  await nextPaint();

  const worker = await getWorker(onProgress);

  const images = [
    firstFrame,
    makeContrastVariant(secondFrame)
  ];

  const readings = [];

  try {
    for (let index = 0; index < images.length; index += 1) {
      onStatus?.(`OCR analīze ${index + 1}/${images.length}`);
      await nextPaint();

      const result = await recognizeWithTimeout(worker, images[index]);

      readings.push({
        rawText: result.data.text || "",
        confidence: Number(result.data.confidence || 0),
        candidates: extractOcrCandidates(result.data.text)
      });
    }
  } catch (error) {
    await resetWorker();
    throw error;
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
