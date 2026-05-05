import { describe, it, expect } from "vitest";
import {
  getMonthGrid,
  formatYmd,
  parseMonthParam,
  addMonths,
} from "../month-grid";

describe("getMonthGrid", () => {
  it("Feb 2026 (28 days, starts Saturday): 5 weeks with leading and trailing days", () => {
    const { year, month, weeks } = getMonthGrid(2026, 2);
    expect(year).toBe(2026);
    expect(month).toBe(2);
    // Feb 1 2026 is a Sunday (day index 6 in Monday-first = 6 leading days from prior month)
    // Feb 28 2026 is a Saturday (day index 5 in Monday-first = 1 trailing day)
    expect(weeks.length).toBe(5);
    // First cell of first week is Monday 2026-01-26
    expect(formatYmd(weeks[0][0])).toBe("2026-01-26");
    // Last cell of last week is Sunday 2026-03-01
    expect(formatYmd(weeks[4][6])).toBe("2026-03-01");
    // Every week has exactly 7 days
    for (const week of weeks) {
      expect(week.length).toBe(7);
    }
  });

  it("Month starting on Monday: no leading days from prior month", () => {
    // June 2026: June 1 is a Monday
    const { weeks } = getMonthGrid(2026, 6);
    expect(formatYmd(weeks[0][0])).toBe("2026-06-01");
  });

  it("Month ending on Sunday: no trailing days from next month", () => {
    // May 2026: May 31 is a Sunday
    const { weeks } = getMonthGrid(2026, 5);
    const lastWeek = weeks[weeks.length - 1];
    expect(formatYmd(lastWeek[6])).toBe("2026-05-31");
  });

  it("Feb 2024 leap year: 29 days rendered correctly", () => {
    const { weeks } = getMonthGrid(2024, 2);
    // Feb 29 2024 exists — find it in the grid
    const allDates = weeks.flat().map(formatYmd);
    expect(allDates).toContain("2024-02-29");
    // Feb 1 2024 is a Thursday (day index 3 Monday-first)
    expect(formatYmd(weeks[0][3])).toBe("2024-02-01");
  });
});

describe("formatYmd", () => {
  it("always returns a 10-char zero-padded UTC date string", () => {
    const d = new Date(Date.UTC(2026, 0, 5)); // Jan 5 UTC
    const s = formatYmd(d);
    expect(s).toHaveLength(10);
    expect(s).toBe("2026-01-05");
  });

  it("zero-pads month and day", () => {
    expect(formatYmd(new Date(Date.UTC(2026, 8, 9)))).toBe("2026-09-09");
  });
});

describe("addMonths", () => {
  it("December + 1 rolls to January of next year", () => {
    expect(addMonths(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
  });

  it("January - 1 rolls to December of prior year", () => {
    expect(addMonths(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
  });

  it("mid-year delta stays in same year", () => {
    expect(addMonths(2026, 4, 2)).toEqual({ year: 2026, month: 6 });
  });
});

describe("parseMonthParam", () => {
  it("parses a valid YYYY-MM string", () => {
    expect(parseMonthParam("2026-04")).toEqual({ year: 2026, month: 4 });
  });

  it("falls back to current UTC month for invalid input", () => {
    const now = new Date();
    const result = parseMonthParam("not-a-month");
    expect(result.year).toBe(now.getUTCFullYear());
    expect(result.month).toBe(now.getUTCMonth() + 1);
  });

  it("falls back for empty string", () => {
    const now = new Date();
    const result = parseMonthParam("");
    expect(result.year).toBe(now.getUTCFullYear());
    expect(result.month).toBe(now.getUTCMonth() + 1);
  });
});
