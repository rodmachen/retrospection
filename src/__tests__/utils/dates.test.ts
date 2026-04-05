import { describe, it, expect, vi, afterEach } from "vitest";
import { getTodayInTimezone, getDatesBetween } from "../../utils/dates";

describe("getTodayInTimezone", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns date in en-CA format (YYYY-MM-DD)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-15T10:00:00Z"));
    expect(getTodayInTimezone("UTC")).toBe("2024-06-15");
    vi.useRealTimers();
  });

  it("accounts for timezone offset (UTC-6 shifts date back)", () => {
    vi.useFakeTimers();
    // Midnight UTC on June 15 is still June 14 in UTC-6
    vi.setSystemTime(new Date("2024-06-15T04:00:00Z"));
    expect(getTodayInTimezone("America/Chicago")).toBe("2024-06-14");
    vi.useRealTimers();
  });

  it("accounts for timezone offset (UTC+9 shifts date forward)", () => {
    vi.useFakeTimers();
    // 11pm UTC on June 14 is June 15 in Asia/Tokyo (UTC+9)
    vi.setSystemTime(new Date("2024-06-14T23:00:00Z"));
    expect(getTodayInTimezone("Asia/Tokyo")).toBe("2024-06-15");
    vi.useRealTimers();
  });
});

describe("getDatesBetween", () => {
  it("returns empty array when start equals end", () => {
    expect(getDatesBetween("2024-01-01", "2024-01-01")).toEqual([]);
  });

  it("returns empty array when start is after end", () => {
    expect(getDatesBetween("2024-01-05", "2024-01-03")).toEqual([]);
  });

  it("returns single date when dates are one day apart", () => {
    expect(getDatesBetween("2024-01-01", "2024-01-02")).toEqual(["2024-01-01"]);
  });

  it("returns multiple dates for a range", () => {
    expect(getDatesBetween("2024-01-01", "2024-01-04")).toEqual([
      "2024-01-01",
      "2024-01-02",
      "2024-01-03",
    ]);
  });

  it("handles month boundaries", () => {
    expect(getDatesBetween("2024-01-30", "2024-02-02")).toEqual([
      "2024-01-30",
      "2024-01-31",
      "2024-02-01",
    ]);
  });

  it("handles leap year Feb 28 to Mar 1", () => {
    expect(getDatesBetween("2024-02-28", "2024-03-01")).toEqual([
      "2024-02-28",
      "2024-02-29",
    ]);
  });
});
