import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Search, Plus, Pencil, UserX, UserCheck, X, Save, Info } from "lucide-react";
import { collection, getDocs } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../firebase";
import { useAuth, Role } from "../auth";
import { useT } from "../i18n";
import { normalize } from "../lib/text";
import { Avatar, Segmented, Skeleton, useToast } from "../components/ui";

interface Person {
  email: string; name: string; role: Role; subject: string; division: string;
  grades: number[]; classes: string[]; historyGrades: number[]; wholeGradeAccess: number[];
  canSeeCounts: boolean; active: boolean;
}
const ROLES: Role[] = ["admin", "teacher", "psychologist", "substitute", "office"];
const ALL_GRADES = [6, 7, 8, 9, 10, 11, 12];
const saveFn = httpsCallable<object, { ok: boolean; created: boolean }>(functions, "savestaff");
const activeFn = httpsCallable<object, { ok: boolean }>(functions, "setstaffactive");

const empty = (): Person => ({ email: "", name: "", role: "teacher", subject: "", division: "", grades: [], classes: [], historyGrades: [], wholeGradeAccess: [], canSeeCounts: false, active: true });

function GradePicker({ value, onChange, label }: { value: number[]; onChange: (v: number[]) => void; label: string }) {
  return (
    <div className="field">
      <span>{label}</span>
      <div className="grade-picker" role="group" aria-label={label}>
        {ALL_GRADES.map((g) => (
          <button key={g} type="button" aria-pressed={value.includes(g)}
            onClick={() => onChange(value.includes(g) ? value.filter((x) => x !== g) : [...value, g].sort((a, b) => a - b))}>{g}º</button>
        ))}
      </div>
    </div>
  );
}

export function StaffPage() {
  const { t } = useT();
  const toast = useToast();
  const { state } = useAuth();
  const me = state.status === "ready" ? state.staff.email : "";
  const [people, setPeople] = useState<Person[] | null>(null);
  const [roleFilter, setRoleFilter] = useState<Role | "all">("all");
  const [status, setStatus] = useState<"active" | "inactive">("active");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<Person | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const snap = await getDocs(collection(db, "staff"));
    setPeople(snap.docs.map((d) => {
      const x = d.data();
      return {
        email: d.id, name: x.name ?? d.id, role: ROLES.includes(x.role) ? x.role : "teacher", subject: x.subject ?? "", division: x.division ?? "",
        grades: x.grades ?? [], classes: x.classes ?? [], historyGrades: x.historyGrades ?? [], wholeGradeAccess: x.wholeGradeAccess ?? [],
        canSeeCounts: x.canSeeCounts === true, active: x.active === true,
      };
    }).sort((a, b) => a.name.localeCompare(b.name)));
  }, []);
  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => {
    const q = normalize(search);
    return (people ?? []).filter((p) => (status === "active" ? p.active : !p.active) && (roleFilter === "all" || p.role === roleFilter)
      && (!q || normalize(p.name).includes(q) || p.email.includes(q)));
  }, [people, status, roleFilter, search]);

  const upd = (patch: Partial<Person>) => setForm((f) => f && { ...f, ...patch });

  async function save() {
    if (!form || busy) return;
    setBusy(true);
    try {
      const r = (await saveFn({ ...form })).data;
      toast(r.created ? t.staffCreated : t.staffSaved); setForm(null); void load();
    } catch (e) {
      const m = String((e as { message?: string }).message ?? "");
      toast(m.includes("self-lockout") ? t.selfLockout : m || t.saveFailed, false);
    } finally { setBusy(false); }
  }

  async function setActive(p: Person, active: boolean) {
    if (!active && !window.confirm(t.deactivateConfirm(p.name))) return;
    try { await activeFn({ email: p.email, active }); toast(active ? t.staffReactivated : t.staffDeactivated); void load(); }
    catch (e) { toast(String((e as { message?: string }).message ?? "").includes("self-lockout") ? t.selfLockout : t.saveFailed, false); }
  }

  const scopeText = (p: Person) => {
    if (p.role === "admin") return t.scopeAll;
    if (p.role === "office") return t.scopeReadOnly;
    if (p.role === "substitute") return t.scopeNoHistory;
    const parts: string[] = [];
    if (p.grades.length) parts.push(`${t.gradesShort}: ${p.grades.join(", ")}`);
    if (p.classes.length) parts.push(`${t.sectionsLabel}: ${p.classes.join(", ")}`);
    if (p.historyGrades.length) parts.push(`${t.historyShort}: ${p.historyGrades.join(", ")}`);
    return parts.join(" · ") || "—";
  };

  return (
    <section className="glass pad manage">
      <div className="table-head">
        <h2>{t.staffTitle}</h2>
        <button className="btn primary" onClick={() => { setIsNew(true); setForm(empty()); }}><Plus size={16} />{t.addStaff}</button>
      </div>
      <div className="manage-filters">
        <Segmented id="st-status" label={t.filter} value={status} onChange={setStatus} options={[{ value: "active" as const, label: t.activeStudents }, { value: "inactive" as const, label: t.inactiveLabel }]} />
        <Segmented id="st-role" label={t.filter} value={roleFilter} onChange={setRoleFilter} options={[{ value: "all" as const, label: t.allRoles }, ...ROLES.map((r) => ({ value: r, label: t.roles[r] }))]} />
        <div className="search compact"><Search size={16} /><input type="search" placeholder={t.searchStaff} value={search} onChange={(e) => setSearch(e.target.value)} aria-label={t.searchStaff} /></div>
      </div>
      {people === null ? <Skeleton lines={8} /> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th><span className="th-static">{t.nameLabel}</span></th><th><span className="th-static">{t.roleLabel}</span></th><th><span className="th-static">{t.accessLabel}</span></th><th /></tr></thead>
            <tbody>
              {visible.map((p) => (
                <tr key={p.email}>
                  <td><span className="cell-student"><Avatar name={p.name} size={28} /><span className="person"><b>{p.name}</b><small>{p.email}</small></span></span></td>
                  <td><span className={`tag role-${p.role}`}>{t.roles[p.role]}</span>{p.canSeeCounts && p.role !== "admin" && <span className="tag">{t.seesCountsShort}</span>}</td>
                  <td className="muted small">{scopeText(p)}</td>
                  <td className="row-actions">
                    <button className="icon-btn" title={t.edit} onClick={() => { setIsNew(false); setForm({ ...p }); }}><Pencil size={14} /></button>
                    {p.email !== me && (p.active
                      ? <button className="icon-btn" title={t.deactivate} onClick={() => void setActive(p, false)}><UserX size={14} /></button>
                      : <button className="icon-btn" title={t.reactivate} onClick={() => void setActive(p, true)}><UserCheck size={14} /></button>)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {createPortal(<AnimatePresence>
        {form && (
          <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setForm(null)}>
            <motion.div className="modal glass" role="dialog" aria-modal="true" aria-label={isNew ? t.addStaff : t.editStaff}
              initial={{ opacity: 0, y: 20, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10 }} onClick={(e) => e.stopPropagation()}>
              <div className="table-head"><h2>{isNew ? t.addStaff : t.editStaff}</h2><button className="icon-btn ghost" onClick={() => setForm(null)} aria-label="Close"><X size={18} /></button></div>

              <div className="form-grid">
                <label className="field wide"><span>{t.schoolEmailLabel}</span>
                  <input type="email" value={form.email} disabled={!isNew} placeholder="nome@ear.com.br" onChange={(e) => upd({ email: e.target.value })} />
                </label>
                <label className="field"><span>{t.nameLabel}</span><input value={form.name} onChange={(e) => upd({ name: e.target.value })} /></label>
                <label className="field"><span>{t.roleLabel}</span>
                  <select value={form.role} onChange={(e) => upd({ role: e.target.value as Role })}>{ROLES.map((r) => <option key={r} value={r}>{t.roles[r]}</option>)}</select>
                </label>
                <label className="field"><span>{t.subjectLabel}</span><input value={form.subject} onChange={(e) => upd({ subject: e.target.value })} /></label>
                <label className="field"><span>{t.divisionLabel}</span>
                  <select value={form.division} onChange={(e) => upd({ division: e.target.value })}>
                    <option value="">—</option><option value="Middle School">Middle School</option><option value="High School">High School</option><option value="Secondary">Secondary</option>
                  </select>
                </label>
              </div>

              <p className="callout"><Info size={16} />{t.roleHelp[form.role]}</p>

              {(form.role === "teacher" || form.role === "psychologist" || form.role === "substitute") && (
                <div className="form-grid">
                  <div className="wide"><GradePicker label={form.role === "psychologist" ? t.gradesPsyLabel : t.gradesLabel} value={form.grades} onChange={(v) => upd({ grades: v })} /></div>
                  {form.role === "teacher" && <>
                    <label className="field wide"><span>{t.classesLabel}</span>
                      <input value={form.classes.join(", ")} placeholder="7C, 8A" onChange={(e) => upd({ classes: e.target.value.split(/[,;\s]+/).filter(Boolean) })} />
                    </label>
                    <div className="wide"><GradePicker label={t.wholeGradeLabel} value={form.wholeGradeAccess} onChange={(v) => upd({ wholeGradeAccess: v })} /></div>
                    <div className="wide"><GradePicker label={t.historyGradesLabel} value={form.historyGrades} onChange={(v) => upd({ historyGrades: v })} /></div>
                    <label className="check wide"><input type="checkbox" checked={form.canSeeCounts} onChange={(e) => upd({ canSeeCounts: e.target.checked })} />{t.canSeeCountsLabel}</label>
                  </>}
                </div>
              )}

              <label className="check"><input type="checkbox" checked={form.active} disabled={form.email === me} onChange={(e) => upd({ active: e.target.checked })} />{t.activeAccessLabel}</label>

              <div className="actions">
                <button className="btn primary" disabled={busy || form.name.trim().length < 2 || !form.email.includes("@")} onClick={() => void save()}><Save size={16} />{t.save}</button>
                <button className="btn" onClick={() => setForm(null)}>{t.cancel}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>, document.body)}
    </section>
  );
}
