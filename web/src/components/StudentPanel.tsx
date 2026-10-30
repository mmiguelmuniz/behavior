import { CSSProperties, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Mail, Copy, Lock, History, AlertTriangle, Wand2, UserRound, AtSign, Ban, ExternalLink, Users, Eye, Trash2, Search } from "lucide-react";
import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../firebase";
import { useT } from "../i18n";
import type { Role } from "../auth";
import { CATEGORIES, Category, Counts, DriveDoc, LogEntry, Student } from "../lib/types";
import { clean, normalize, parseEmailList } from "../lib/text";
import { sensitiveKinds } from "../lib/sensitive";
import templates from "../lib/templates.json";
import { AnimatedNumber, Skeleton, useToast } from "./ui";
import { StudentPhoto } from "./StudentPhoto";
import { CategoryIcon } from "./icons";
import { openDraftTab } from "../lib/draftTab";
import { SendConfirm } from "./SendConfirm";
import { usePreview } from "../lib/preview";
import { clearDraft, loadDraft, saveDraft } from "../lib/drafts";
import { useAuth } from "../auth";

type HistoryState =
  | { status: "loading" } | { status: "denied" }
  | { status: "ok"; logs: LogEntry[]; driveDocs: DriveDoc[]; counts: Counts | null };
type Template = { id: string; category: Category; title: string; text: string };

const createLogFn = httpsCallable<object, { id: string; gmailUrl: string }>(functions, "createlog");
const listLogsFn = httpsCallable<{ studentId: string; previewAs?: string }, { logs: LogEntry[]; driveDocs: DriveDoc[]; counts: Counts | null }>(functions, "liststudentlogs");
export const voidLogFn = httpsCallable<{ logId: string }, { ok: boolean }>(functions, "voidlog");
export const deleteLogFn = httpsCallable<{ logId: string }, { ok: boolean }>(functions, "deletelog");

const canWrite = (role: Role) => role !== "office";

const accentVar = (c: Category | null): CSSProperties =>
  ({ ["--accent" as string]: c ? `var(--${c})` : "var(--brand)", ["--accent-soft" as string]: c ? `var(--${c}-soft)` : "var(--brand-soft)" });

export function StudentPanel({ student, role }: { student: Student; role: Role }) {
  const { t, lang } = useT();
  const toast = useToast();
  const { person: preview } = usePreview();
  const { state } = useAuth();
  const me = state.status === "ready" ? state.staff.email : "";
  const writable = canWrite(role) && !preview;
  const draftScope = `student:${student.id}`;

  const [adminCounts, setAdminCounts] = useState<Counts | null>(null);
  const [history, setHistory] = useState<HistoryState>({ status: "loading" });
  const [category, setCategory] = useState<Category | null>(null);
  const [message, setMessage] = useState("");
  const [bcc, setBcc] = useState("");
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);
  const [pendingSend, setPendingSend] = useState<Window | null>(null);
  const [askSent, setAskSent] = useState(false);
  const [hCat, setHCat] = useState<string>("all");
  const [hQuery, setHQuery] = useState("");
  const [hMine, setHMine] = useState(false);
  const [restored, setRestored] = useState(false);

  // Rascunho automático: recupera ao abrir o aluno…
  useEffect(() => {
    if (!writable || !me) return;
    const d = loadDraft(me, draftScope);
    if (d) {
      setCategory((CATEGORIES as string[]).includes(d.category ?? "") ? (d.category as Category) : null);
      setMessage(d.message); setBcc(d.bcc); setDraftSavedAt(d.savedAt); setRestored(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student.id, me]);
  // …e salva enquanto a pessoa escreve.
  useEffect(() => {
    if (!writable || !me) return;
    const id = window.setTimeout(() => {
      const saved = saveDraft(me, draftScope, { category, message, bcc });
      setDraftSavedAt(saved ? saved.savedAt : null);
    }, 700);
    return () => window.clearTimeout(id);
  }, [category, message, bcc, writable, me, draftScope]);

  function discardDraft() {
    clearDraft(me, draftScope);
    setMessage(""); setBcc(""); setCategory(null); setDraftSavedAt(null); setRestored(false);
  }

  useEffect(() => {
    void loadHistory();
    if (role === "admin") {
      getDoc(doc(db, "studentCounts", student.id))
        .then((s) => setAdminCounts(s.exists() ? { good: s.get("good") ?? 0, behavior: s.get("behavior") ?? 0, academic: s.get("academic") ?? 0 } : null))
        .catch(() => setAdminCounts(null));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student.id, role, preview?.email]);

  // O servidor decide quem vê o histórico (por papel, ano e turma).
  async function loadHistory() {
    try {
      const r = (await listLogsFn({ studentId: student.id, ...(preview ? { previewAs: preview.email } : {}) })).data;
      setHistory({ status: "ok", logs: r.logs, driveDocs: r.driveDocs, counts: r.counts });
    } catch { setHistory({ status: "denied" }); }
  }

  // Em "ver como professor", o ADMIN não vê contagens (simulação de interface).
  const counts = role === "admin" && !preview ? adminCounts : history.status === "ok" ? history.counts : null;
  const kinds = sensitiveKinds(message);
  const ready = !!category && clean(message) !== "";
  const step = !category ? 1 : !clean(message) ? 2 : 3;
  const visibleTemplates = useMemo(
    () => (templates[lang] as Template[]).filter((tp) => !category || tp.category === category),
    [lang, category]
  );

  async function saveAndOpen() {
    if (!category || saving) return;
    // Abre a aba já no clique (senão o navegador bloqueia) e mostra a tela de espera.
    const tab = openDraftTab({ title: t.draftTabTitle, subtitle: t.draftTabSubtitle, steps: t.draftTabSteps, error: t.saveFailed });
    setSaving(true);
    try {
      const r = (await createLogFn({ studentId: student.id, category, message: clean(message), bcc: parseEmailList(bcc), lang })).data;
      if (tab) { tab.go(r.gmailUrl); setPendingSend(tab.window); }
      else window.open(r.gmailUrl, "_blank", "noopener,noreferrer");
      toast(tab ? t.savedLog : t.popupBlocked, !!tab);
      clearDraft(me, draftScope);
      setMessage(""); setBcc(""); setDraftSavedAt(null); setRestored(false);
      void loadHistory();
    } catch (e) {
      tab?.fail();
      const msg = String((e as { message?: string }).message ?? "");
      toast(msg.includes("message-too-long") ? t.tooLong : t.saveFailed, false);
    } finally { setSaving(false); }
  }

  async function copy() {
    try { await navigator.clipboard.writeText(clean(message)); toast(t.copied); } catch { toast(t.copyFailed, false); }
  }

  async function voidOne(id: string) {
    if (!window.confirm(t.voidConfirm)) return;
    try { await voidLogFn({ logId: id }); toast(t.voidDone); void loadHistory(); }
    catch { toast(t.voidFailed, false); }
  }

  // O Gmail não avisa o site quando o e-mail é enviado; o professor confirma com "Já enviei".

  async function deleteOne(id: string) {
    if (!window.confirm(t.deleteConfirm)) return;
    try { await deleteLogFn({ logId: id }); toast(t.deleted); void loadHistory(); }
    catch { toast(t.deleteFailed, false); }
  }

  // Filtro do histórico (categoria, texto e "só os meus").
  const allLogs = history.status === "ok" ? history.logs : [];
  const shownLogs = allLogs.filter((l) => (hCat === "all" || l.category === hCat) && (!hMine || l.mine)
    && (!hQuery || normalize(l.message).includes(normalize(hQuery)) || normalize(l.authorName).includes(normalize(hQuery))));
  const presentCats = ["good", "behavior", "academic", "other"].filter((c) => allLogs.some((l) => l.category === c));

  const catLabel = (c: string) => (c in t.categories ? t.categories[c as Category] : t.otherCategory);

  return (
    <article className="student" style={accentVar(category)}>
      <header className="hero glass">
        <div className="hero-glow" aria-hidden="true" />
        <StudentPhoto studentId={student.id} name={student.name} hasPhoto={student.hasPhoto} version={student.photoVersion} size={96} />
        <div className="hero-text">
          <h1>{student.name}</h1>
          <div className="hero-meta">
            <span className="pill">{t.grade(student.grade)}</span>
            <span className={`pill ${student.parentContactReady ? "pill-ok" : "pill-warn"}`}>
              <UserRound size={13} />{student.parentContactReady ? t.parentReady : t.noParents}
            </span>
          </div>
          {student.guardianNames.length > 0 && (
            <p className="guardians"><Users size={14} /><span>{t.guardians}: {student.guardianNames.join(" · ")}</span></p>
          )}
        </div>
        {counts && (
          <div className="hero-counts" aria-label={t.counts}>
            {CATEGORIES.map((c) => (
              <div key={c} className="mini-count" style={{ ["--c" as string]: `var(--${c})` }}>
                <CategoryIcon c={c} size={15} /><b><AnimatedNumber value={counts[c]} /></b><span>{t.categories[c]}</span>
              </div>
            ))}
          </div>
        )}
      </header>

      <div className="student-grid">
        {writable ? (
          <section className="compose glass">
            <div className="compose-head">
              <h2>{t.composeTitle}</h2>
              <ol className="steps" aria-hidden="true">
                {[t.stepCategory, t.stepMessage, t.stepSend].map((label, i) => (
                  <li key={label} className={step > i + 1 ? "done" : step === i + 1 ? "now" : ""}><span>{i + 1}</span>{label}</li>
                ))}
              </ol>
            </div>

            <div className="cat-cards" role="radiogroup" aria-label={t.category}>
              {CATEGORIES.map((c) => (
                <motion.button key={c} role="radio" aria-checked={category === c} className={`cat-card ${c}`} onClick={() => setCategory(c)}
                  whileHover={{ y: -3 }} whileTap={{ scale: 0.98 }} transition={{ type: "spring", stiffness: 400, damping: 25 }}>
                  <span className="cat-icon"><CategoryIcon c={c} /></span>
                  <strong>{t.categories[c]}</strong>
                  <small>{t.catDesc[c]}</small>
                </motion.button>
              ))}
            </div>

            <div className="templates-row">
              <span className="row-label"><Wand2 size={14} />{t.templates}</span>
              <div className="template-scroll">
                {visibleTemplates.map((tp) => (
                  <button key={tp.id} className={`template-chip ${tp.category}`} onClick={() => {
                    setCategory(tp.category);
                    setMessage(tp.text.replaceAll("{{name}}", student.name));
                  }}>{tp.title}</button>
                ))}
              </div>
            </div>

            {restored && draftSavedAt && (
              <p className="callout draft-note">{t.draftRestored(new Date(draftSavedAt).toLocaleTimeString(lang === "pt" ? "pt-BR" : "en-US", { hour: "2-digit", minute: "2-digit" }))}
                <button className="link-btn" onClick={discardDraft}>{t.discardDraft}</button></p>
            )}
            <label className="message">
              <span className="sr-only">{t.message}</span>
              <textarea rows={11} value={message} placeholder={t.messagePlaceholder} onChange={(e) => setMessage(e.target.value)} />
              <span className="char-count">{draftSavedAt && message ? `${t.autosaved} · ` : ""}{t.chars(message.length)}</span>
            </label>

            <AnimatePresence>
              {kinds.length > 0 && (
                <motion.p className="callout warn" role="status" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                  <AlertTriangle size={16} />{t.sensitive(kinds.map((k) => t.sensitiveKinds[k]).join(", "))}
                </motion.p>
              )}
            </AnimatePresence>

            <div className="recipients">
              <div className="rcpt-row"><span className="rcpt-label">{t.to}</span>
                <div className="chips">
                  {student.parentContactReady
                    ? <span className="chip">{student.guardianNames.length ? student.guardianNames.join(", ") : t.parentReady}</span>
                    : <span className="chip chip-warn">{t.noParentEmail}</span>}
                </div>
              </div>
              <div className="rcpt-row"><span className="rcpt-label">{t.cc}</span>
                <div className="chips">
                  <span className="chip">Secondary Office</span>
                  {student.studentEmailReady && <span className="chip">{t.studentLabel}</span>}
                </div>
              </div>
              <label className="rcpt-row"><span className="rcpt-label">{t.bcc}</span>
                <span className="bcc-input"><AtSign size={14} /><input type="text" value={bcc} onChange={(e) => setBcc(e.target.value)} placeholder={t.bccHint} /></span>
              </label>
              <p className="rcpt-note">{t.recipientNote}</p>
            </div>

            <p className="privacy-note">{t.privacy} {t.savedNote}</p>

            <div className="actions">
              <motion.button className="btn primary shine" disabled={!ready || saving} onClick={() => void saveAndOpen()} whileTap={{ scale: 0.97 }}>
                <Mail size={17} />{saving ? t.preparingDraft : t.saveAndOpen}
              </motion.button>
              <button className="btn" disabled={!clean(message)} onClick={() => void copy()}><Copy size={16} />{t.copy}</button>
            </div>
            <AnimatePresence>
              {pendingSend && !askSent && (
                <motion.div className="callout pending-send" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                  <Mail size={16} /><span>{t.pendingSendText}</span>
                  <button className="btn sent-btn" onClick={() => setAskSent(true)}>{t.confirmSend}</button>
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        ) : (
          <section className="compose glass readonly">
            <Eye size={28} />
            <p>{preview ? t.previewReadOnly(preview.name) : t.officeReadOnly}</p>
          </section>
        )}

        <aside className="drive glass">
          <h2><History size={17} />{t.history}</h2>
          {history.status === "loading" && <Skeleton lines={4} />}
          {history.status === "denied" && <div className="locked"><Lock size={28} /><p>{t.historyDenied}</p></div>}
          {history.status === "ok" && (
            <>
              {history.logs.length > 2 && (
                <div className="h-filters">
                  <div className="h-chips">
                    <button aria-pressed={hCat === "all"} onClick={() => setHCat("all")}>{t.allLabel}</button>
                    {presentCats.map((c) => <button key={c} className={c} aria-pressed={hCat === c} onClick={() => setHCat(c)}><i />{catLabel(c)}</button>)}
                  </div>
                  <div className="search compact"><Search size={14} /><input type="search" value={hQuery} placeholder={t.searchHistory} onChange={(e) => setHQuery(e.target.value)} aria-label={t.searchHistory} /></div>
                  <span className="h-meta">
                    {allLogs.some((l) => l.mine) && <label className="check"><input type="checkbox" checked={hMine} onChange={(e) => setHMine(e.target.checked)} />{t.onlyMine}</label>}
                    <span className="muted small">{t.historyCount(shownLogs.length, allLogs.length)}</span>
                  </span>
                </div>
              )}
              {shownLogs.length === 0 ? <p className="empty-note">{t.historyNone}</p> : (
                <ul className="timeline">
                  {shownLogs.map((l, i) => (
                    <motion.li key={l.id} className={`${l.category} ${l.voided ? "voided" : ""}`} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 10) * 0.04 }}>
                      <span className="dot" />
                      <div className="t-body">
                        <span className="t-title">
                          {catLabel(l.category)}
                          {l.legacy && <span className="tag">{t.legacyTag}</span>}
                          {l.voided && <span className="tag bad">{t.voidedLabel}</span>}
                        </span>
                        <span className="t-meta">{l.createdAt ? new Date(l.createdAt).toLocaleString() : ""}{l.authorName ? ` · ${t.by} ${l.authorName}` : ""}</span>
                        {l.message && <p className={`t-msg ${expanded === l.id ? "open" : ""}`}>{l.message}</p>}
                        <span className="t-actions">
                          {l.message && <button className="link-btn" onClick={() => setExpanded(expanded === l.id ? null : l.id)}>{expanded === l.id ? t.showLess : t.showMore}</button>}
                          {l.sourceUrl && <a className="link-btn" href={l.sourceUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={12} />{t.openDrive}</a>}
                          {l.canVoid && <button className="link-btn danger" onClick={() => void voidOne(l.id)}><Ban size={12} />{t.voidLog}</button>}
                          {l.canDelete && <button className="link-btn danger" onClick={() => void deleteOne(l.id)}><Trash2 size={12} />{t.deleteLog}</button>}
                        </span>
                      </div>
                    </motion.li>
                  ))}
                </ul>
              )}
              {history.driveDocs.length > 0 && (
                <div className="drive-docs">
                  <span className="row-label">{t.driveDocs}</span>
                  {history.driveDocs.map((d) => (
                    <a key={d.url} href={d.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={13} />{d.title}</a>
                  ))}
                </div>
              )}
            </>
          )}
        </aside>
      </div>
      <SendConfirm open={askSent} gmailTab={pendingSend} onDone={() => { setAskSent(false); setPendingSend(null); }} />
    </article>
  );
}