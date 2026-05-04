export default function Home() {
  const now = new Date();
  const monthLabel = now.toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <main className="max-w-2xl mx-auto px-4 py-12">
      <h1 className="font-serif text-4xl font-bold mb-2">Habits</h1>
      <p className="text-ink-muted text-lg">{monthLabel}</p>
    </main>
  );
}
