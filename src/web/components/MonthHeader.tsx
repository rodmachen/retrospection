import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addMonths } from "../month-grid";

interface MonthHeaderProps {
  year: number;
  month: number; // 1-based
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function monthHref({ year, month }: { year: number; month: number }): string {
  const m = String(month).padStart(2, "0");
  return `/?month=${year}-${m}`;
}

export function MonthHeader({ year, month }: MonthHeaderProps) {
  const prev = addMonths(year, month, -1);
  const next = addMonths(year, month, 1);
  const label = `${MONTH_NAMES[month - 1]} ${year}`;

  return (
    <header className="flex items-center justify-between mb-10">
      <Link
        href={monthHref(prev)}
        aria-label={`Previous month: ${MONTH_NAMES[prev.month - 1]} ${prev.year}`}
        className="p-2 -ml-2 text-ink-muted hover:text-ink transition-colors"
      >
        <ChevronLeft className="w-6 h-6" strokeWidth={1.5} />
      </Link>
      <h1 className="font-serif text-3xl sm:text-4xl text-ink text-center">
        {label}
      </h1>
      <Link
        href={monthHref(next)}
        aria-label={`Next month: ${MONTH_NAMES[next.month - 1]} ${next.year}`}
        className="p-2 -mr-2 text-ink-muted hover:text-ink transition-colors"
      >
        <ChevronRight className="w-6 h-6" strokeWidth={1.5} />
      </Link>
    </header>
  );
}
