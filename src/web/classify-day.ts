import { formatYmd } from "./month-grid";

export type DayStatus = "completed" | "skipped" | "pending";

export function classifyDay(
  date: Date,
  completionDates: string[],
  skippedDates: string[]
): DayStatus {
  const ymd = formatYmd(date);
  if (completionDates.includes(ymd)) return "completed";
  if (skippedDates.includes(ymd)) return "skipped";
  return "pending";
}
