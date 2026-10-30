import { HttpsError } from "firebase-functions/v2/https";
import { db } from "./admin";
import type { StaffRecord } from "./auth";

/**
 * "Ver como": só um ADMIN pode pedir; devolve o cadastro da pessoa simulada.
 * Usado apenas em leituras (histórico e relatórios). Nunca para gravar.
 */
export async function resolvePreview(requester: { email: string; staff: StaffRecord }, previewAs: unknown) {
  if (previewAs === undefined || previewAs === null || previewAs === "") return { ...requester, preview: false };
  if (requester.staff.role !== "admin") throw new HttpsError("permission-denied", "Somente ADMIN pode visualizar como outra pessoa.");
  const email = String(previewAs).trim().toLowerCase();
  if (!/^[a-z0-9._%+'-]+@[a-z0-9.-]+$/.test(email)) throw new HttpsError("invalid-argument", "previewAs inválido");
  const snap = await db.doc(`staff/${email}`).get();
  if (!snap.exists) throw new HttpsError("not-found", "Pessoa não encontrada.");
  return { email, staff: { ...(snap.data() as StaffRecord), active: true }, preview: true };
}
