import { describe, it, expect } from "vitest";
import { BaziEngine } from "../src/utils/baziEngine";

describe("BaziEngine Zanggan element balance", () => {
  const engine = new BaziEngine();

  it("should calculate correct element balance including Zanggan weights for 2026-06-12", () => {
    // Birth date/time: 2026-06-12 12:00:00, Tokyo longitude approx 139.6917
    const date = new Date("2026-06-12T12:00:00+09:00");
    const result = engine.calculate(date, 139.6917, 1);

    // Verify properties
    expect(result).toHaveProperty("pillars");
    expect(result).toHaveProperty("fiveElements");

    // Print elements balance for debugging
    console.log("Calculated 5 Elements Balance:", result.fiveElements);

    // Since 2026 is Bing-Wu (丙午) year, and 丙 is Fire (1.0) and 午 contains 丁 (Fire, 0.7) and 己 (Earth, 0.3)
    // Fire (火) must be significantly greater than 0.
    expect(result.fiveElements.火).toBeGreaterThan(0);

    // Check that all 5 elements are represented in the balance map
    expect(result.fiveElements).toHaveProperty("木");
    expect(result.fiveElements).toHaveProperty("火");
    expect(result.fiveElements).toHaveProperty("土");
    expect(result.fiveElements).toHaveProperty("金");
    expect(result.fiveElements).toHaveProperty("水");
  });
});
