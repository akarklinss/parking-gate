import { describe, expect, it } from "vitest";
import {
  normalizePlate,
  similarity,
  rankAgainstAllowed,
  consensusCandidates
} from "./plateMatcher";

describe("plate matcher", () => {
  it("normalizes plate input", () => {
    expect(normalizePlate("ab-1234")).toBe("AB1234");
  });

  it("treats O and 0 as likely OCR confusion", () => {
    expect(similarity("AB12O4", "AB1204")).toBeGreaterThan(0.9);
  });

  it("ranks known vehicle above unrelated vehicles", () => {
    const results = rankAgainstAllowed(
      ["ABI234"],
      [
        { plate: "AB1234", name: "Test" },
        { plate: "ZZ9999", name: "Other" }
      ]
    );
    expect(results[0].plate).toBe("AB1234");
  });

  it("builds consensus from repeated readings", () => {
    const result = consensusCandidates([
      { candidates: ["AB1234"], confidence: 80 },
      { candidates: ["AB1234"], confidence: 70 },
      { candidates: ["AB1284"], confidence: 30 }
    ]);
    expect(result[0]).toBe("AB1234");
  });
});
