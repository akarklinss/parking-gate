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

  const padX = width * 0.09;
  const padY = height * 0.2;
  const x = Math.max(0, left - padX);
  const y = Math.max(0, top - padY);

  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(Math.min(sourceWidth - x, width + padX * 2)),
    height: Math.round(Math.min(sourceHeight - y, height + padY * 2))
  };
}

function captureFrame(video, guideElement) {
  const crop = getCrop(video, guideElement);
  const canvas = document.createElement("canvas");
  const outputWidth = 860;
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

function estimateSharpness(sourceCanvas) {
  const sampleWidth = 160;
  const sampleHeight = Math.max(
    40,
    Math.round(sampleWidth * sourceCanvas.height / sourceCanvas.width)
  );
  const sample = document.createElement("canvas");
  sample.width = sampleWidth;
  sample.height = sampleHeight;
  const context = sample.getContext("2d", { willReadFrequently: true });
  context.drawImage(sourceCanvas, 0, 0, sampleWidth, sampleHeight);
  const pixels = context.getImageData(0, 0, sampleWidth, sampleHeight).data;
  let score = 0;
  let count = 0;

  const grayAt = (x, y) => {
    const index = (y * sampleWidth + x) * 4;
    return (
      0.299 * pixels[index] +
      0.587 * pixels[index + 1] +
      0.114 * pixels[index + 2]
    );
  };

  for (let y = 1; y < sampleHeight - 1; y += 2) {
    for (let x = 1; x < sampleWidth - 1; x += 2) {
      const horizontal = Math.abs(grayAt(x + 1, y) - grayAt(x - 1, y));
      const vertical = Math.abs(grayAt(x, y + 1) - grayAt(x, y - 1));
      score += horizontal + vertical;
      count += 1;
    }
  }

  return count ? score / count : 0;
}

function makeContrastVariant(sourceCanvas) {
  const canvas = document.createElement("canvas");
  canvas.width = sourceCanvas.width;
  canvas.height = sourceCanvas.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(sourceCanvas, 0, 0);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;

  for (let index = 0; index < pixels.length; index += 4) {
    const gray =
      0.299 * pixels[index] +
      0.587 * pixels[index + 1] +
      0.114 * pixels[index + 2];
    const contrasted = Math.max(
      0,
      Math.min(255, (gray - 128) * 1.38 + 128)
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
  frameCount = 3,
  onStatus,
  onProgress
}) {
  if (!video?.videoWidth || !video?.videoHeight) {
    throw new Error("Kamera vēl nav gatava.");
  }

  const frames = [];

  for (let index = 0; index < frameCount; index += 1) {
    onStatus?.(`Uzņem kadru ${index + 1}/${frameCount}`);
    await nextPaint();
    frames.push(captureFrame(video, guideElement));
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  onStatus?.("Izvēlas asākos kadrus…");
  await nextPaint();

  const ranked = frames
    .map((canvas) => ({ canvas, sharpness: estimateSharpness(canvas) }))
    .sort((a, b) => b.sharpness - a.sharpness);

  const images = [
    ranked[0].canvas,
    makeContrastVariant(ranked[Math.min(1, ranked.length - 1)].canvas)
  ];

  const worker = await getWorker(onProgress);
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
  const suggestions = rankAgainstAllowed(consensus, allowedVehicles, 3);

  return {
    readings,
    consensus,
    suggestions,
    best: suggestions[0] || null
  };
}
