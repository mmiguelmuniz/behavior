/**
 * Equipe (só ADMIN): cadastrar e editar quem pode entrar no sistema e o que cada um vê.
 * O ID do documento em staff/ é o e-mail em minúsculas.
 */
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { db } from "./admin";
import { requireAdmin, StaffRole } from "./auth";
import { ALLOWED_DOMAIN } from "./config";

export const ROLES: StaffRole[] = ["admin", "teacher", "psychologist", "substitute", "office"];
const EMAIL_RE = /^[a-z0-9._%+'-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/;

export interface StaffInput {
  email: string; name: string; role: StaffRole; subject: string; division: string;
  grades: number[]; classes: string[]; historyGrades: number[]; wholeGradeAccess: number[];
  canSeeCounts: boolean; active: boolean;
}

const grades = (v: unknown) =>
  [...new Set((Array.isArray(v) ? v : []).map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 12))].sort((a, b) => a - b);

/** Validação pura (testada). */
export function validateStaffInput(raw: unknown): StaffInput {
  const d = (raw ?? {}) as Record<string, unknown>;
  const bad = (m: string) => { throw new HttpsError("invalid-argument", m); };
  const email = String(d.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email) || !email.endsWith("@" + ALLOWED_DOMAIN)) bad(`Use um e-mail @${ALLOWED_DOMAIN}.`);
  const name = String(d.name ?? "").trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 120) bad("nome inválido");
  const role = String(d.role ?? "") as StaffRole;
  if (!ROLES.includes(role)) bad("papel inválido");
  const classes = [...new Set((Array.isArray(d.classes) ? d.classes : []).map((c) => String(c).trim().toUpperCase()).filter(Boolean))];
  if (classes.some((c) => !/^[A-Z0-9_-]{1,16}$/.test(c))) bad("turma inválida");
  return {
    email, name, role,
    subject: String(d.subject ?? "").trim().slice(0, 80),
    division: String(d.division ?? "").trim().slice(0, 60),
    grades: grades(d.grades), classes: classes.slice(0, 40),
    historyGrades: grades(d.historyGrades), wholeGradeAccess: grades(d.wholeGradeAccess),
    canSeeCounts: d.canSeeCounts === true, active: d.active !== false,
  };
}

export async function saveStaff(request: CallableRequest) {
  const me = await requireAdmin(request);
  const input = validateStaffInput(request.data);
  // Evita que o ADMIN tire o próprio acesso sem querer.
  if (input.email === me && (input.role !== "admin" || !input.active)) {
    throw new HttpsError("failed-precondition", "self-lockout");
  }
  const { email, ...data } = input;
  const ref = db.doc(`staff/${email}`);
  const exists = (await ref.get()).exists;
  await ref.set({ ...data, updatedAt: FieldValue.serverTimestamp(), updatedBy: me, ...(exists ? {} : { createdAt: FieldValue.serverTimestamp() }) }, { merge: true });
  logger.info("staff_saved", { created: !exists, role: input.role });
  return { ok: true, created: !exists };
}

export async function setStaffActive(request: CallableRequest) {
  const me = await requireAdmin(request);
  const d = (request.data ?? {}) as { email?: unknown; active?: unknown };
  const email = String(d.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email) || typeof d.active !== "boolean") throw new HttpsError("invalid-argument", "dados inválidos");
  if (email === me && !d.active) throw new HttpsError("failed-precondition", "self-lockout");
  const ref = db.doc(`staff/${email}`);
  if (!(await ref.get()).exists) throw new HttpsError("not-found", "Pessoa não encontrada.");
  await ref.update({ active: d.active, updatedAt: FieldValue.serverTimestamp(), updatedBy: me });
  return { ok: true };
}
