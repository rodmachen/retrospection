import { X } from "lucide-react";
import type { DayStatus } from "../classify-day";

interface DayCellProps {
  date: Date;
  inMonth: boolean;
  status: DayStatus;
}

export function DayCell({ date, inMonth, status }: DayCellProps) {
  const day = date.getUTCDate();
  const fade = inMonth ? "" : "opacity-30";

  let inner: React.ReactNode;
  if (!inMonth) {
    inner = (
      <span className="text-sm text-ink tabular-nums">{day}</span>
    );
  } else if (status === "completed") {
    inner = (
      <span className="flex items-center justify-center w-full h-full rounded-full bg-mark text-paper text-sm font-medium tabular-nums">
        {day}
      </span>
    );
  } else if (status === "skipped") {
    inner = (
      <span className="relative flex items-center justify-center w-full h-full">
        <X
          className="absolute inset-0 m-auto w-[70%] h-[70%] text-ink/70"
          strokeWidth={1.5}
          aria-hidden="true"
        />
        <span className="sr-only">{day} (skipped)</span>
      </span>
    );
  } else {
    inner = (
      <span className="flex items-center justify-center w-full h-full rounded-full border border-ink/30 text-ink text-sm tabular-nums">
        {day}
      </span>
    );
  }

  return (
    <div className={`aspect-square flex items-center justify-center ${fade}`}>
      {inner}
    </div>
  );
}
