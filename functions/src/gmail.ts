import { Category } from "./config";

export const LABELS: Record<"en" | "pt", Record<Category, string> & { student: string; grade: string }> = {
  en: { good: "Good Behavior Log", behavior: "Behavior Log", academic: "Academic Concern", student: "Student", grade: "Grade" },
  pt: { good: "Registro Positivo", behavior: "Registro de Comportamento", academic: "Preocupação Acadêmica", student: "Aluno(a)", grade: "Ano" },
};
export const GMAIL_URL_LIMIT = 7000;
const EMAIL_RE = /^[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;
export const validEmail = (v: unknown): v is string => typeof v === "string" && v.length <= 254 && EMAIL_RE.test(v);

/**
 * "compose" (padrão): abre a tela de escrever avulsa; o Gmail costuma fechar a aba após o envio.
 * "inbox": abre pelo tratamento de links mailto do Gmail.
 */
export type GmailMode = "inbox" | "compose";

export interface DraftParts {
  mode?: GmailMode;
  lang: "en" | "pt"; category: Category; studentName: string; grade: number; message: string;
  parentEmails: string[]; studentEmail?: string | null; secondaryOffice?: string | null; bcc: string[]; authUser: string;
}

/** Monta o rascunho no servidor: os e-mails dos responsáveis nunca vão para o navegador do professor. */
export function buildDraft(p: DraftParts) {
  const L = LABELS[p.lang];
  const norm = (list: Array<string | null | undefined>) =>
    [...new Set(list.map((e) => String(e ?? "").trim().toLowerCase()).filter(validEmail))];
  const to = norm(p.parentEmails);
  const cc = norm([p.secondaryOffice, p.studentEmail]).filter((e) => !to.includes(e));
  const bcc = norm(p.bcc).filter((e) => !to.includes(e) && !cc.includes(e));
  const subject = `${L[p.category]} — ${p.studentName}`;
  const body = `${L.student}: ${p.studentName}\n${L.grade}: ${p.grade}\n\n${p.message}`;
  let url: string;
  if (p.mode === "compose") {
    // tf=1: janela de escrever avulsa, que o Gmail costuma fechar sozinho depois de enviar.
    const params = new URLSearchParams({ view: "cm", fs: "1", tf: "1", to: to.join(","), su: subject, body });
    if (cc.length) params.set("cc", cc.join(","));
    if (bcc.length) params.set("bcc", bcc.join(","));
    if (validEmail(p.authUser)) params.set("authuser", p.authUser);
    url = "https://mail.google.com/mail/?" + params.toString();
  } else {
    // Endereços já validados: só escapamos % e + (o @ fica legível, como num mailto comum).
    const addr = (list: string[]) => list.map((e) => e.replace(/%/g, "%25").replace(/\+/g, "%2B")).join(",");
    const q = [
      cc.length ? `cc=${addr(cc)}` : "",
      bcc.length ? `bcc=${addr(bcc)}` : "",
      `subject=${encodeURIComponent(subject)}`,
      `body=${encodeURIComponent(body)}`,
    ].filter(Boolean).join("&");
    const mailto = `mailto:${addr(to)}?${q}`;
    const params = new URLSearchParams();
    if (validEmail(p.authUser)) params.set("authuser", p.authUser);
    params.set("extsrc", "mailto");
    params.set("url", mailto);
    url = "https://mail.google.com/mail/?" + params.toString();
  }
  return { url: url.length > GMAIL_URL_LIMIT ? null : url, to, cc, bcc };
}