import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Search, X, ArrowLeft, Users } from "lucide-react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { useT } from "../i18n";
import type { Role } from "../auth";
import { normalize } from "../lib/text";
import { Student } from "../lib/types";
import { StudentPanel } from "../components/StudentPanel";
import { StudentPhoto } from "../components/StudentPhoto";
import { Segmented, Skeleton } from "../components/ui";

const GRADES = [6, 7, 8, 9, 10, 11, 12];

export function StudentsPage({ role }: { role: Role }) {
  const { t } = useT();
  const [students, setStudents] = useState<Student[] | null>(null);
  const [query, setQuery] = useState("");
  const [grade, setGrade] = useState<number | "all">("all");
  const [selected, setSelected] = useState<Student | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getDocs(collection(db, "students")).then((snap) => {
      setStudents(snap.docs
        .filter((d) => d.get("active") === true)
        .map((d) => ({
          id: d.id, name: String(d.get("name") ?? ""), grade: Number(d.get("grade")),
          guardianNames: (d.get("guardianNames") as string[] | undefined) ?? [],
          parentContactReady: d.get("parentContactReady") === true,
          studentEmailReady: d.get("studentEmailReady") === true,
          hasPhoto: d.get("hasPhoto") === true, photoVersion: Number(d.get("photoVersion") ?? 0),
        }))
        .sort((a, b) => a.grade - b.grade || a.name.localeCompare(b.name)));
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); searchRef.current?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const filtered = useMemo(() => {
    const q = normalize(query);
    return (students ?? []).filter((s) => (grade === "all" || s.grade === grade) && (!q || normalize(s.name).includes(q)));
  }, [students, query, grade]);

  return (
    <main className={`workspace ${selected ? "has-selection" : ""}`}>
      <aside className="picker glass">
        <div className="search">
          <Search size={18} />
          <input ref={searchRef} type="search" placeholder={t.search} aria-label={t.search} value={query} onChange={(e) => setQuery(e.target.value)} />
          {query ? <button className="icon-btn ghost" onClick={() => setQuery("")} aria-label="Clear"><X size={15} /></button> : <kbd>{t.searchShortcut}</kbd>}
        </div>
        <div className="grade-scroll">
          <Segmented id="grade" label={t.filter} value={grade} onChange={setGrade}
            options={[{ value: "all" as const, label: t.allGrades }, ...GRADES.map((g) => ({ value: g, label: `${g}º` }))]} />
        </div>
        <p className="list-meta"><Users size={14} /> {t.studentsCount(filtered.length)}</p>
        {students === null ? <Skeleton lines={9} /> : filtered.length === 0 ? <p className="empty-note">{t.noStudents}</p> : (
          <ul className="student-list">
            {filtered.map((s, i) => (
              <motion.li key={s.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 14) * 0.022, duration: 0.25 }}>
                <button aria-current={selected?.id === s.id} onClick={() => setSelected(s)}>
                  {selected?.id === s.id && <motion.span layoutId="student-active" className="active-bg" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
                  <StudentPhoto studentId={s.id} name={s.name} hasPhoto={s.hasPhoto} version={s.photoVersion} size={34} lazy />
                  <span className="s-name">{s.name}</span>
                  <span className="s-grade">{s.grade}º</span>
                </button>
              </motion.li>
            ))}
          </ul>
        )}
      </aside>

      <section className="stage">
        <AnimatePresence mode="wait">
          {selected ? (
            <motion.div key={selected.id + role} initial={{ opacity: 0, y: 16, scale: 0.99 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}>
              <button className="back-btn" onClick={() => setSelected(null)}><ArrowLeft size={16} />{t.back}</button>
              <StudentPanel student={selected} role={role} />
            </motion.div>
          ) : (
            <motion.div key="empty" className="stage-empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="orbit" aria-hidden="true"><span /><span /><span /></div>
              <p>{t.selectStudent}</p>
              <kbd>{t.searchShortcut}</kbd>
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </main>
  );
}