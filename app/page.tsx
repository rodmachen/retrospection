import { cookies } from "next/headers";
import { MonthHeader } from "@/web/components/MonthHeader";
import { HabitCalendar } from "@/web/components/HabitCalendar";
import {
  getMonthGrid,
  formatYmd,
  parseMonthParam,
} from "@/web/month-grid";
import {
  fetchHabitCompletions,
  type HabitCompletion,
} from "@/web/habits-client";

interface PageProps {
  searchParams: Promise<{ month?: string }>;
}

function currentUtcMonth(): { year: number; month: number } {
  const now = new Date();
  return {
    year: now.getUTCFullYear(),
    month: now.getUTCMonth() + 1,
  };
}

function lastDayOfMonth(year: number, month: number): Date {
  return new Date(Date.UTC(year, month, 0));
}

function groupBySection(
  habits: HabitCompletion[]
): { section: string; sectionOrder: number; habits: HabitCompletion[] }[] {
  const map = new Map<
    string,
    { section: string; sectionOrder: number; habits: HabitCompletion[] }
  >();
  for (const h of habits) {
    const existing = map.get(h.section);
    if (existing) {
      existing.habits.push(h);
    } else {
      map.set(h.section, {
        section: h.section,
        sectionOrder: h.sectionOrder,
        habits: [h],
      });
    }
  }
  const groups = Array.from(map.values());
  groups.sort((a, b) => a.sectionOrder - b.sectionOrder);
  for (const g of groups) {
    g.habits.sort((a, b) => a.content.localeCompare(b.content));
  }
  return groups;
}

export default async function Home({ searchParams }: PageProps) {
  const { month: monthParam } = await searchParams;
  const { year, month } = monthParam
    ? parseMonthParam(monthParam)
    : currentUtcMonth();

  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const lastOfMonth = lastDayOfMonth(year, month);
  const start = formatYmd(firstOfMonth);
  const end = formatYmd(lastOfMonth);

  const monthGrid = getMonthGrid(year, month);

  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

  const habits = await fetchHabitCompletions({
    project: "Habits",
    start,
    end,
    cookie: cookieHeader,
  });

  const groups = groupBySection(habits);

  return (
    <main className="max-w-2xl mx-auto px-4 py-10 sm:py-14">
      <MonthHeader year={year} month={month} />

      {groups.length === 0 ? (
        <p className="font-serif text-lg text-ink-muted text-center mt-16">
          No habits yet — make sure your Todoist &lsquo;Habits&rsquo; project
          has tasks.
        </p>
      ) : (
        groups.map((group) => (
          <section key={group.section} className="mb-12">
            <h2 className="font-serif text-2xl text-ink mb-6">
              {group.section}
            </h2>
            {group.habits.map((habit) => (
              <HabitCalendar
                key={habit.taskId}
                habit={habit}
                monthGrid={monthGrid}
              />
            ))}
          </section>
        ))
      )}
    </main>
  );
}
