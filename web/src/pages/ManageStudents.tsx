import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Search, Plus, Pencil, Archive, ArchiveRestore, X, Trash2, Upload, Save } from "lucide-react";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../firebase";
import { useT } from "../i18n";
import { normalize } from "../lib/text";
import { Segmented, Skeleton, useToast } from "../components/ui";
import { StudentPhoto } from "../components/StudentPhoto";

interface Row { id: string; name: string; grade: number; officialId: string | null; sectionIds: string[]; active: boolean; hasPhoto: boolean; photoVersion: number; revision: number }
interface Form { id?: string; name: string; grade: number; officialId: string; sections: string; guardians: Array<{ name: string; email: string }>; studentEmail: string; revision?: number }

const saveFn = httpsCallable<object, { id: string }>(functions, "savestudent");
const activeFn = httpsCallable<object, { ok: boolean }>(functions, "setstudentactive");
const photoFn = httpsCallable<object, { ok: boolean }>(functions, "setstudentphoto");
const removePhotoFn = httpsCallable<object, { ok: boolean }>(functions, "removestudentphoto");
const GRADES = [6, 7, 8, 9, 10, 11, 12];
const MAX_BYTES = 250 * 1024;

/** Reduz a imagem no navegador (máx. 600 px, JPEG) para caber em 250 KB. */
async function shrinkImage(file: File): Promise<string> {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, 600 / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  for (const q of [0.85, 0.75, 0.6, 0.45]) {
    const blob: Blob = await new Promise((r) => canvas.toBlob((b) => r(b!), "image/jpeg", q));
    if (blob.size <= MAX_BYTES) {
      const buf = new Uint8Array(await blob.arrayBuffer());
      let bin = ""; buf.forEach((b) => (bin += String.fromCharCode(b)));
      return btoa(bin);
    }
  }
  throw new Error("photo-too-large");
}

export function ManageStudents() {
  const { t } = useT();
  const toast = useToast();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [status, setStatus] = useState<"active" | "archived">("active");
  const [grade, setGrade] = useState<number | "all">("all");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<Form | null>(null);
  const [editing, setEditing] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const snap = await getDocs(collection(db, "students"));
    setRows(snap.docs.map((d) => ({
      id: d.id, name: d.get("name"), grade: d.get("grade"), officialId: d.get("officialId") ?? null,
      sectionIds: d.get("sectionIds") ?? [], active: d.get("active") === true,
      hasPhoto: d.get("hasPhoto") === true, photoVersion: Number(d.get("photoVersion") ?? 0), revision: Number(d.get("revision") ?? 0),
    })).sort((a, b) => a.grade - b.grade || a.name.localeCompare(b.name)));
  }, []);
  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => {
    const q = normalize(search);
    return (rows ?? []).filter((r) => (status === "active" ? r.active : !r.active) && (grade === "all" || r.grade === grade) && (!q || normalize(r.name).includes(q)));
  }, [rows, status, grade, search]);

  async function openEdit(r?: Row) {
    if (!r) { setEditing(null); setForm({ name: "", grade: 6, officialId: "", sections: "", guardians: [{ name: "", email: "" }], studentEmail: "" }); return; }
    const c = await getDoc(doc(db, "studentContacts", r.id));
    const emails = (c.get("parentEmails") as string[] | undefined) ?? [];
    const saved = (c.get("guardians") as Form["guardians"] | undefined) ?? emails.map((email) => ({ name: "", email }));
    setEditing(r);
    setForm({ id: r.id, name: r.name, grade: r.grade, officialId: r.officialId ?? "", sections: r.sectionIds.join(", "),
      guardians: saved.length ? saved : [{ name: "", email: "" }], studentEmail: c.get("studentEmail") ?? "", revision: r.revision });
  }

  async function save() {
    if (!form || busy) return;
    setBusy(true);
    try {
      await saveFn({
        id: form.id, name: form.name, grade: form.grade, officialId: form.officialId || null,
        sectionIds: form.sections.split(/[,;\s]+/).filter(Boolean),
        guardians: form.guardians.filter((g) => g.name.trim() || g.email.trim()),
        studentEmail: form.studentEmail || null, revision: form.revision,
      });
      toast(t.studentSaved); setForm(null); void load();
    } catch (e) {
      const m = String((e as { message?: string }).message ?? "");
      toast(m.includes("conflict") ? t.studentConflict : m || t.saveFailed, false);
    } finally { setBusy(false); }
  }

  async function setActive(r: Row, active: boolean) {
    if (!active && !window.confirm(t.archiveConfirm(r.name))) return;
    try { await activeFn({ studentId: r.id, active }); toast(active ? t.restored : t.archived); void load(); }
    catch { toast(t.saveFailed, false); }
  }

  async function uploadPhoto(file: File) {
    if (!editing) return;
    setBusy(true);
    try {
      const base64 = await shrinkImage(file);
      await photoFn({ studentId: editing.id, base64, contentType: "image/jpeg" });
      toast(t.photoSaved); await load();
      setEditing((e) => e && { ...e, hasPhoto: true, photoVersion: Date.now() });
    } catch { toast(t.photoFailed, false); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  async function removePhoto() {
    if (!editing || !window.confirm(t.removePhotoConfirm)) return;
    try { await removePhotoFn({ studentId: editing.id }); toast(t.photoRemoved); await load(); setEditing((e) => e && { ...e, hasPhoto: false }); }
    catch { toast(t.photoFailed, false); }
  }

  const upd = (patch: Partial<Form>) => setForm((f) => f && { ...f, ...patch });

  return (
    <section className="glass pad manage">
      <div className="table-head">
        <h2>{t.manageStudents}</h2>
        <button className="btn primary" onClick={() => void openEdit()}><Plus size={16} />{t.addStudent}</button>
      </div>
      <div className="manage-filters">
        <Segmented id="m-status" label={t.filter} value={status} onChange={setStatus} options={[{ value: "active" as const, label: t.activeStudents }, { value: "archived" as const, label: t.archivedStudents }]} />
        <Segmented id="m-grade" label={t.filter} value={grade} onChange={setGrade} options={[{ value: "all" as const, label: t.allGrades }, ...GRADES.map((g) => ({ value: g, label: `${g}º` }))]} />
        <div className="search compact"><Search size={16} /><input type="search" placeholder={t.search} value={search} onChange={(e) => setSearch(e.target.value)} aria-label={t.search} /></div>
      </div>
      {rows === null ? <Skeleton lines={8} /> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th><span className="th-static">{t.studentLabel}</span></th><th className="num"><span className="th-static">{t.gradeLabel}</span></th><th><span className="th-static">{t.sectionsLabel}</span></th><th><span className="th-static">{t.officialIdLabel}</span></th><th /></tr></thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id}>
                  <td><span className="cell-student"><StudentPhoto studentId={r.id} name={r.name} hasPhoto={r.hasPhoto} version={r.photoVersion} size={26} lazy />{r.name}</span></td>
                  <td className="num">{r.grade}º</td>
                  <td>{r.sectionIds.join(", ") || "—"}</td>
                  <td>{r.officialId ?? "—"}</td>
                  <td className="row-actions">
                    <button className="icon-btn" onClick={() => void openEdit(r)} title={t.edit}><Pencil size={14} /></button>
                    {r.active
                      ? <button className="icon-btn" onClick={() => void setActive(r, false)} title={t.archive}><Archive size={14} /></button>
                      : <button className="icon-btn" onClick={() => void setActive(r, true)} title={t.restore}><ArchiveRestore size={14} /></button>}
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
            <motion.div className="modal glass" role="dialog" aria-modal="true" aria-label={form.id ? t.editStudent : t.addStudent}
              initial={{ opacity: 0, y: 20, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10 }} onClick={(e) => e.stopPropagation()}>
              <div className="table-head"><h2>{form.id ? t.editStudent : t.addStudent}</h2><button className="icon-btn ghost" onClick={() => setForm(null)} aria-label="Close"><X size={18} /></button></div>

              {editing && (
                <div className="photo-row">
                  <StudentPhoto studentId={editing.id} name={editing.name} hasPhoto={editing.hasPhoto} version={editing.photoVersion} size={88} />
                  <div className="photo-actions">
                    <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => e.target.files?.[0] && void uploadPhoto(e.target.files[0])} />
                    <button className="btn" disabled={busy} onClick={() => fileRef.current?.click()}><Upload size={15} />{editing.hasPhoto ? t.replacePhoto : t.addPhoto}</button>
                    {editing.hasPhoto && <button className="btn" disabled={busy} onClick={() => void removePhoto()}><Trash2 size={15} />{t.removePhoto}</button>}
                    <small className="muted">{t.photoHint}</small>
                  </div>
                </div>
              )}

              <div className="form-grid">
                <label className="field wide"><span>{t.nameLabel}</span><input value={form.name} onChange={(e) => upd({ name: e.target.value })} /></label>
                <label className="field"><span>{t.gradeLabel}</span>
                  <select value={form.grade} onChange={(e) => upd({ grade: Number(e.target.value) })}>{[1, 2, 3, 4, 5, ...GRADES].map((g) => <option key={g} value={g}>{g}º</option>)}</select>
                </label>
                <label className="field"><span>{t.officialIdLabel}</span><input value={form.officialId} onChange={(e) => upd({ officialId: e.target.value })} /></label>
                <label className="field"><span>{t.sectionsLabel}</span><input value={form.sections} placeholder="7C" onChange={(e) => upd({ sections: e.target.value })} /></label>
                <label className="field"><span>{t.studentEmailLabel}</span><input type="email" value={form.studentEmail} onChange={(e) => upd({ studentEmail: e.target.value })} /></label>
              </div>

              <div className="guardians-edit">
                <span className="row-label">{t.guardians}</span>
                {form.guardians.map((g, i) => (
                  <div key={i} className="guardian-row">
                    <input placeholder={t.nameLabel} value={g.name} onChange={(e) => upd({ guardians: form.guardians.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
                    <input type="email" placeholder="email@exemplo.com" value={g.email} onChange={(e) => upd({ guardians: form.guardians.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)) })} />
                    <button className="icon-btn ghost" onClick={() => upd({ guardians: form.guardians.filter((_, j) => j !== i) })} aria-label={t.remove}><X size={15} /></button>
                  </div>
                ))}
                {form.guardians.length < 6 && <button className="link-btn" onClick={() => upd({ guardians: [...form.guardians, { name: "", email: "" }] })}><Plus size={13} />{t.addGuardian}</button>}
              </div>

              <div className="actions">
                <button className="btn primary" disabled={busy || form.name.trim().length < 2} onClick={() => void save()}><Save size={16} />{t.save}</button>
                <button className="btn" onClick={() => setForm(null)}>{t.cancel}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>, document.body)}
    </section>
  );
}