import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { db } from "./admin";
import { getStaff, StaffRecord } from "./auth";
import { CATEGORIES, Category, isCategory } from "./config";
import { canViewCounts, canViewHistory, canWriteLogs } from "./access";
import { buildDraft } from "./gmail";
import { resolvePreview } from "./preview";

export const MAX_MESSAGE = 5000;
export const MAX_RECIPIENTS = 10;
export const AUTHOR_VOID_MINUTES = 60;

const EMAIL_RE = /^[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
type Counts = Record<Category, number>;
const zero = (): Counts => ({ good: 0, behavior: 0, academic: 0 });

export interface LogInput { studentId: string; category: Category; message: string; bcc: string[]; lang: "en" | "pt"; collectiveId?: string }

/** Validação pura (testada): nunca confia no que vem do navegador. */
export function validateLogInput(raw: unknown): LogInput {
  const d = (raw ?? {}) as Record<string, unknown>;
  const bad = (msg: string) => { throw new HttpsError("invalid-argument", msg); };
  const studentId = typeof d.studentId === "string" ? d.studentId.trim() : "";
  if (!ID_RE.test(studentId)) bad("studentId inválido");
  if (!isCategory(d.category)) bad("categoria inválida");
  const message = typeof d.message === "string" ? d.message.trim() : "";
  if (!message) bad("mensagem vazia");
  if (message.length > MAX_MESSAGE) bad(`mensagem acima de ${MAX_MESSAGE} caracteres`);
  let bcc: string[] = [];
  if (d.bcc !== undefined) {
    if (!Array.isArray(d.bcc) || d.bcc.length > MAX_RECIPIENTS) bad("bcc inválido");
    bcc = [...new Set((d.bcc as unknown[]).map((e) => String(e).trim().toLowerCase()))];
    if (bcc.some((e) => e.length > 254 || !EMAIL_RE.test(e))) bad("bcc contém e-mail inválido");
  }
  return { studentId, category: d.category as Category, message, bcc, lang: d.lang === "pt" ? "pt" : "en" };
}

async function requireStaff(request: CallableRequest): Promise<{ email: string; staff: StaffRecord }> {
  const token = request.auth?.token;
  if (!token?.email || token.email_verified !== true) throw new HttpsError("unauthenticated", "Login necessário.");
  const staff = await getStaff(token.email);
  if (!staff) throw new HttpsError("permission-denied", "Conta sem acesso.");
  return { email: token.email.toLowerCase(), staff };
}

async function loadStudent(studentId: string) {
  if (!ID_RE.test(studentId)) throw new HttpsError("invalid-argument", "studentId inválido");
  const snap = await db.doc(`students/${studentId}`).get();
  if (!snap.exists) throw new HttpsError("not-found", "Aluno não encontrado.");
  return snap;
}

type Snap = FirebaseFirestore.DocumentSnapshot;

/** Grava um registro e devolve o link do rascunho (usado no individual e no coletivo). */
async function saveOne(email: string, staff: StaffRecord, input: LogInput, student: Snap, contacts: Snap, appCfg: Snap) {
  const studentName = String(student.get("name") ?? "");
  const message = input.message.replaceAll("{{name}}", studentName);
  const draft = buildDraft({
    mode: appCfg.get("gmailMode") === "inbox" ? "inbox" : "compose",
    lang: input.lang, category: input.category, message, studentName, grade: Number(student.get("grade")),
    parentEmails: (contacts.get("parentEmails") as string[] | undefined) ?? [],
    studentEmail: contacts.get("studentEmail") ?? null,
    secondaryOffice: appCfg.get("secondaryOffice") ?? null,
    bcc: input.bcc, authUser: email,
  });
  if (!draft.url) throw new HttpsError("invalid-argument", "message-too-long");
  const ref = db.collection("logs").doc();
  await ref.set({
    studentId: student.id, category: input.category, message,
    to: draft.to, cc: draft.cc, bcc: draft.bcc, grade: student.get("grade") ?? null,
    authorEmail: email, authorName: staff.name ?? email,
    createdAt: FieldValue.serverTimestamp(), voided: false, legacy: false,
    ...(input.collectiveId ? { collectiveId: input.collectiveId } : {}),
  });
  return { id: ref.id, gmailUrl: draft.url, hasParentEmail: draft.to.length > 0 };
}

async function requireWriter(request: CallableRequest) {
  const ctx = await requireStaff(request);
  if (!canWriteLogs(ctx.staff)) throw new HttpsError("permission-denied", "Seu perfil é somente leitura.");
  return ctx;
}

/**
 * Salva o registro e devolve o link do rascunho no Gmail.
 * Os e-mails dos responsáveis são lidos aqui, no servidor, e só aparecem dentro do Gmail.
 */
export async function createLog(request: CallableRequest) {
  const { email, staff } = await requireWriter(request);
  const input = validateLogInput(request.data);
  const student = await loadStudent(input.studentId);
  if (student.get("active") !== true) throw new HttpsError("not-found", "Aluno não encontrado.");
  const [contacts, appCfg] = await Promise.all([db.doc(`studentContacts/${input.studentId}`).get(), db.doc("config/app").get()]);
  const r = await saveOne(email, staff, input, student, contacts, appCfg);
  logger.info("log_created", { logId: r.id, category: input.category }); // sem texto nem nomes
  return { id: r.id, gmailUrl: r.gmailUrl };
}

export const COLLECTIVE_MIN = 2;
export const COLLECTIVE_MAX = 25;

/** Registro coletivo: mesma mensagem para 2 a 25 alunos, um rascunho separado por família. */
export async function createCollectiveLogs(request: CallableRequest) {
  const { email, staff } = await requireWriter(request);
  const raw = (request.data ?? {}) as Record<string, unknown>;
  const ids = Array.isArray(raw.studentIds) ? [...new Set(raw.studentIds.map(String))] : [];
  if (ids.length < COLLECTIVE_MIN || ids.length > COLLECTIVE_MAX) {
    throw new HttpsError("invalid-argument", `Selecione de ${COLLECTIVE_MIN} a ${COLLECTIVE_MAX} alunos.`);
  }
  const base = validateLogInput({ ...raw, studentId: ids[0] });
  const students = await Promise.all(ids.map(loadStudent));
  if (students.some((s) => s.get("active") !== true)) throw new HttpsError("not-found", "Há aluno inativo na seleção.");
  const [contacts, appCfg] = await Promise.all([
    db.getAll(...ids.map((id) => db.doc(`studentContacts/${id}`))),
    db.doc("config/app").get(),
  ]);
  const collectiveId = db.collection("logs").doc().id;
  const results = [];
  for (let i = 0; i < students.length; i++) {
    const r = await saveOne(email, staff, { ...base, studentId: ids[i], collectiveId }, students[i], contacts[i], appCfg);
    results.push({ studentId: ids[i], name: String(students[i].get("name") ?? ""), ...r });
  }
  logger.info("collective_created", { collectiveId, count: results.length, category: base.category });
  return { collectiveId, drafts: results };
}

/** Histórico do aluno conforme o papel. Contagens só para quem pode vê-las. */
export async function listStudentLogs(request: CallableRequest) {
  const data = (request.data ?? {}) as { studentId?: unknown; previewAs?: unknown };
  const { email, staff, preview } = await resolvePreview(await requireStaff(request), data.previewAs);
  const studentId = String(data.studentId ?? "");
  const student = await loadStudent(studentId);
  const info = { grade: Number(student.get("grade")), sectionIds: (student.get("sectionIds") as string[] | undefined) ?? [] };
  if (!canViewHistory(staff, info)) throw new HttpsError("permission-denied", "Sem acesso ao histórico deste aluno.");

  let q = db.collection("logs").where("studentId", "==", studentId);
  if (staff.role !== "admin") q = q.where("voided", "==", false);
  const [snap, legacyDocs, countsSnap] = await Promise.all([
    q.orderBy("createdAt", "desc").limit(200).get(),
    db.doc(`studentLegacy/${studentId}`).get(),
    canViewCounts(staff, info) ? db.doc(`studentCounts/${studentId}`).get() : Promise.resolve(null),
  ]);
  const now = Date.now();
  return {
    logs: snap.docs.map((d) => {
      const created = d.get("createdAt") as Timestamp | undefined;
      const legacy = d.get("legacy") === true;
      const mine = d.get("authorEmail") === email;
      return {
        id: d.id, category: d.get("category"), message: d.get("message") ?? "",
        authorName: d.get("authorName") ?? "", createdAt: created?.toDate().toISOString() ?? null,
        voided: d.get("voided") === true, legacy, sourceUrl: d.get("sourceUrl") ?? null, mine,
        canVoid: !preview && !legacy && d.get("voided") !== true &&
          (staff.role === "admin" || (mine && !!created && now - created.toMillis() < AUTHOR_VOID_MINUTES * 60_000)),
        canDelete: !preview && canDeleteLog(staff, mine, legacy, d.get("voided") === true),
      };
    }),
    driveDocs: ((legacyDocs.get("driveDocs") as Array<{ title: string; url: string }> | undefined) ?? []),
    counts: countsSnap?.exists ? { good: countsSnap.get("good") ?? 0, behavior: countsSnap.get("behavior") ?? 0, academic: countsSnap.get("academic") ?? 0 } : null,
  };
}

/** Anula um registro (não apaga): ADMIN a qualquer momento; o autor até 60 minutos depois. */
export async function voidLog(request: CallableRequest) {
  const { email, staff } = await requireStaff(request);
  const data = (request.data ?? {}) as { logId?: unknown; reason?: unknown };
  const logId = String(data.logId ?? "");
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(logId)) throw new HttpsError("invalid-argument", "logId inválido");
  const ref = db.doc(`logs/${logId}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Registro não encontrado.");
    if (snap.get("legacy") === true) throw new HttpsError("failed-precondition", "Registros importados não podem ser cancelados aqui.");
    if (snap.get("voided") === true) return;
    const created = snap.get("createdAt") as Timestamp | undefined;
    const authorInWindow = snap.get("authorEmail") === email && !!created && Date.now() - created.toMillis() < AUTHOR_VOID_MINUTES * 60_000;
    if (staff.role !== "admin" && !authorInWindow) throw new HttpsError("permission-denied", "Sem permissão para cancelar.");
    tx.update(ref, { voided: true, voidedBy: email, voidedAt: FieldValue.serverTimestamp(), voidReason: String(data.reason ?? "").slice(0, 300) });
  });
  return { ok: true };
}

/** Apagar de vez: só registros já cancelados; ADMIN qualquer um, o autor só os próprios. Importados não. */
export const canDeleteLog = (staff: StaffRecord, mine: boolean, legacy: boolean, voided: boolean) =>
  voided && !legacy && (staff.role === "admin" || mine);

export async function deleteLog(request: CallableRequest) {
  const { email, staff } = await requireStaff(request);
  const logId = String((request.data as { logId?: unknown })?.logId ?? "");
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(logId)) throw new HttpsError("invalid-argument", "logId inválido");
  const ref = db.doc(`logs/${logId}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const mine = snap.get("authorEmail") === email;
    if (!canDeleteLog(staff, mine, snap.get("legacy") === true, snap.get("voided") === true)) {
      throw new HttpsError("permission-denied", "Só é possível apagar registros cancelados.");
    }
    // Trilha mínima de auditoria (sem o texto da mensagem).
    tx.set(db.doc(`deletedLogs/${logId}`), {
      studentId: snap.get("studentId"), category: snap.get("category"), authorEmail: snap.get("authorEmail") ?? null,
      createdAt: snap.get("createdAt") ?? null, deletedBy: email, deletedAt: FieldValue.serverTimestamp(),
    });
    tx.delete(ref);
  });
  logger.info("log_deleted", { logId });
  return { ok: true };
}

/** "Meus registros": tudo o que a própria pessoa registrou no período, com os nomes dos alunos. */
export async function myLogs(request: CallableRequest) {
  const { email, staff } = await requireStaff(request);
  const d = (request.data ?? {}) as { from?: unknown; to?: unknown };
  const from = new Date(String(d.from ?? "")), to = new Date(String(d.to ?? ""));
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) throw new HttpsError("invalid-argument", "período inválido");
  const snap = await db.collection("logs").where("authorEmail", "==", email)
    .where("createdAt", ">=", Timestamp.fromDate(from)).where("createdAt", "<=", Timestamp.fromDate(to))
    .orderBy("createdAt", "desc").limit(1500).get();
  const ids = [...new Set(snap.docs.map((x) => String(x.get("studentId"))))].filter((id) => ID_RE.test(id));
  const students = ids.length ? await db.getAll(...ids.map((id) => db.doc(`students/${id}`))) : [];
  const names = new Map(students.map((s) => [s.id, { name: String(s.get("name") ?? s.id), grade: Number(s.get("grade")) }]));
  const now = Date.now();
  return {
    logs: snap.docs.map((x) => {
      const created = x.get("createdAt") as Timestamp | undefined;
      const voided = x.get("voided") === true;
      const st = names.get(String(x.get("studentId")));
      return {
        id: x.id, studentId: x.get("studentId"), studentName: st?.name ?? x.get("studentId"), grade: st?.grade ?? x.get("grade") ?? null,
        category: x.get("category"), message: x.get("message") ?? "", createdAt: created?.toDate().toISOString() ?? null,
        voided, collective: !!x.get("collectiveId"),
        canVoid: !voided && (staff.role === "admin" || (!!created && now - created.toMillis() < AUTHOR_VOID_MINUTES * 60_000)),
        canDelete: canDeleteLog(staff, true, false, voided),
      };
    }),
  };
}

/**
 * Contagem = base importada da versão anterior (students.baseCounts / config/baseline)
 *          + registros feitos na plataforma (não anulados, não importados).
 * Recalculada do zero a cada mudança: nunca conta em dobro.
 */
export async function recomputeCounts(studentId: string) {
  const live = db.collection("logs").where("voided", "==", false).where("legacy", "==", false);
  const [studentSnap, baselineSnap, perStudent, totals] = await Promise.all([
    db.doc(`students/${studentId}`).get(),
    db.doc("config/baseline").get(),
    Promise.all(CATEGORIES.map((c) => live.where("studentId", "==", studentId).where("category", "==", c).count().get())),
    Promise.all(CATEGORIES.map((c) => live.where("category", "==", c).count().get())),
  ]);
  const base = { ...zero(), ...((studentSnap.get("baseCounts") as Partial<Counts> | undefined) ?? {}) };
  const baseTotals = { ...zero(), ...((baselineSnap.get("totals") as Partial<Counts> | undefined) ?? {}) };
  const sum = (b: Counts, arr: typeof perStudent) =>
    Object.fromEntries(CATEGORIES.map((c, i) => [c, (Number(b[c]) || 0) + arr[i].data().count])) as Counts;
  const batch = db.batch();
  batch.set(db.doc(`studentCounts/${studentId}`), { ...sum(base, perStudent), updatedAt: FieldValue.serverTimestamp() });
  batch.set(db.doc("stats/school"), { totals: sum(baseTotals, totals), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await batch.commit();
}