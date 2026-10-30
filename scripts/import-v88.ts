/**
 * Importa a versão 88 do Hub (site do ChatGPT) para o Firestore.
 * Lê a pasta `data/` do pacote v88 (e, opcionalmente, o `worker/index.template.js`).
 * Roda SÓ na máquina da TI. Os dados reais nunca vão para o Git nem para fora da escola.
 *
 *   Validar (não grava nada):
 *     npm run import-v88 -- --data "C:\\caminho\\Student-Support-Hub\\data" --worker "C:\\caminho\\Student-Support-Hub\\worker\\index.template.js"
 *   Gravar em produção:
 *     gcloud auth application-default login
 *     $env:GCLOUD_PROJECT="ear-student-hub"   (PowerShell)
 *     npm run import-v88 -- --data "..." --worker "..." --confirm
 *   Emulador: defina FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 e GCLOUD_PROJECT=demo-ear-hub.
 *
 * O que grava:
 *   students/{id}        nome, ano, ID oficial, ativo/arquivado, nomes dos responsáveis, contagens-base
 *   studentContacts/{id} e-mails dos responsáveis e do aluno (só ADMIN lê)
 *   studentLegacy/{id}   links dos documentos antigos do Drive (só via servidor)
 *   staff/{email}        papel, anos, turmas e acessos (mescla: não apaga quem já existe)
 *   logs/legacy-*        eventos datados importados do Drive (não contam em dobro)
 *   config/baseline      totais-base da escola; studentCounts e stats/school recalculados
 *   student-photos/{id}  (com --with-photos) fotos de data/student-photos, conforme o manifesto
 * É idempotente: rodar de novo atualiza sem duplicar.
 * Só as fotos (sem mexer em alunos, equipe e registros): --photos-only
 * Fotos junto com tudo: --with-photos (bucket padrão: <projeto>.firebasestorage.app; ou --bucket NOME).
 */
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

const args = process.argv.slice(2);
const arg = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const flag = (n: string) => args.includes(`--${n}`);

type Cat = "good" | "behavior" | "academic";
const CATS: Cat[] = ["good", "behavior", "academic"];
const EMAIL_RE = /^[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const okEmail = (v: unknown): v is string => typeof v === "string" && v.length <= 254 && EMAIL_RE.test(v.trim());
const okDriveUrl = (v: unknown) => {
  try { const u = new URL(String(v)); return u.protocol === "https:" && ["drive.google.com", "docs.google.com"].includes(u.hostname); }
  catch { return false; }
};
const nums = (v: unknown) => (Array.isArray(v) ? v.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 12) : []);
const strs = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : []);
const readJson = (p: string) => JSON.parse(readFileSync(p, "utf8"));

/** Lê um Set([...]) de e-mails declarado no worker da v88. */
function emailSetFromWorker(src: string, name: string): string[] {
  const m = new RegExp(`${name}\\s*=\\s*new Set\\(\\[([\\s\\S]*?)\\]\\)`).exec(src);
  return m ? [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1].toLowerCase()).filter(okEmail) : [];
}

async function main() {
  const dataDir = arg("data");
  if (!dataDir || !existsSync(join(dataDir, "roster.json"))) throw new Error("Informe --data apontando para a pasta data/ da v88 (com roster.json).");
  const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
  const write = emulator || flag("confirm");

  const roster = readJson(join(dataDir, "roster.json")) as any[];
  const users = readJson(join(dataDir, "users.json")) as any[];
  const activityPath = join(dataDir, "log-activity.json");
  const events = (existsSync(activityPath) ? readJson(activityPath).events : []) as any[];

  let learningSupport: string[] = [];
  let officeCc: string | null = null;
  const workerPath = arg("worker");
  if (workerPath) {
    const src = readFileSync(workerPath, "utf8");
    learningSupport = emailSetFromWorker(src, "learningSupportReportEmails");
    const m = /officeCcEmail\s*=\s*"([^"]+)"/.exec(src);
    officeCc = m && okEmail(m[1]) ? m[1].toLowerCase() : null;
  }

  const problems: string[] = [];
  const students = roster.map((s, i) => {
    const id = String(s.id ?? "");
    if (!ID_RE.test(id)) problems.push(`roster[${i}]: id inválido`);
    const grade = Number(s.grade);
    if (!Number.isInteger(grade) || grade < 1 || grade > 12) problems.push(`roster[${i}]: ano inválido`);
    const parentEmails = [...new Set(strs(s.parentEmails).map((e) => e.toLowerCase()).filter(okEmail))];
    const byEmail = (s.guardianNamesByEmail ?? {}) as Record<string, string>;
    const guardianNames = [...new Set(parentEmails.map((e) => String(byEmail[e] ?? "").trim()).filter(Boolean))];
    const guardians = parentEmails.map((e) => ({ name: String(byEmail[e] ?? "").trim(), email: e }));
    const studentEmail = okEmail(s.studentEmail) ? String(s.studentEmail).trim().toLowerCase() : null;
    const lc = s.logCounts ?? {};
    const baseCounts = Object.fromEntries(CATS.map((c) => [c, Math.max(0, Math.floor(Number(lc[c]) || 0))])) as Record<Cat, number>;
    const driveDocs = (Array.isArray(s.logDocs) ? s.logDocs : [])
      .filter((d: any) => okDriveUrl(d?.url))
      .map((d: any) => ({ id: String(d.id ?? ""), title: String(d.title ?? "Drive"), url: String(d.url) }));
    return {
      id, grade, name: String(s.name ?? "").trim(), officialId: s.studentId ? String(s.studentId) : null,
      active: s.active !== false, parentEmails, studentEmail, guardianNames, guardians, baseCounts, driveDocs,
    };
  });
  const byId = new Map(students.map((s) => [s.id, s]));
  if (byId.size !== students.length) problems.push("roster: ids duplicados");

  const staff = users.map((u, i) => {
    const email = String(u.email ?? "").trim().toLowerCase();
    if (!email.endsWith("@ear.com.br") || !okEmail(email)) problems.push(`users[${i}]: e-mail inválido`);
    const role = ["admin", "teacher", "psychologist", "substitute", "office"].includes(u.role) ? u.role : null;
    if (!role) problems.push(`users[${i}]: papel desconhecido`);
    return {
      email, name: String(u.name ?? email), role, subject: String(u.subject ?? ""), division: String(u.division ?? ""),
      grades: nums(u.grades), classes: strs(u.classes).map((c) => c.toUpperCase()),
      historyGrades: nums(u.historyGrades), wholeGradeAccess: nums(u.wholeGradeAccess),
      canSeeCounts: learningSupport.includes(email),
    };
  });

  let skippedEvents = 0;
  const legacyLogs = events.flatMap((e) => {
    const student = byId.get(String(e.studentId ?? ""));
    const when = new Date(String(e.sentAt ?? ""));
    const category = ["good", "behavior", "academic", "other"].includes(e.category) ? e.category : "other";
    if (!student || Number.isNaN(when.getTime())) { skippedEvents++; return []; }
    const doc = student.driveDocs.find((d: any) => d.id === String(e.sourceDocId ?? ""));
    const key = createHash("sha1").update([student.id, category, when.toISOString(), e.sourceDocId ?? "", e.senderName ?? ""].join("|")).digest("hex").slice(0, 24);
    return [{ id: `legacy-${key}`, studentId: student.id, grade: student.grade, category, authorName: String(e.senderName ?? ""), createdAt: when, sourceUrl: doc?.url ?? null }];
  });

  const photosOnly = flag("photos-only");
  const withPhotos = flag("with-photos") || photosOnly;
  const photos: Array<{ id: string; file: string }> = [];
  if (withPhotos) {
    const manifestPath = join(dataDir, "student-photo-manifest.json");
    const manifest = existsSync(manifestPath) ? (readJson(manifestPath) as Record<string, string>) : {};
    for (const [id, name] of Object.entries(manifest)) {
      const file = join(dataDir, "student-photos", String(name).replace(/[\\/]/g, ""));
      if (byId.has(id) && /\.(jpe?g)$/i.test(file) && existsSync(file)) photos.push({ id, file });
    }
  }

  const active = students.filter((s) => s.active);
  const baseTotals = Object.fromEntries(CATS.map((c) => [c, active.reduce((n, s) => n + s.baseCounts[c], 0)])) as Record<Cat, number>;

  console.log(`Alunos: ${students.length} (${active.length} ativos, ${students.length - active.length} arquivados)`);
  console.log(`Com contato de responsável: ${active.filter((s) => s.parentEmails.length).length} ativos`);
  console.log(`Equipe: ${staff.length} (${[...new Set(staff.map((s) => s.role))].map((r) => `${r}: ${staff.filter((s) => s.role === r).length}`).join(", ")})`);
  console.log(`Contagens-base (ativos): positivo ${baseTotals.good}, comportamento ${baseTotals.behavior}, acadêmico ${baseTotals.academic}`);
  console.log(`Eventos datados do Drive: ${legacyLogs.length} importáveis, ${skippedEvents} ignorados`);
  if (withPhotos) console.log(`Fotos encontradas: ${photos.length}`);
  console.log(`Learning Support (veem contagens): ${learningSupport.length} · Secondary Office: ${officeCc ? "encontrado" : "não informado"}`);
  if (problems.length) {
    console.error(`\n${problems.length} problema(s):\n` + problems.slice(0, 40).join("\n"));
    process.exitCode = 1;
    return;
  }
  if (!write) { console.log("\nValidação OK. Nada foi gravado. Para gravar, rode de novo com --confirm."); return; }

  const projectId = process.env.GCLOUD_PROJECT;
  initializeApp({ projectId, storageBucket: arg("bucket") ?? (emulator ? `${projectId}.appspot.com` : `${projectId}.firebasestorage.app`) });
  const db = getFirestore();
  const w = db.bulkWriter();
  const now = FieldValue.serverTimestamp();
  if (!photosOnly) {

  for (const s of students) {
    w.set(db.doc(`students/${s.id}`), {
      name: s.name, grade: s.grade, officialId: s.officialId, active: s.active, sectionIds: [],
      guardianNames: s.guardianNames, parentContactReady: s.parentEmails.length > 0, studentEmailReady: !!s.studentEmail,
      baseCounts: s.baseCounts, source: "v88", updatedAt: now,
    }, { merge: true });
    w.set(db.doc(`studentContacts/${s.id}`), { parentEmails: s.parentEmails, guardians: s.guardians, studentEmail: s.studentEmail, updatedAt: now });
    w.set(db.doc(`studentLegacy/${s.id}`), { driveDocs: s.driveDocs.map(({ title, url }: any) => ({ title, url })), updatedAt: now });
  }
  for (const s of staff) {
    const { email, ...rest } = s;
    w.set(db.doc(`staff/${email}`), { ...rest, active: true, source: "v88", updatedAt: now }, { merge: true });
  }
  for (const l of legacyLogs) {
    const { id, createdAt, ...rest } = l;
    w.set(db.doc(`logs/${id}`), { ...rest, message: "", createdAt: Timestamp.fromDate(createdAt), voided: false, legacy: true });
  }
  w.set(db.doc("config/baseline"), { totals: baseTotals, source: "v88", importedAt: now });
  if (officeCc) w.set(db.doc("config/app"), { secondaryOffice: officeCc }, { merge: true });

  // Registros feitos antes desta versão não têm o campo "legacy": marca como da plataforma.
  const existing = await db.collection("logs").get();
  const live: Record<string, Record<Cat, number>> = {};
  const liveTotals: Record<Cat, number> = { good: 0, behavior: 0, academic: 0 };
  existing.forEach((d) => {
    if (d.get("legacy") === undefined) w.update(d.ref, { legacy: false });
    if (d.get("legacy") === true || d.get("voided") === true || !CATS.includes(d.get("category"))) return;
    const sid = d.get("studentId"); const c = d.get("category") as Cat;
    live[sid] ??= { good: 0, behavior: 0, academic: 0 };
    live[sid][c]++; liveTotals[c]++;
  });
  for (const s of students) {
    const l = live[s.id] ?? { good: 0, behavior: 0, academic: 0 };
    w.set(db.doc(`studentCounts/${s.id}`), Object.fromEntries([...CATS.map((c) => [c, s.baseCounts[c] + l[c]]), ["updatedAt", now]]));
  }
  w.set(db.doc("stats/school"), { totals: Object.fromEntries(CATS.map((c) => [c, baseTotals[c] + liveTotals[c]])), updatedAt: now }, { merge: true });

  }
  await w.close();

  if (photos.length) {
    const bucket = getStorage().bucket();
    let done = 0;
    for (const p of photos) {
      const bytes = readFileSync(p.file);
      if (bytes.length > 250 * 1024 || bytes[0] !== 0xff || bytes[1] !== 0xd8) { console.warn(`Foto ignorada (formato/tamanho): ${p.id}`); continue; }
      await bucket.file(`student-photos/${p.id}`).save(bytes, { contentType: "image/jpeg", resumable: false, metadata: { cacheControl: "private, max-age=0" } });
      await db.doc(`students/${p.id}`).set({ hasPhoto: true, photoVersion: Date.now() }, { merge: true });
      if (++done % 25 === 0) console.log(`  ${done}/${photos.length} fotos enviadas`);
    }
    console.log(`Fotos enviadas: ${done}`);
  }
  console.log("\nImportação concluída.");
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });