export function getTodayInTimezone(timezone: string): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: timezone });
}

/**
 * Returns all dates from start (inclusive) to end (exclusive).
 * E.g., getDatesBetween("2024-01-01", "2024-01-04") → ["2024-01-01", "2024-01-02", "2024-01-03"]
 * Returns [] if start >= end.
 */
export function getDatesBetween(start: string, end: string): string[] {
  const result: string[] = [];
  const current = new Date(start + "T00:00:00Z");
  const endDate = new Date(end + "T00:00:00Z");

  while (current < endDate) {
    result.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return result;
}
