/**
 * Relatórios e atividade por período.
 * ADMIN vê tudo; psicólogas e Learning Support veem só os alunos cujas contagens podem ver.
 */
import { Timestamp } from "firebase-admin/firestore";
import { HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { db } from "./admin";
import { getStaff, StaffRecord } from "./auth";
import { canViewCounts } from "./access";
import { resolvePreview } from "./preview";

type Cat = "good" | "behavior" | "academic" | "other";
const CATS: Cat[] = ["good", "behavior", "academic", "other"];
const zero = (): Record<Cat, number> => ({ good: 0, behavior: 0, academic: 0, other: 0 });
const DAY = 86_400_000;
const MAX_DAYS = 800;

export interface ReportLog { studentId: string; category: string; createdAt: Date; authorName: string; legacy: boolean }
export interface ReportStudent { id: string; name: string; grade: number }

/** Segunda-feira da semana (horário de Recife, UTC−3), como AAAA-MM-DD. */
export function weekStart(d: Date): string {
  const local = new Date(d.getTime() - 3 * 3_600_000);
  const dow = (local.getUTCDay() + 6) % 7;
  const monday = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - dow));
  return monday.toISOString().slice(0, 10);
}

/** Agregação pura (testada). */
export function aggregate(logs: ReportLog[], students: ReportStudent[]) {
  const byId = new Map(students.map((s) => [s.id, s]));
  const totals = zero();
  const byGrade: Record<number, Record<Cat, number>> = {};
  const byWeek: Record<string, Record<Cat, number>> = {};
  const byStudent: Record<string, Record<Cat, number>> = {};
  const byAuthor: Record<string, number> = {};
  for (const l of logs) {
    const s = byId.get(l.studentId);
    if (!s) continue;
    const c: Cat = (CATS as string[]).includes(l.category) ? (l.category as Cat) : "other";
    totals[c]++;
    (byGrade[s.grade] ??= zero())[c]++;
    (byWeek[weekStart(l.createdAt)] ??= zero())[c]++;
    (byStudent[s.id] ??= zero())[c]++;
    if (l.authorName) byAuthor[l.authorName] = (byAuthor[l.authorName] ?? 0) + 1;
  }
  return {
    totals,
    byGrade: Object.entries(byGrade).map(([g, c]) => ({ grade: Number(g), ...c })).sort((a, b) => a.grade - b.grade),
    byWeek: Object.entries(byWeek).map(([week, c]) => ({ week, ...c })).sort((a, b) => a.week.localeCompare(b.week)),
    students: Object.entries(byStudent).map(([id, c]) => ({ id, name: byId.get(id)!.name, grade: byId.get(id)!.grade, ...c }))
      .sort((a, b) => b.behavior - a.behavior || (b.good + b.behavior + b.academic) - (a.good + a.behavior + a.academic) || a.name.localeCompare(b.name)),
    authors: Object.entries(byAuthor).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 15),
  };
}

const canUseReports = (s: StaffRecord) => s.role === "admin" || s.role === "psychologist" || s.canSeeCounts === true;

export async function reportData(request: CallableRequest) {
  const token = request.auth?.token;
  if (!token?.email || token.email_verified !== true) throw new HttpsError("unauthenticated", "Login necessário.");
  const me = await getStaff(token.email);
  if (!me) throw new HttpsError("permission-denied", "Sem acesso.");
  const d = (request.data ?? {}) as { from?: unknown; to?: unknown; grades?: unknown; previewAs?: unknown };
  const { staff } = await resolvePreview({ email: token.email.toLowerCase(), staff: me }, d.previewAs);
  if (!canUseReports(staff)) throw new HttpsError("permission-denied", "Sem acesso a relatórios.");

  const from = new Date(String(d.from ?? "")), to = new Date(String(d.to ?? ""));
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) throw new HttpsError("invalid-argument", "período inválido");
  if ((to.getTime() - from.getTime()) / DAY > MAX_DAYS) throw new HttpsError("invalid-argument", "período longo demais");
  const wanted = Array.isArray(d.grades) ? new Set(d.grades.map(Number)) : null;

  const studentsSnap = await db.collection("students").get();
  const students: ReportStudent[] = [];
  studentsSnap.forEach((s) => {
    const info = { grade: Number(s.get("grade")), sectionIds: (s.get("sectionIds") as string[] | undefined) ?? [] };
    if (wanted && !wanted.has(info.grade)) return;
    if (!canViewCounts(staff, info)) return;
    students.push({ id: s.id, name: String(s.get("name") ?? ""), grade: info.grade });
  });

  const logsSnap = await db.collection("logs")
    .where("createdAt", ">=", Timestamp.fromDate(from))
    .where("createdAt", "<=", Timestamp.fromDate(to))
    .orderBy("createdAt", "desc").limit(20000).get();
  const logs: ReportLog[] = [];
  logsSnap.forEach((l) => {
    if (l.get("voided") === true) return;
    logs.push({
      studentId: String(l.get("studentId")), category: String(l.get("category")),
      createdAt: (l.get("createdAt") as Timestamp).toDate(), authorName: String(l.get("authorName") ?? ""), legacy: l.get("legacy") === true,
    });
  });

  return {
    from: from.toISOString(), to: to.toISOString(), generatedAt: new Date().toISOString(),
    scopeStudents: students.length, scopeGrades: [...new Set(students.map((s) => s.grade))].sort((a, b) => a - b),
    ...aggregate(logs, students),
  };
}