import { describe, it, expect } from "vitest";
import { validateStaffInput } from "../src/staff";
import { aggregate, weekStart } from "../src/reports";

describe("validateStaffInput", () => {
  it("normaliza e aceita professor com anos e turmas", () => {
    const v = validateStaffInput({ email: " Ana.Lima@EAR.com.br ", name: "Ana  Lima", role: "teacher", grades: [8, "7", 7, 15], classes: ["7c"], historyGrades: [12] });
    expect(v.email).toBe("ana.lima@ear.com.br");
    expect(v.name).toBe("Ana Lima");
    expect(v.grades).toEqual([7, 8]);
    expect(v.classes).toEqual(["7C"]);
    expect(v.active).toBe(true);
  });
  it("recusa e-mail de fora, papel inválido e turma inválida", () => {
    expect(() => validateStaffInput({ email: "x@gmail.com", name: "Xx", role: "teacher" })).toThrow();
    expect(() => validateStaffInput({ email: "x@ear.com.br", name: "Xx", role: "diretor" })).toThrow();
    expect(() => validateStaffInput({ email: "x@ear.com.br", name: "Xx", role: "teacher", classes: ["7 C!"] })).toThrow();
  });
});

describe("aggregate", () => {
  const students = [{ id: "a", name: "Ana", grade: 6 }, { id: "b", name: "Bia", grade: 7 }];
  const d = (s: string) => new Date(s);
  it("soma por categoria, ano, semana e aluno; ignora fora do escopo", () => {
    const r = aggregate([
      { studentId: "a", category: "behavior", createdAt: d("2026-10-05T15:00:00Z"), authorName: "P1", legacy: false },
      { studentId: "a", category: "good", createdAt: d("2026-10-07T15:00:00Z"), authorName: "P1", legacy: false },
      { studentId: "b", category: "other", createdAt: d("2026-10-13T15:00:00Z"), authorName: "P2", legacy: true },
      { studentId: "z", category: "good", createdAt: d("2026-10-13T15:00:00Z"), authorName: "P3", legacy: false },
    ], students);
    expect(r.totals).toEqual({ good: 1, behavior: 1, academic: 0, other: 1 });
    expect(r.byGrade.map((g) => g.grade)).toEqual([6, 7]);
    expect(r.byWeek.map((w) => w.week)).toEqual(["2026-10-05", "2026-10-12"]);
    expect(r.students[0].id).toBe("a");
    expect(r.authors[0]).toEqual({ name: "P1", count: 2 });
  });
  it("semana começa na segunda, no horário de Recife", () => {
    expect(weekStart(d("2026-10-12T01:00:00Z"))).toBe("2026-10-05"); // domingo 22h em Recife
    expect(weekStart(d("2026-10-12T04:00:00Z"))).toBe("2026-10-12"); // segunda 1h em Recife
  });
});

import { validateFeedback } from "../src/feedback";

describe("validateFeedback", () => {
  it("aceita feedback válido e recusa tipo, vazio ou longo demais", () => {
    expect(validateFeedback({ type: "problem", message: "  Botão não abre  ", page: "students" }).message).toBe("Botão não abre");
    expect(() => validateFeedback({ type: "outro", message: "abc" })).toThrow();
    expect(() => validateFeedback({ type: "problem", message: " " })).toThrow();
    expect(() => validateFeedback({ type: "problem", message: "x".repeat(1201) })).toThrow();
  });
});

import { canDeleteLog } from "../src/logs";

describe("canDeleteLog", () => {
  const teacher = { role: "teacher", active: true } as const;
  const admin = { role: "admin", active: true } as const;
  it("só apaga registro cancelado e não importado", () => {
    expect(canDeleteLog(teacher, true, false, true)).toBe(true);
    expect(canDeleteLog(teacher, true, false, false)).toBe(false);
    expect(canDeleteLog(teacher, false, false, true)).toBe(false);
    expect(canDeleteLog(admin, false, false, true)).toBe(true);
    expect(canDeleteLog(admin, false, true, true)).toBe(false);
  });
});