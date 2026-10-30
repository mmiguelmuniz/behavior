/** Feedback da equipe: qualquer pessoa autorizada envia; só o ADMIN lê e marca como resolvido. */
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { db } from "./admin";
import { getStaff, requireAdmin } from "./auth";

export const FEEDBACK_TYPES = ["suggestion", "problem", "praise"] as const;
export const MAX_FEEDBACK = 1200;

export function validateFeedback(raw: unknown) {
  const d = (raw ?? {}) as Record<string, unknown>;
  const type = String(d.type ?? "");
  if (!(FEEDBACK_TYPES as readonly string[]).includes(type)) throw new HttpsError("invalid-argument", "tipo inválido");
  const message = String(d.message ?? "").trim();
  if (message.length < 3) throw new HttpsError("invalid-argument", "mensagem curta demais");
  if (message.length > MAX_FEEDBACK) throw new HttpsError("invalid-argument", `máximo de ${MAX_FEEDBACK} caracteres`);
  const page = String(d.page ?? "").slice(0, 40);
  return { type, message, page };
}

export async function sendFeedback(request: CallableRequest) {
  const token = request.auth?.token;
  if (!token?.email || token.email_verified !== true) throw new HttpsError("unauthenticated", "Login necessário.");
  const staff = await getStaff(token.email);
  if (!staff) throw new HttpsError("permission-denied", "Sem acesso.");
  const input = validateFeedback(request.data);
  await db.collection("feedback").add({
    ...input, authorEmail: token.email.toLowerCase(), authorName: staff.name ?? token.email, role: staff.role,
    status: "new", createdAt: FieldValue.serverTimestamp(),
  });
  return { ok: true };
}

export async function setFeedbackStatus(request: CallableRequest) {
  const me = await requireAdmin(request);
  const d = (request.data ?? {}) as { id?: unknown; status?: unknown };
  const id = String(d.id ?? "");
  if (!/^[A-Za-z0-9]{1,40}$/.test(id) || !["new", "resolved"].includes(String(d.status))) throw new HttpsError("invalid-argument", "dados inválidos");
  await db.doc(`feedback/${id}`).update({ status: d.status, resolvedBy: d.status === "resolved" ? me : null, updatedAt: FieldValue.serverTimestamp() });
  return { ok: true };
}
