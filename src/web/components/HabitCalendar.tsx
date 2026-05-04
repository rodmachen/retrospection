import type { HabitCompletion } from "../habits-client";
import { type MonthGrid, formatYmd } from "../month-grid";
import { classifyDay } from "../classify-day";
import { DayCell } from "./DayCell";

interface HabitCalendarProps {
  habit: HabitCompletion;
  monthGrid: MonthGrid;
}

const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function countCompletionsInMonth(
  completionDates: string[],
  year: number,
  month: number
): number {
  const prefix = `${year}-${String(month).padStart(2, "0")}-`;
  return completionDates.filter((d) => d.startsWith(prefix)).length;
}

export function HabitCalendar({ habit, monthGrid }: HabitCalendarProps) {
  const total = daysInMonth(monthGrid.year, monthGrid.month);
  const done = countCompletionsInMonth(
    habit.completionDates,
    monthGrid.year,
    monthGrid.month
  );

  return (
    <article className="mb-10">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="font-serif text-xl text-ink">{habit.content}</h3>
        <span className="text-sm text-ink-muted tabular-nums">
          {done}/{total}
        </span>
      </div>

      <div
        className="grid grid-cols-7 gap-1 mb-1"
        aria-hidden="true"
      >
        {DAY_LABELS.map((label, i) => (
          <div
            key={i}
            className="text-center text-xs text-ink-muted uppercase tracking-wide"
          >
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {monthGrid.weeks.flatMap((week) =>
          week.map((date) => {
            const inMonth = date.getUTCMonth() + 1 === monthGrid.month;
            const status = classifyDay(
              date,
              habit.completionDates,
              habit.skippedDates
            );
            return (
              <DayCell
                key={formatYmd(date)}
                date={date}
                inMonth={inMonth}
                status={status}
              />
            );
          })
        )}
      </div>
    </article>
  );
}
