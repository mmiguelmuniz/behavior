/**
 * Importa alunos, turmas e equipe para o Firestore a partir de 3 CSVs exportados do sistema da escola.
 * Rodar só em máquina da TI. Os CSVs reais nunca vão para o Git.
 *
 *   Emulador:  FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GCLOUD_PROJECT=demo-ear-hub \
 *              npm run import-roster -- --students s.csv --sections t.csv --staff e.csv
 *   Produção:  gcloud auth application-default login
 *              GCLOUD_PROJECT=SEU-PROJECT-ID npm run import-roster -- ... --confirm
 *
 * Use --dry-run para só validar. Alunos ausentes do arquivo são marcados como inativos.
 */
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { readCsv, splitList, validEmail } from "./csv";

const args = process.argv.slice(2);
const arg = (name: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const flag = (name: string) => args.includes(`--${name}`);

const DOMAIN = "@ear.com.br";
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

async function main() {
  const [studentsPath, sectionsPath, staffPath] = [arg("students"), arg("sections"), arg("staff")];
  if (!studentsPath || !sectionsPath || !staffPath) throw new Error("Informe --students, --sections e --staff");
  const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
  if (!emulator && !flag("confirm") && !flag("dry-run")) throw new Error("Produção exige --confirm (ou use --dry-run)");

  const problems: string[] = [];
  const staff = readCsv(staffPath).map((r, i) => {
    const email = r.email?.toLowerCase();
    if (!email?.endsWith(DOMAIN) || !validEmail(email)) problems.push(`staff linha ${i + 2}: e-mail inválido`);
    if (!["admin", "teacher"].includes(r.role)) problems.push(`staff linha ${i + 2}: role deve ser admin ou teacher`);
    return { email, name: r.name, role: r.role, sectionIds: [] as string[] };
  });
  const staffByEmail = new Map(staff.map((s) => [s.email, s]));

  const sections = readCsv(sectionsPath).map((r, i) => {
    if (!ID_RE.test(r.section_id)) problems.push(`sections linha ${i + 2}: section_id inválido`);
    const teachers = splitList(r.teacher_emails ?? "").map((e) => e.toLowerCase());
    for (const t of teachers) {
      const s = staffByEmail.get(t);
      if (!s) problems.push(`sections linha ${i + 2}: professor ${t} não está no staff.csv`);
      else s.sectionIds.push(r.section_id);
    }
    return { id: r.section_id, name: r.name, grade: Number(r.grade) || null, teacherEmails: teachers };
  });
  const sectionIds = new Set(sections.map((s) => s.id));

  const seenIds = new Set<string>();
  const students = readCsv(studentsPath).map((r, i) => {
    const line = `students linha ${i + 2}`;
    if (!ID_RE.test(r.student_id)) problems.push(`${line}: student_id inválido`);
    if (seenIds.has(r.student_id)) problems.push(`${line}: student_id duplicado`);
    seenIds.add(r.student_id);
    const grade = Number(r.grade);
    if (!r.name) problems.push(`${line}: sem nome`);
    if (!Number.isInteger(grade) || grade < 1 || grade > 12) problems.push(`${line}: ano inválido`);
    const parentEmails = splitList(r.parent_emails ?? "").map((e) => e.toLowerCase());
    const badEmails = parentEmails.filter((e) => !validEmail(e));
    if (badEmails.length) problems.push(`${line}: ${badEmails.length} e-mail(s) de responsável inválido(s)`);
    const secs = splitList(r.section_ids ?? "");
    for (const s of secs) if (!sectionIds.has(s)) problems.push(`${line}: turma ${s} não existe em sections.csv`);
    const studentEmail = r.student_email?.toLowerCase() || null;
    return { id: r.student_id, name: r.name, grade, parentEmails: parentEmails.filter(validEmail), studentEmail: studentEmail && validEmail(studentEmail) ? studentEmail : null, sectionIds: secs };
  });

  console.log(`Lidos: ${students.length} alunos, ${sections.length} turmas, ${staff.length} pessoas.`);
  if (problems.length) {
    console.error(`${problems.length} problema(s):\n` + problems.slice(0, 50).join("\n"));
    process.exitCode = 1;
    return;
  }
  if (flag("dry-run")) { console.log("Dry-run OK. Nada foi gravado."); return; }

  initializeApp({ projectId: process.env.GCLOUD_PROJECT });
  const db = getFirestore();
  const w = db.bulkWriter();
  const now = FieldValue.serverTimestamp();

  for (const s of staff) w.set(db.doc(`staff/${s.email}`), { name: s.name, role: s.role, classes: s.sectionIds, active: true, updatedAt: now }, { merge: true });
  for (const s of sections) w.set(db.doc(`sections/${s.id}`), { name: s.name, grade: s.grade, teacherEmails: s.teacherEmails, updatedAt: now });
  for (const s of students) {
    w.set(db.doc(`students/${s.id}`), { name: s.name, grade: s.grade, sectionIds: s.sectionIds, active: true, parentContactReady: s.parentEmails.length > 0, studentEmailReady: !!s.studentEmail, updatedAt: now }, { merge: true });
    w.set(db.doc(`studentContacts/${s.id}`), { parentEmails: s.parentEmails, studentEmail: s.studentEmail, updatedAt: now });
  }
  // Quem saiu da escola deixa de aparecer.
  const existingStudents = await db.collection("students").where("active", "==", true).select().get();
  let deactivated = 0;
  existingStudents.forEach((d) => { if (!seenIds.has(d.id)) { deactivated++; w.update(d.ref, { active: false, updatedAt: now }); } });
  const existingStaff = await db.collection("staff").where("active", "==", true).select().get();
  existingStaff.forEach((d) => { if (!staffByEmail.has(d.id)) w.update(d.ref, { active: false, updatedAt: now }); });

  await w.close();
  console.log(`Importação concluída. ${deactivated} aluno(s) marcados como inativos.`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
