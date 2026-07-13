const CONFUSION_PAIRS = new Set([
  "O0", "0O", "I1", "1I", "L1", "1L", "S5", "5S",
  "B8", "8B", "Z2", "2Z", "G6", "6G", "Q0", "0Q"
]);

export function normalizePlate(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function substitutionCost(a, b) {
  if (a === b) return 0;
  return CONFUSION_PAIRS.has(a + b) ? 0.25 : 1;
}

export function weightedDistance(leftRaw, rightRaw) {
  const left = normalizePlate(leftRaw);
  const right = normalizePlate(rightRaw);
  const matrix = Array.from(
    { length: left.length + 1 },
    () => Array(right.length + 1).fill(0)
  );

  for (let i = 0; i <= left.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= right.length; j += 1) matrix[0][j] = j;

  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + substitutionCost(left[i - 1], right[j - 1])
      );
    }
  }

  return matrix[left.length][right.length];
}

export function similarity(left, right) {
  const a = normalizePlate(left);
  const b = normalizePlate(right);
  const maxLength = Math.max(a.length, b.length, 1);
  return Math.max(0, 1 - weightedDistance(a, b) / maxLength);
}

export function extractOcrCandidates(rawText) {
  const text = String(rawText || "").toUpperCase();
  const candidates = text
    .split(/[\s\-–—_:;,.|/\\]+/)
    .map(normalizePlate)
    .filter((value) => value.length >= 4 && value.length <= 10);

  const joined = normalizePlate(text);
  if (joined.length >= 4 && joined.length <= 10) candidates.push(joined);

  return [...new Set(candidates)].filter(
    (value) => /[A-Z]/.test(value) && /\d/.test(value)
  );
}

export function consensusCandidates(readings) {
  const votes = new Map();

  for (const reading of readings || []) {
    for (const candidate of reading.candidates || []) {
      const normalized = normalizePlate(candidate);
      if (!normalized) continue;
      const weight = Math.max(0.15, Number(reading.confidence || 0) / 100);
      votes.set(normalized, (votes.get(normalized) || 0) + weight);
    }
  }

  return [...votes.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([plate]) => plate);
}

export function rankAgainstAllowed(ocrCandidates, allowedVehicles, limit = 3) {
  const candidates = [...new Set(
    (ocrCandidates || []).map(normalizePlate).filter(Boolean)
  )];

  if (!candidates.length || !allowedVehicles?.length) return [];

  return allowedVehicles
    .map((vehicle) => {
      const plate = normalizePlate(vehicle.plate);
      let bestSimilarity = 0;
      let matchedCandidate = "";

      for (const candidate of candidates) {
        const score = similarity(candidate, plate);
        if (score > bestSimilarity) {
          bestSimilarity = score;
          matchedCandidate = candidate;
        }
      }

      return { ...vehicle, plate, similarity: bestSimilarity, matchedCandidate };
    })
    .filter((result) => result.similarity >= 0.48)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}
