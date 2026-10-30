/**
 * Regras de acesso por papel (portadas da versão 88 do Hub). Funções puras e testadas.
 *  - admin: tudo.
 *  - psychologist: histórico e contagens dos anos em `grades`.
 *  - teacher: histórico dos anos em `historyGrades`, ou dos anos em `grades` quando tem
 *    acesso ao ano inteiro (`wholeGradeAccess`) ou à turma do aluno (`classes`).
 *  - substitute: busca e registra, sem histórico.
 *  - office: somente leitura (busca), sem registrar e sem histórico.
 */
import type { StaffRecord } from "./auth";

export interface StudentAccessInfo { grade: number; sectionIds?: string[] }

const nums = (v?: unknown[]) => (v ?? []).map(Number).filter(Number.isFinite);
const upper = (v?: unknown[]) => (v ?? []).map((x) => String(x).trim().toUpperCase()).filter(Boolean);

export function canViewHistory(staff: StaffRecord, student: StudentAccessInfo): boolean {
  const grade = Number(student.grade);
  if (staff.role === "admin") return true;
  if (staff.role === "psychologist") return nums(staff.grades).includes(grade);
  if (staff.role !== "teacher") return false;
  if (nums(staff.historyGrades).includes(grade)) return true;
  if (!nums(staff.grades).includes(grade)) return false;
  if (nums(staff.wholeGradeAccess).includes(grade)) return true;
  const mine = new Set(upper(staff.classes));
  return upper(student.sectionIds).some((s) => mine.has(s));
}

/** Quem vê contagens de um aluno (além do ADMIN): psicólogas e perfis marcados, só onde vê o histórico. */
export function canViewCounts(staff: StaffRecord, student: StudentAccessInfo): boolean {
  if (staff.role === "admin") return true;
  if (!canViewHistory(staff, student)) return false;
  return staff.role === "psychologist" || staff.canSeeCounts === true;
}

/** Quem pode registrar e abrir rascunhos para as famílias. */
export const canWriteLogs = (staff: StaffRecord) => ["admin", "teacher", "substitute", "psychologist"].includes(staff.role);
