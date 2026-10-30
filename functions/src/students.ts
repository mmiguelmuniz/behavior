/**
 * Gerenciar alunos (só ADMIN): adicionar, editar, arquivar/restaurar e fotos.
 * Tudo passa pelo servidor, que valida e mantém alunos e contatos consistentes.
 */
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { db } from "./admin";
import { requireAdmin } from "./auth";

const EMAIL_RE = /^[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
export const MAX_PHOTO_BYTES = 250 * 1024;
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const photoPath = (studentId: string) => `student-photos/${studentId}`;

// Carregado só quando usado: deixa o deploy e o início das functions mais rápidos.
const bucket = async () => (await import("firebase-admin/storage")).getStorage().bucket();

export interface StudentInput {
  id?: string; name: string; grade: number; officialId: string | null; sectionIds: string[];
  guardians: Array<{ name: string; email: string }>; studentEmail: string | null; revision?: number;
}

/** Validação pura (testada). */
export function validateStudentInput(raw: unknown): StudentInput {
  const d = (raw ?? {}) as Record<string, unknown>;
  const bad = (m: string) => { throw new HttpsError("invalid-argument", m); };
  const id = d.id === undefined || d.id === null || d.id === "" ? undefined : String(d.id);
  if (id !== undefined && !ID_RE.test(id)) bad("id inválido");
  const name = String(d.name ?? "").trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 120) bad("nome inválido");
  const grade = Number(d.grade);
  if (!Number.isInteger(grade) || grade < 1 || grade > 12) bad("ano inválido");
  const officialId = d.officialId ? String(d.officialId).trim().slice(0, 32) : null;
  const sectionIds = Array.isArray(d.sectionIds)
    ? [...new Set(d.sectionIds.map((s) => String(s).trim().toUpperCase()).filter(Boolean))].slice(0, 10) : [];
  if (sectionIds.some((s) => !/^[A-Z0-9_-]{1,16}$/.test(s))) bad("turma inválida");
  const guardians = (Array.isArray(d.guardians) ? d.guardians : []).slice(0, 6).map((g) => {
    const x = (g ?? {}) as Record<string, unknown>;
    return { name: String(x.name ?? "").trim().slice(0, 120), email: String(x.email ?? "").trim().toLowerCase() };
  }).filter((g) => g.name || g.email);
  if (guardians.some((g) => !EMAIL_RE.test(g.email) || g.email.length > 254)) bad("e-mail de responsável inválido");
  const studentEmail = d.studentEmail ? String(d.studentEmail).trim().toLowerCase() : null;
  if (studentEmail && !EMAIL_RE.test(studentEmail)) bad("e-mail do aluno inválido");
  const revision = d.revision === undefined ? undefined : Number(d.revision);
  return { id, name, grade, officialId, sectionIds, guardians, studentEmail, revision };
}

export async function saveStudent(request: CallableRequest) {
  const admin = await requireAdmin(request);
  const input = validateStudentInput(request.data);
  const ref = input.id ? db.doc(`students/${input.id}`) : db.collection("students").doc();
  const parentEmails = [...new Set(input.guardians.map((g) => g.email))];
  const guardianNames = [...new Set(input.guardians.map((g) => g.name).filter(Boolean))];
  await db.runTransaction(async (tx) => {
    const cur = await tx.get(ref);
    if (input.id && !cur.exists) throw new HttpsError("not-found", "Aluno não encontrado.");
    const revision = Number(cur.get("revision") ?? 0);
    // Evita sobrescrever a edição de outra pessoa feita ao mesmo tempo.
    if (input.id && input.revision !== undefined && input.revision !== revision) {
      throw new HttpsError("aborted", "conflict");
    }
    tx.set(ref, {
      name: input.name, grade: input.grade, officialId: input.officialId, sectionIds: input.sectionIds,
      guardianNames, parentContactReady: parentEmails.length > 0, studentEmailReady: !!input.studentEmail,
      revision: revision + 1, updatedAt: FieldValue.serverTimestamp(), updatedBy: admin,
      ...(cur.exists ? {} : { active: true, baseCounts: { good: 0, behavior: 0, academic: 0 }, hasPhoto: false, createdAt: FieldValue.serverTimestamp() }),
    }, { merge: true });
    tx.set(db.doc(`studentContacts/${ref.id}`), {
      parentEmails, studentEmail: input.studentEmail,
      guardians: input.guardians, updatedAt: FieldValue.serverTimestamp(),
    });
  });
  logger.info("student_saved", { studentId: ref.id, created: !input.id });
  return { id: ref.id };
}

export async function setStudentActive(request: CallableRequest) {
  const admin = await requireAdmin(request);
  const d = (request.data ?? {}) as { studentId?: unknown; active?: unknown };
  const id = String(d.studentId ?? "");
  if (!ID_RE.test(id) || typeof d.active !== "boolean") throw new HttpsError("invalid-argument", "dados inválidos");
  const ref = db.doc(`students/${id}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Aluno não encontrado.");
  await ref.update({ active: d.active, revision: Number(snap.get("revision") ?? 0) + 1, updatedAt: FieldValue.serverTimestamp(), updatedBy: admin });
  return { ok: true };
}

/** Valida a imagem enviada (base64) e devolve os bytes. Pura e testada. */
export function decodePhoto(base64: unknown, contentType: unknown): Buffer {
  if (typeof contentType !== "string" || !PHOTO_TYPES.includes(contentType)) throw new HttpsError("invalid-argument", "Use JPG, PNG ou WebP.");
  if (typeof base64 !== "string" || base64.length > Math.ceil(MAX_PHOTO_BYTES * 1.4)) throw new HttpsError("invalid-argument", "photo-too-large");
  const bytes = Buffer.from(base64, "base64");
  if (!bytes.length || bytes.length > MAX_PHOTO_BYTES) throw new HttpsError("invalid-argument", "photo-too-large");
  const sig = bytes.subarray(0, 12);
  const ok = (contentType === "image/jpeg" && sig[0] === 0xff && sig[1] === 0xd8)
    || (contentType === "image/png" && sig.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])))
    || (contentType === "image/webp" && sig.subarray(0, 4).toString() === "RIFF" && sig.subarray(8, 12).toString() === "WEBP");
  if (!ok) throw new HttpsError("invalid-argument", "Arquivo não é uma imagem válida.");
  return bytes;
}

export async function setStudentPhoto(request: CallableRequest) {
  const admin = await requireAdmin(request);
  const d = (request.data ?? {}) as { studentId?: unknown; base64?: unknown; contentType?: unknown };
  const id = String(d.studentId ?? "");
  if (!ID_RE.test(id)) throw new HttpsError("invalid-argument", "studentId inválido");
  const bytes = decodePhoto(d.base64, d.contentType);
  const ref = db.doc(`students/${id}`);
  if (!(await ref.get()).exists) throw new HttpsError("not-found", "Aluno não encontrado.");
  await (await bucket()).file(photoPath(id)).save(bytes, {
    contentType: String(d.contentType), resumable: false,
    metadata: { cacheControl: "private, max-age=0", metadata: { uploadedBy: admin } },
  });
  await ref.update({ hasPhoto: true, photoVersion: Date.now(), updatedAt: FieldValue.serverTimestamp() });
  return { ok: true };
}

export async function removeStudentPhoto(request: CallableRequest) {
  await requireAdmin(request);
  const id = String((request.data as { studentId?: unknown })?.studentId ?? "");
  if (!ID_RE.test(id)) throw new HttpsError("invalid-argument", "studentId inválido");
  await (await bucket()).file(photoPath(id)).delete({ ignoreNotFound: true });
  await db.doc(`students/${id}`).update({ hasPhoto: false, photoVersion: Date.now(), updatedAt: FieldValue.serverTimestamp() });
  return { ok: true };
}