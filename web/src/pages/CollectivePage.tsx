import { CSSProperties, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Search, X, Users, Mail, Check, AlertTriangle, AtSign, Wand2, RotateCcw } from "lucide-react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";
import { useT } from "../i18n";
import { normalize, clean, parseEmailList } from "../lib/text";
import { sensitiveKinds } from "../lib/sensitive";
import { loadActiveStudents } from "../lib/students";
import { CATEGORIES, Category, Student } from "../lib/types";
import templates from "../lib/templates.json";
import { Avatar, Segmented, Skeleton, useToast } from "../components/ui";
import { CategoryIcon } from "../components/icons";
import { StudentPhoto } from "../components/StudentPhoto";
import { useAuth } from "../auth";
import { clearDraft, loadDraft, saveDraft } from "../lib/drafts";

const MIN = 2, MAX = 25;
const GRADES = [6, 7, 8, 9, 10, 11, 12];
type Draft = { studentId: string; name: string; gmailUrl: string; hasParentEmail: boolean };
type Template = { id: string; category: Category; title: string; text: string };

const createCollectiveFn = httpsCallable<object, { collectiveId: string; drafts: Draft[] }>(functions, "createcollectivelogs");

export function CollectivePage() {
  const { t, lang } = useT();
  const toast = useToast();
  const [students, setStudents] = useState<Student[] | null>(null);
  const [query, setQuery] = useState("");
  const [grade, setGrade] = useState<number | "all">("all");
  const [selected, setSelected] = useState<Student[]>([]);
  const [category, setCategory] = useState<Category | null>(null);
  const [message, setMessage] = useState("");
  const [bcc, setBcc] = useState("");
  const [saving, setSaving] = useState(false);
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [opened, setOpened] = useState<Set<string>>(new Set());

  const { state } = useAuth();
  const me = state.status === "ready" ? state.staff.email : "";
  const [draftAt, setDraftAt] = useState<number | null>(null);

  // Rascunho automático do registro coletivo (mensagem, categoria e alunos selecionados).
  useEffect(() => {
    void loadActiveStudents().then((list) => {
      setStudents(list);
      const d = me ? loadDraft(me, "collective") : null;
      if (d) {
        const ids = new Set(d.extra ?? []);
        setSelected(list.filter((s) => ids.has(s.id)).slice(0, MAX));
        setCategory((CATEGORIES as string[]).includes(d.category ?? "") ? (d.category as Category) : null);
        setMessage(d.message); setBcc(d.bcc); setDraftAt(d.savedAt);
      }
    });
  }, [me]);
  useEffect(() => {
    if (!me || students === null || drafts) return;
    const id = window.setTimeout(() => {
      const saved = selected.length || message.trim() || category
        ? saveDraft(me, "collective", { category, message, bcc, extra: selected.map((s) => s.id) }) : (clearDraft(me, "collective"), null);
      setDraftAt(saved ? saved.savedAt : null);
    }, 700);
    return () => window.clearTimeout(id);
  }, [me, students, selected, category, message, bcc, drafts]);

  const selectedIds = new Set(selected.map((s) => s.id));
  const filtered = useMemo(() => {
    const q = normalize(query);
    return (students ?? []).filter((s) => (grade === "all" || s.grade === grade) && (!q || normalize(s.name).includes(q)));
  }, [students, query, grade]);

  const toggle = (s: Student) => setSelected((cur) =>
    cur.some((x) => x.id === s.id) ? cur.filter((x) => x.id !== s.id) : cur.length >= MAX ? (toast(t.collectiveMax(MAX), false), cur) : [...cur, s]);

  const ready = selected.length >= MIN && !!category && !!clean(message);
  const kinds = sensitiveKinds(message);
  const visibleTemplates = (templates[lang] as Template[]).filter((tp) => !category || tp.category === category);
  const noParent = selected.filter((s) => !s.parentContactReady);

  async function save() {
    if (!ready || saving) return;
    setSaving(true);
    try {
      const r = (await createCollectiveFn({ studentIds: selected.map((s) => s.id), category, message: clean(message), bcc: parseEmailList(bcc), lang })).data;
      setDrafts(r.drafts); setOpened(new Set());
      clearDraft(me, "collective"); setDraftAt(null);
      toast(t.collectiveSaved(r.drafts.length));
    } catch (e) {
      const msg = String((e as { message?: string }).message ?? "");
      toast(msg.includes("message-too-long") ? t.tooLong : t.saveFailed, false);
    } finally { setSaving(false); }
  }

  function openDraft(d: Draft) {
    window.open(d.gmailUrl, "_blank", "noopener,noreferrer");
    setOpened((o) => new Set(o).add(d.studentId));
  }

  function reset() { setDrafts(null); setSelected([]); setMessage(""); setBcc(""); setCategory(null); }

  const accent: CSSProperties = { ["--accent" as string]: category ? `var(--${category})` : "var(--brand)", ["--accent-soft" as string]: category ? `var(--${category}-soft)` : "var(--brand-soft)" };

  if (drafts) {
    return (
      <main className="collective" style={accent}>
        <section className="glass pad">
          <div className="table-head">
            <h2><Mail size={18} />{t.collectiveDraftsTitle}</h2>
            <span className="pill">{opened.size}/{drafts.length} {t.collectiveOpened}</span>
          </div>
          <p className="muted">{t.collectiveDraftsHelp}</p>
          <ul className="draft-list">
            {drafts.map((d) => (
              <li key={d.studentId} className={opened.has(d.studentId) ? "done" : ""}>
                <Avatar name={d.name} size={32} />
                <span className="s-name">{d.name}</span>
                {!d.hasParentEmail && <span className="tag warn">{t.noParents}</span>}
                <button className={`btn ${opened.has(d.studentId) ? "" : "primary"}`} onClick={() => openDraft(d)}>
                  {opened.has(d.studentId) ? <><Check size={15} />{t.collectiveReopen}</> : <><Mail size={15} />{t.collectiveOpen}</>}
                </button>
              </li>
            ))}
          </ul>
          <div className="actions"><button className="btn" onClick={reset}><RotateCcw size={15} />{t.collectiveNew}</button></div>
        </section>
      </main>
    );
  }

  return (
    <main className="collective workspace" style={accent}>
      <aside className="picker glass">
        <div className="search">
          <Search size={18} />
          <input type="search" placeholder={t.search} aria-label={t.search} value={query} onChange={(e) => setQuery(e.target.value)} />
          {query && <button className="icon-btn ghost" onClick={() => setQuery("")} aria-label="Clear"><X size={15} /></button>}
        </div>
        <div className="grade-scroll">
          <Segmented id="coll-grade" label={t.filter} value={grade} onChange={setGrade}
            options={[{ value: "all" as const, label: t.allGrades }, ...GRADES.map((g) => ({ value: g, label: `${g}º` }))]} />
        </div>
        <p className="list-meta"><Users size={14} /> {t.collectiveSelected(selected.length, MAX)}</p>
        {students === null ? <Skeleton lines={9} /> : (
          <ul className="student-list">
            {filtered.map((s) => (
              <li key={s.id}>
                <button aria-pressed={selectedIds.has(s.id)} className={`pick ${selectedIds.has(s.id) ? "on" : ""}`} onClick={() => toggle(s)}>
                  <span className="checkbox" aria-hidden="true">{selectedIds.has(s.id) && <Check size={13} />}</span>
                  <StudentPhoto studentId={s.id} name={s.name} hasPhoto={s.hasPhoto} version={s.photoVersion} size={30} lazy />
                  <span className="s-name">{s.name}</span>
                  <span className="s-grade">{s.grade}º</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <section className="compose glass">
        <div className="compose-head"><h2><Users size={18} />{t.collectiveTitle}</h2></div>
        <div className="sel-chips">
          <AnimatePresence initial={false}>
            {selected.map((s) => (
              <motion.button key={s.id} layout className="sel-chip" onClick={() => toggle(s)} initial={{ opacity: 0, scale: .9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: .9 }}>
                {s.name}<X size={13} />
              </motion.button>
            ))}
          </AnimatePresence>
          {selected.length < MIN && <span className="muted small">{t.collectivePickHint(MIN, MAX)}</span>}
        </div>
        {noParent.length > 0 && <p className="callout warn"><AlertTriangle size={16} />{t.collectiveNoParent(noParent.length)}</p>}

        <div className="cat-cards" role="radiogroup" aria-label={t.category}>
          {CATEGORIES.map((c) => (
            <button key={c} role="radio" aria-checked={category === c} className={`cat-card ${c}`} onClick={() => setCategory(c)}>
              <span className="cat-icon"><CategoryIcon c={c} /></span>
              <strong>{t.categories[c]}</strong>
              <small>{t.catDesc[c]}</small>
            </button>
          ))}
        </div>

        <div className="templates-row">
          <span className="row-label"><Wand2 size={14} />{t.templates}</span>
          <div className="template-scroll">
            {visibleTemplates.map((tp) => (
              <button key={tp.id} className={`template-chip ${tp.category}`} onClick={() => { setCategory(tp.category); setMessage(tp.text); }}>{tp.title}</button>
            ))}
          </div>
        </div>

        <label className="message">
          <span className="sr-only">{t.message}</span>
          <textarea rows={10} value={message} placeholder={t.messagePlaceholder} onChange={(e) => setMessage(e.target.value)} />
          <span className="char-count">{draftAt && message ? `${t.autosaved} · ` : ""}{t.chars(message.length)}</span>
        </label>
        <p className="muted small">{t.collectiveNameHint}</p>
        {kinds.length > 0 && <p className="callout warn"><AlertTriangle size={16} />{t.sensitive(kinds.map((k) => t.sensitiveKinds[k]).join(", "))}</p>}

        <label className="rcpt-row bcc-row"><span className="rcpt-label">{t.bcc}</span>
          <span className="bcc-input"><AtSign size={14} /><input type="text" value={bcc} onChange={(e) => setBcc(e.target.value)} placeholder={t.bccHint} /></span>
        </label>
        <p className="privacy-note">{t.collectiveHelp}</p>

        <div className="actions">
          <button className="btn primary shine" disabled={!ready || saving} onClick={() => void save()}>
            <Mail size={17} />{saving ? t.preparingDraft : t.collectiveSave(selected.length)}
          </button>
        </div>
      </section>
    </main>
  );
}