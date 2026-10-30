import { HttpsError as IdentityError } from "firebase-functions/v2/identity";
import { HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { db } from "./admin";
import { ALLOWED_DOMAIN } from "./config";

export type StaffRole = "admin" | "teacher" | "psychologist" | "substitute" | "office";
export interface StaffRecord {
  role: StaffRole;
  active: boolean;
  name?: string;
  subject?: string;
  division?: string;
  grades?: number[];          // anos em que a pessoa atua
  classes?: string[];         // turmas (ex.: "7C")
  historyGrades?: number[];   // anos com acesso ao histórico completo
  wholeGradeAccess?: number[];// anos com acesso a todas as turmas
  canSeeCounts?: boolean;     // ex.: Learning Support
}

const normalize = (email?: string | null) => (email ?? "").trim().toLowerCase();

export async function getStaff(email?: string | null): Promise<StaffRecord | null> {
  const key = normalize(email);
  if (!key.endsWith("@" + ALLOWED_DOMAIN)) return null;
  const snap = await db.doc(`staff/${key}`).get();
  const data = snap.data() as StaffRecord | undefined;
  return snap.exists && data?.active === true ? data : null;
}

/** Usado pelas blocking functions: recusa login de fora do domínio ou fora do cadastro. */
export async function assertCanSignIn(email?: string | null, emailVerified?: boolean) {
  if (!emailVerified || !normalize(email).endsWith("@" + ALLOWED_DOMAIN)) {
    throw new IdentityError("permission-denied", "Use sua conta da escola.");
  }
  if (!(await getStaff(email))) {
    throw new IdentityError("permission-denied", "Conta sem acesso autorizado.");
  }
}

/** Usado pelas callable functions que só o ADMIN pode chamar. */
export async function requireAdmin(request: CallableRequest): Promise<string> {
  const token = request.auth?.token;
  if (!token?.email || token.email_verified !== true) {
    throw new HttpsError("unauthenticated", "Login necessário.");
  }
  const staff = await getStaff(token.email);
  if (staff?.role !== "admin") throw new HttpsError("permission-denied", "Somente ADMIN.");
  return normalize(token.email);
}