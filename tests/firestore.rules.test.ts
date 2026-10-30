/**
 * Testes de aceitação de acesso (do documento de handoff), rodando contra o emulador.
 *   npm run test:rules
 */
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, it } from "vitest";
import { assertFails, assertSucceeds, initializeTestEnvironment, RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, getDocs, collection, setDoc } from "firebase/firestore";

let env: RulesTestEnvironment;

const as = (email: string, verified = true) =>
  env.authenticatedContext(email, { email, email_verified: verified }).firestore();

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-ear-hub",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
  });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "staff/admin@ear.com.br"), { role: "admin", active: true, sectionIds: [] });
    await setDoc(doc(db, "staff/prof@ear.com.br"), { role: "teacher", active: true, sectionIds: ["6A"] });
    await setDoc(doc(db, "staff/ex@ear.com.br"), { role: "teacher", active: false, sectionIds: ["6A"] });
    await setDoc(doc(db, "config/app"), { secondaryOffice: "x@ear.com.br" });
    for (const [id, sec] of [["IN", "6A"], ["OUT", "8A"]]) {
      await setDoc(doc(db, `students/${id}`), { name: id, grade: 6, active: true, sectionIds: [sec] });
      await setDoc(doc(db, `studentContacts/${id}`), { parentEmails: ["p@example.com"] });
      await setDoc(doc(db, `studentCounts/${id}`), { good: 1, behavior: 0, academic: 0 });
      await setDoc(doc(db, `logs/L${id}`), { studentId: id, category: "good", message: "x", sectionIds: [sec], authorEmail: "prof@ear.com.br", voided: false });
    }
    await setDoc(doc(db, "stats/school"), { totals: { good: 2, behavior: 0, academic: 0 } });
  });
});
afterAll(async () => { await env?.cleanup(); });

describe("ADMIN", () => {
  it("vê totais, contagens e todos os registros", async () => {
    const db = as("admin@ear.com.br");
    await assertSucceeds(getDoc(doc(db, "stats/school")));
    await assertSucceeds(getDocs(collection(db, "studentCounts")));
    await assertSucceeds(getDocs(collection(db, "logs")));
  });
});

describe("TEACHER", () => {
  it("busca qualquer aluno e lê contatos para o rascunho", async () => {
    const db = as("prof@ear.com.br");
    await assertSucceeds(getDocs(collection(db, "students")));
    await assertSucceeds(getDoc(doc(db, "studentContacts/OUT")));
  });
  it("não vê contagens de nenhum aluno, nem da própria turma, nem totais", async () => {
    const db = as("prof@ear.com.br");
    await assertFails(getDoc(doc(db, "studentCounts/IN")));
    await assertFails(getDoc(doc(db, "studentCounts/OUT")));
    await assertFails(getDocs(collection(db, "studentCounts")));
    await assertFails(getDoc(doc(db, "stats/school")));
  });
  it("não lê registros direto do banco (só pela function, que confere as turmas)", async () => {
    const db = as("prof@ear.com.br");
    await assertFails(getDoc(doc(db, "logs/LIN")));
    await assertFails(getDocs(collection(db, "logs")));
  });
  it("não lê cadastro de outros", async () => {
    await assertFails(getDoc(doc(as("prof@ear.com.br"), "staff/admin@ear.com.br")));
  });
});

describe("Sem autorização", () => {
  it("anônimo não recebe nada", async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDocs(collection(db, "students")));
  });
  it("conta de fora do domínio não recebe nada", async () => {
    await assertFails(getDocs(collection(as("alguem@gmail.com"), "students")));
  });
  it("conta @ear.com.br fora do cadastro não recebe nada", async () => {
    await assertFails(getDocs(collection(as("novo@ear.com.br"), "students")));
  });
  it("cadastro inativo não recebe nada", async () => {
    await assertFails(getDocs(collection(as("ex@ear.com.br"), "students")));
  });
  it("e-mail não verificado não recebe nada", async () => {
    await assertFails(getDocs(collection(as("prof@ear.com.br", false), "students")));
  });
});

describe("Escrita", () => {
  it("nenhum cliente escreve, nem o ADMIN", async () => {
    await assertFails(setDoc(doc(as("admin@ear.com.br"), "studentCounts/IN"), { good: 99 }));
    await assertFails(setDoc(doc(as("prof@ear.com.br"), "staff/prof@ear.com.br"), { role: "admin" }));
    await assertFails(setDoc(doc(as("prof@ear.com.br"), "logs/novo"), { studentId: "IN", category: "good", message: "x" }));
  });
});
