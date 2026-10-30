import { describe, it, expect } from "vitest";
import { canViewHistory, canViewCounts, canWriteLogs } from "../src/access";
import { buildDraft } from "../src/gmail";
import type { StaffRecord } from "../src/auth";

const base = { active: true } as const;
const s = (grade: number, sectionIds: string[] = []) => ({ grade, sectionIds });

describe("canViewHistory", () => {
  it("admin vê tudo", () => expect(canViewHistory({ ...base, role: "admin" }, s(9))).toBe(true));
  it("psicóloga vê só os anos dela", () => {
    const p: StaffRecord = { ...base, role: "psychologist", grades: [6, 7, 8] };
    expect(canViewHistory(p, s(7))).toBe(true);
    expect(canViewHistory(p, s(10))).toBe(false);
  });
  it("professor: historyGrades, ano inteiro ou turma", () => {
    const t: StaffRecord = { ...base, role: "teacher", grades: [7, 8], classes: ["7c"], historyGrades: [12], wholeGradeAccess: [8] };
    expect(canViewHistory(t, s(12))).toBe(true);       // historyGrades
    expect(canViewHistory(t, s(8))).toBe(true);        // ano inteiro
    expect(canViewHistory(t, s(7, ["7C"]))).toBe(true); // turma (sem diferenciar maiúsculas)
    expect(canViewHistory(t, s(7, ["7D"]))).toBe(false);
    expect(canViewHistory(t, s(7))).toBe(false);
    expect(canViewHistory(t, s(9))).toBe(false);
  });
  it("substituto e office não veem histórico", () => {
    expect(canViewHistory({ ...base, role: "substitute", grades: [7], historyGrades: [7] }, s(7))).toBe(false);
    expect(canViewHistory({ ...base, role: "office" }, s(7))).toBe(false);
  });
});

describe("canViewCounts / canWriteLogs", () => {
  it("professor comum não vê contagens; Learning Support e psicóloga veem onde têm histórico", () => {
    expect(canViewCounts({ ...base, role: "teacher", historyGrades: [7] }, s(7))).toBe(false);
    expect(canViewCounts({ ...base, role: "teacher", historyGrades: [7], canSeeCounts: true }, s(7))).toBe(true);
    expect(canViewCounts({ ...base, role: "teacher", historyGrades: [7], canSeeCounts: true }, s(9))).toBe(false);
    expect(canViewCounts({ ...base, role: "psychologist", grades: [9] }, s(9))).toBe(true);
  });
  it("office é somente leitura", () => {
    expect(canWriteLogs({ ...base, role: "office" })).toBe(false);
    expect(canWriteLogs({ ...base, role: "substitute" })).toBe(true);
  });
});

describe("buildDraft", () => {
  it("põe pais em Para, Secondary Office e aluno em Cc, sem duplicar", () => {
    const d = buildDraft({ mode: "inbox", lang: "pt", category: "good", studentName: "Ana", grade: 6, message: "Oi",
      parentEmails: ["Pai@x.com", "pai@x.com", "invalido"], studentEmail: "ana@ear.com.br",
      secondaryOffice: "office@ear.com.br", bcc: ["office@ear.com.br", "c@x.com"], authUser: "prof@ear.com.br" });
    expect(d.to).toEqual(["pai@x.com"]);
    expect(d.cc).toEqual(["office@ear.com.br", "ana@ear.com.br"]);
    expect(d.bcc).toEqual(["c@x.com"]);
    expect(d.url).toContain("extsrc=mailto");
    expect(decodeURIComponent(new URL(d.url!).searchParams.get("url")!)).toContain("subject=Registro Positivo");
  });
  it("modo compose mantém a tela cheia antiga", () => {
    const d = buildDraft({ mode: "compose", lang: "pt", category: "good", studentName: "Ana", grade: 6, message: "Oi", parentEmails: ["p@x.com"], bcc: [], authUser: "" });
    expect(d.url).toContain("view=cm");
    expect(d.url).toContain("tf=1");
  });
  it("recusa mensagem longa demais para o Gmail", () => {
    const d = buildDraft({ lang: "en", category: "good", studentName: "A", grade: 6, message: "x".repeat(8000), parentEmails: [], bcc: [], authUser: "" });
    expect(d.url).toBeNull();
  });
});

import { validateStudentInput, decodePhoto } from "../src/students";

describe("validateStudentInput", () => {
  it("normaliza nome, turmas e responsáveis", () => {
    const v = validateStudentInput({ name: "  Ana   Lima ", grade: "7", sectionIds: ["7c", "7C"], guardians: [{ name: "Mãe", email: "MAE@x.com" }, { name: "", email: "" }] });
    expect(v.name).toBe("Ana Lima");
    expect(v.grade).toBe(7);
    expect(v.sectionIds).toEqual(["7C"]);
    expect(v.guardians).toEqual([{ name: "Mãe", email: "mae@x.com" }]);
  });
  it("recusa dados inválidos", () => {
    expect(() => validateStudentInput({ name: "A", grade: 7 })).toThrow();
    expect(() => validateStudentInput({ name: "Ana", grade: 13 })).toThrow();
    expect(() => validateStudentInput({ name: "Ana", grade: 7, guardians: [{ name: "X", email: "ruim" }] })).toThrow();
    expect(() => validateStudentInput({ name: "Ana", grade: 7, id: "../x" })).toThrow();
  });
});

describe("decodePhoto", () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]).toString("base64");
  it("aceita JPEG válido e recusa tipo errado ou arquivo falso", () => {
    expect(decodePhoto(jpeg, "image/jpeg").length).toBe(12);
    expect(() => decodePhoto(jpeg, "image/gif")).toThrow();
    expect(() => decodePhoto(Buffer.from("not an image!").toString("base64"), "image/jpeg")).toThrow();
  });
  it("recusa acima de 250 KB", () => {
    const big = Buffer.alloc(251 * 1024, 0xff); big[1] = 0xd8;
    expect(() => decodePhoto(big.toString("base64"), "image/jpeg")).toThrow();
  });
});