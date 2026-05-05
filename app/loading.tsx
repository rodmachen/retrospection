export default function Loading() {
  return (
    <main className="max-w-2xl mx-auto px-4 py-10 sm:py-14">
      {/* Month header skeleton */}
      <div className="flex items-center justify-between mb-10">
        <div className="h-5 w-8 rounded bg-ink/10" />
        <div className="h-7 w-40 rounded bg-ink/10" />
        <div className="h-5 w-8 rounded bg-ink/10" />
      </div>

      {/* Calendar skeleton */}
      <div className="mb-8">
        <div className="h-6 w-32 rounded bg-ink/10 mb-6" />
        <div className="rounded-lg border border-ink/10 p-4">
          {/* Habit label row */}
          <div className="h-5 w-48 rounded bg-ink/10 mb-4" />
          {/* Day-of-week row */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="h-4 rounded bg-ink/5" />
            ))}
          </div>
          {/* 5-week grid of day circles */}
          {Array.from({ length: 5 }).map((_, row) => (
            <div key={row} className="grid grid-cols-7 gap-1 mb-1">
              {Array.from({ length: 7 }).map((_, col) => (
                <div
                  key={col}
                  className="aspect-square rounded-full bg-ink/5"
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
