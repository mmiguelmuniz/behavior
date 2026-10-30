import { describe, it, expect } from "vitest";
import { validateLogInput } from "../src/logs";

const ok = { studentId: "S0001", category: "behavior", message: "  Texto  ", bcc: ["Pai@Example.com", "pai@example.com"], lang: "pt" };

describe("validateLogInput", () => {
  it("normaliza e aceita entrada válida", () => {
    const v = validateLogInput(ok);
    expect(v.message).toBe("Texto");
    expect(v.bcc).toEqual(["pai@example.com"]);
    expect(v.lang).toBe("pt");
  });
  it("recusa categoria, aluno, mensagem e e-mails inválidos", () => {
    expect(() => validateLogInput({ ...ok, category: "x" })).toThrow();
    expect(() => validateLogInput({ ...ok, studentId: "../etc" })).toThrow();
    expect(() => validateLogInput({ ...ok, message: "   " })).toThrow();
    expect(() => validateLogInput({ ...ok, message: "a".repeat(5001) })).toThrow();
    expect(() => validateLogInput({ ...ok, bcc: ["não-é-email"] })).toThrow();
    expect(() => validateLogInput({ ...ok, bcc: Array(11).fill("a@b.com") })).toThrow();
  });
});