/**
 * Popula o EMULADOR com dados 100% fictícios. Recusa rodar contra a nuvem.
 *   npm run emulators   (em um terminal)
 *   npm run seed        (em outro)
 * Contas de teste (entre pelo popup do emulador com "Add new account"):
 *   admin@ear.com.br       ADMIN
 *   prof.ana@ear.com.br    professora com histórico do 6º e 7º ano
 *   prof.bruno@ear.com.br  professor do 8º ano, só da turma 8A (alunos 8A aparecem; outros não)
 *   psi.ms@ear.com.br      psicóloga do Middle School (6º–8º), vê contagens
 *   sub@ear.com.br         substituto: registra, sem histórico
 *   office@ear.com.br      office: somente leitura
 */
import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
initializeApp({ projectId: "demo-ear-hub" });
const db = getFirestore();

const FIRST = ["Alice", "Bento", "Clara", "Davi", "Elisa", "Felipe", "Gabi", "Heitor", "Iris", "João", "Lara", "Miguel", "Nina", "Otávio", "Paula", "Rafa", "Sofia", "Tomás", "Valentina", "Yuri"];
const LAST = ["Fictício", "Exemplo", "Modelo", "Teste", "Demo"];
const GRADES = [6, 7, 8, 9, 10, 11, 12];
type Cat = "good" | "behavior" | "academic";

async function main() {
  const w = db.bulkWriter();
  const now = Timestamp.now();
  const staff = (email: string, data: Record<string, unknown>) =>
    w.set(db.doc(`staff/${email}`), { grades: [], classes: [], historyGrades: [], wholeGradeAccess: [], canSeeCounts: false, division: "", active: true, ...data });

  w.set(db.doc("config/app"), { secondaryOffice: "secondary.office@ear.com.br" });
  staff("admin@ear.com.br", { name: "Admin Teste", role: "admin" });
  staff("prof.ana@ear.com.br", { name: "Ana (teste)", role: "teacher", grades: [6, 7], historyGrades: [6, 7] });
  staff("prof.bruno@ear.com.br", { name: "Bruno (teste)", role: "teacher", grades: [8], classes: ["8A"] });
  staff("psi.ms@ear.com.br", { name: "Psicóloga MS (teste)", role: "psychologist", grades: [6, 7, 8], division: "Middle School" });
  staff("sub@ear.com.br", { name: "Substituto (teste)", role: "substitute", grades: [9, 10] });
  staff("office@ear.com.br", { name: "Office (teste)", role: "office" });

  const baseTotals = { good: 0, behavior: 0, academic: 0 };
  let n = 0;
  for (const grade of GRADES) {
    for (let i = 0; i < 6; i++) {
      n++;
      const id = `g${grade}-${i + 1}`;
      const name = `${FIRST[(n * 7) % FIRST.length]} ${LAST[n % LAST.length]}`;
      const section = `${grade}${i < 3 ? "A" : "B"}`;
      const base = { good: n % 3, behavior: n % 4 === 0 ? 2 : n % 5 === 0 ? 1 : 0, academic: n % 9 === 0 ? 1 : 0 };
      (Object.keys(base) as Cat[]).forEach((c) => (baseTotals[c] += base[c]));
      const hasParent = n % 6 !== 0;
      w.set(db.doc(`students/${id}`), {
        name, grade, active: true, sectionIds: [section], officialId: String(10000 + n),
        guardianNames: hasParent ? [`Responsável ${n} (fictício)`] : [], parentContactReady: hasParent, studentEmailReady: n % 2 === 0,
        baseCounts: base,
      });
      w.set(db.doc(`studentContacts/${id}`), {
        parentEmails: hasParent ? [`responsavel.${id}@example.com`] : [],
        studentEmail: n % 2 === 0 ? `aluno.${id}@example.com` : null,
      });
      w.set(db.doc(`studentCounts/${id}`), { ...base, updatedAt: now });
      w.set(db.doc(`studentLegacy/${id}`), {
        driveDocs: base.behavior ? [{ title: `Registros ${name} (fictício)`, url: `https://docs.google.com/document/d/FICTICIO-${id}/edit` }] : [],
      });
      if (base.behavior) {
        w.set(db.doc(`logs/legacy-${id}`), {
          studentId: id, grade, category: "behavior", message: "", authorName: "Professor antigo (fictício)",
          createdAt: Timestamp.fromMillis(now.toMillis() - n * 86_400_000 * 3), voided: false, legacy: true,
          sourceUrl: `https://docs.google.com/document/d/FICTICIO-${id}/edit`,
        });
      }
    }
  }
  w.set(db.doc("config/baseline"), { totals: baseTotals, source: "seed" });
  w.set(db.doc("stats/school"), { totals: baseTotals, updatedAt: now });
  await w.close();
  console.log(`Emulador populado: ${n} alunos fictícios e 6 contas de teste.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
