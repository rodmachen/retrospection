export interface MonthGrid {
  year: number;
  month: number;
  weeks: Date[][];
}

export interface MonthRef {
  year: number;
  month: number;
}

// Monday-first: getUTCDay() returns 0 for Sunday, 1 for Monday, ...
// Map to Monday=0, Tuesday=1, ..., Sunday=6
function mondayIndex(d: Date): number {
  return (d.getUTCDay() + 6) % 7;
}

export function getMonthGrid(year: number, month: number): MonthGrid {
  // month is 1-based (1 = January)
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const lastOfMonth = new Date(Date.UTC(year, month, 0));

  // How many leading days from the prior month (Monday-first)
  const leadingDays = mondayIndex(firstOfMonth);
  // How many trailing days from next month (fill to Sunday)
  const trailingDays = 6 - mondayIndex(lastOfMonth);

  const totalDays = leadingDays + lastOfMonth.getUTCDate() + trailingDays;
  const totalWeeks = totalDays / 7;

  const weeks: Date[][] = [];
  // Start from the first Monday at or before the first of the month
  const cursor = new Date(Date.UTC(year, month - 1, 1 - leadingDays));

  for (let w = 0; w < totalWeeks; w++) {
    const week: Date[] = [];
    for (let d = 0; d < 7; d++) {
      week.push(new Date(cursor.getTime()));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    weeks.push(week);
  }

  return { year, month, weeks };
}

export function formatYmd(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseMonthParam(s: string): MonthRef {
  const match = /^(\d{4})-(\d{2})$/.exec(s);
  if (match) {
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    if (month >= 1 && month <= 12) {
      return { year, month };
    }
  }
  const now = new Date();
  return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
}

export function addMonths(year: number, month: number, delta: number): MonthRef {
  // month is 1-based; convert to 0-based for arithmetic
  const totalMonths = (year * 12 + (month - 1)) + delta;
  const newYear = Math.floor(totalMonths / 12);
  const newMonth = (totalMonths % 12) + 1;
  return { year: newYear, month: newMonth };
}
