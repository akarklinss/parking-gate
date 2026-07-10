const CameraController = (() => {
  let stream = null,
    worker = null,
    workerPromise = null;
  const v = () => document.getElementById("cameraPreview"),
    cap = () => document.getElementById("captureCanvas"),
    preview = () => document.getElementById("platePreviewCanvas");
  async function start() {
    stop();
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
    } catch (e) {
      stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      });
    }
    v().srcObject = stream;
    await v().play();
  }
  function stop() {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    if (v()) v().srcObject = null;
  }
  function running() {
    return !!(stream && v().readyState >= 2);
  }
  async function cvReady() {
    const start = Date.now();
    while (Date.now() - start < 20000) {
      let x = window.cv;
      if (x && typeof x.then === "function") x = await x;
      if (x && x.Mat && x.findContours) {
        window.cv = x;
        return x;
      }
      await new Promise((r) => setTimeout(r, 150));
    }
    throw new Error("OpenCV neielādējās.");
  }
  async function getWorker(progress) {
    if (worker) return worker;
    if (workerPromise) return workerPromise;
    workerPromise = (async () => {
      const w = await Tesseract.createWorker("eng", 1, {
        logger: (m) => {
          if (m.status === "recognizing text" && progress)
            progress(Math.round((m.progress || 0) * 100));
        },
      });
      await w.setParameters({
        tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
        tessedit_pageseg_mode: "7",
      });
      worker = w;
      return w;
    })();
    try {
      return await workerPromise;
    } finally {
      workerPromise = null;
    }
  }
  function frame() {
    if (!running()) throw new Error("Vispirms ieslēdz kameru.");
    const s = v(),
      c = cap(),
      scale = Math.min(1, 1280 / s.videoWidth);
    c.width = Math.round(s.videoWidth * scale);
    c.height = Math.round(s.videoHeight * scale);
    c.getContext("2d").drawImage(s, 0, 0, c.width, c.height);
    return c;
  }
  function detect(cv, canvas) {
    const src = cv.imread(canvas),
      gray = new cv.Mat(),
      blur = new cv.Mat(),
      edges = new cv.Mat(),
      closed = new cv.Mat(),
      contours = new cv.MatVector(),
      hier = new cv.Mat(),
      kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 3));
    let best = null,
      bestScore = -1;
    try {
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
      cv.bilateralFilter(gray, blur, 9, 75, 75, cv.BORDER_DEFAULT);
      cv.Canny(blur, edges, 60, 180);
      cv.morphologyEx(
        edges,
        closed,
        cv.MORPH_CLOSE,
        kernel,
        new cv.Point(-1, -1),
        2,
      );
      cv.findContours(
        closed,
        contours,
        hier,
        cv.RETR_LIST,
        cv.CHAIN_APPROX_SIMPLE,
      );
      const imageArea = src.cols * src.rows;
      for (let i = 0; i < contours.size(); i++) {
        const ct = contours.get(i),
          area = Math.abs(cv.contourArea(ct)),
          r = cv.boundingRect(ct),
          aspect = r.width / Math.max(1, r.height),
          fill = area / Math.max(1, r.width * r.height);
        if (
          area > imageArea * 0.0015 &&
          area < imageArea * 0.22 &&
          r.width > 90 &&
          r.height > 22 &&
          aspect > 2 &&
          aspect < 6.8 &&
          fill > 0.16
        ) {
          const cx = r.x + r.width / 2,
            cy = r.y + r.height / 2,
            center =
              1 -
              Math.min(
                0.8,
                Math.abs(cx - src.cols / 2) / src.cols +
                  Math.abs(cy - src.rows / 2) / src.rows,
              ),
            score = 4 / (1 + Math.abs(aspect - 4.5)) + fill * 2 + center * 3;
          if (score > bestScore) {
            bestScore = score;
            best = r;
          }
        }
        ct.delete();
      }
      if (!best) throw new Error("OpenCV neatrada numurzīmes taisnstūri.");
      const px = Math.round(best.width * 0.08),
        py = Math.round(best.height * 0.22),
        x = Math.max(0, best.x - px),
        y = Math.max(0, best.y - py),
        w = Math.min(src.cols - x, best.width + px * 2),
        h = Math.min(src.rows - y, best.height + py * 2),
        roi = src.roi(new cv.Rect(x, y, w, h)),
        out = new cv.Mat(),
        tw = Math.max(700, Math.min(1400, w * 4));
      cv.resize(
        roi,
        out,
        new cv.Size(tw, Math.round((tw * h) / w)),
        0,
        0,
        cv.INTER_CUBIC,
      );
      roi.delete();
      return out;
    } finally {
      [src, gray, blur, edges, closed, contours, hier, kernel].forEach((m) =>
        m.delete(),
      );
    }
  }
  function images(cv, mat) {
    const color = document.createElement("canvas");
    cv.imshow(color, mat);
    const gray = new cv.Mat(),
      eq = new cv.Mat(),
      th = new cv.Mat();
    try {
      cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);
      cv.equalizeHist(gray, eq);
      cv.adaptiveThreshold(
        eq,
        th,
        255,
        cv.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv.THRESH_BINARY,
        31,
        11,
      );
      const binary = document.createElement("canvas");
      cv.imshow(binary, th);
      preview().width = binary.width;
      preview().height = binary.height;
      preview().getContext("2d").drawImage(binary, 0, 0);
      document.getElementById("platePreviewWrap").classList.remove("hidden");
      return [binary, color];
    } finally {
      gray.delete();
      eq.delete();
      th.delete();
    }
  }
  function candidates(text) {
    const arr = String(text || "")
        .toUpperCase()
        .split(/\s+/)
        .map((x) => x.replace(/[^A-Z0-9]/g, ""))
        .filter((x) => x.length >= 4 && x.length <= 9),
      j = String(text || "")
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");
    if (j.length >= 4 && j.length <= 9) arr.push(j);
    return [...new Set(arr)];
  }
  function score(x, conf) {
    let s = (conf || 0) / 10;
    if (/[A-Z]/.test(x) && /\d/.test(x)) s += 8;
    if (/^[A-Z]{1,3}\d{1,4}$/.test(x)) s += 12;
    if (/^[A-Z]{2}\d{4}$/.test(x)) s += 5;
    if (/^[A-Z]{4,9}$/.test(x)) s -= 14;
    s -= Math.abs(6 - x.length);
    return s;
  }
  async function recognize(progress) {
    const cv = await cvReady(),
      plate = detect(cv, frame());
    try {
      const w = await getWorker(progress),
        imgs = images(cv, plate);
      let best = { plate: "", score: -999, confidence: 0 };
      for (const img of imgs) {
        const r = await w.recognize(img);
        for (const x of candidates(r.data.text)) {
          const sc = score(x, r.data.confidence);
          if (sc > best.score)
            best = { plate: x, score: sc, confidence: r.data.confidence };
        }
      }
      if (!best.plate || !/[A-Z]/.test(best.plate) || !/\d/.test(best.plate))
        return { plate: "", detected: true };
      return best;
    } finally {
      plate.delete();
    }
  }
  return { start, stop, isRunning: running, recognize };
})();
