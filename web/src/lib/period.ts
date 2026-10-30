export type PeriodKey = "7d" | "30d" | "90d" | "year" | "custom";

/** Início do ano letivo (agosto). */
export function schoolYearStart(now = new Date()) {
  const y = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  return new Date(y, 7, 1);
}

export const toInputDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function periodRange(key: PeriodKey, custom?: { from: string; to: string }): { from: Date; to: Date } {
  const now = new Date();
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const daysAgo = (n: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - n + 1);
  if (key === "7d") return { from: daysAgo(7), to: endOfToday };
  if (key === "30d") return { from: daysAgo(30), to: endOfToday };
  if (key === "90d") return { from: daysAgo(90), to: endOfToday };
  if (key === "year") return { from: schoolYearStart(now), to: endOfToday };
  const from = custom?.from ? new Date(`${custom.from}T00:00:00`) : daysAgo(30);
  const to = custom?.to ? new Date(`${custom.to}T23:59:59`) : endOfToday;
  return { from, to };
}
