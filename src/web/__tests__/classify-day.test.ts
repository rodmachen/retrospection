import { describe, it, expect } from "vitest";
import { classifyDay } from "../classify-day";

describe("classifyDay", () => {
  const date = new Date(Date.UTC(2026, 3, 15)); // 2026-04-15

  it("returns 'completed' when the date is in completionDates", () => {
    expect(classifyDay(date, ["2026-04-15"], [])).toBe("completed");
  });

  it("returns 'skipped' when the date is in skippedDates only", () => {
    expect(classifyDay(date, [], ["2026-04-15"])).toBe("skipped");
  });

  it("returns 'pending' when the date is in neither list", () => {
    expect(classifyDay(date, ["2026-04-14"], ["2026-04-16"])).toBe("pending");
  });

  it("prioritizes 'completed' over 'skipped' when both are present", () => {
    expect(classifyDay(date, ["2026-04-15"], ["2026-04-15"])).toBe("completed");
  });

  it("returns 'pending' for empty lists", () => {
    expect(classifyDay(date, [], [])).toBe("pending");
  });

  it("compares dates as YYYY-MM-DD UTC strings (no time-of-day match)", () => {
    // Date with non-midnight UTC time still classifies on its UTC date.
    const d = new Date(Date.UTC(2026, 3, 15, 23, 59, 59));
    expect(classifyDay(d, ["2026-04-15"], [])).toBe("completed");
  });
});
