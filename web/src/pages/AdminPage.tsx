import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Search, ArrowUpDown, Inbox, History, Ban, Trash2 } from "lucide-react";
import { collection, doc, getDoc, getDocs, limit, orderBy, query, Timestamp } from "firebase/firestore";
import { db } from "../firebase";
import { deleteLogFn, voidLogFn } from "../components/StudentPanel";
import { useT } from "../i18n";
import { CATEGORIES, Category, Counts } from "../lib/types";
import { normalize } from "../lib/text";
import { AnimatedNumber, Avatar, Segmented, Skeleton, relativeTime, useToast } from "../components/ui";
import { CategoryIcon } from "../components/icons";
import { ManageStudents } from "./ManageStudents";
import { ActivityPage } from "./ActivityPage";
import { ReportsPage } from "./ReportsPage";
import { StaffPage } from "./StaffPage";
import { FeedbackAdmin } from "./FeedbackAdmin";

interface Row { id: string; name: string; grade: number; counts: Counts; total: number }
interface Recent { id: string; studentId: string; category: string; authorName: string; createdAt?: Timestamp; voided?: boolean; legacy?: boolean }
type SortKey = "name" | "grade" | Category | "total";

const GRADES = [6, 7, 8, 9, 10, 11, 12];

export function AdminPage() {
  const [sub, setSub] = useState<"overview" | "activity" | "reports" | "manage" | "staff" | "feedback">("overview");
  const { t, lang } = useT();
  const toast = useToast();
  const [loaded, setLoaded] = useState(false);
  const [totals, setTotals] = useState<Counts>({ good: 0, behavior: 0, academic: 0 });
  const [rows, setRows] = useState<Row[]>([]);
  const [grade, setGrade] = useState<number | "all">("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "total", dir: -1 });
  const [recent, setRecent] = useState<Recent[]>([]);

  const load = useCallback(async () => {
    const stats = await getDoc(doc(db, "stats", "school"));
    setTotals((stats.get("totals") as Counts | undefined) ?? { good: 0, behavior: 0, academic: 0 });
    const [studentsSnap, countsSnap, recentSnap] = await Promise.all([
      getDocs(collection(db, "students")),
      getDocs(collection(db, "studentCounts")),
      getDocs(query(collection(db, "logs"), orderBy("createdAt", "desc"), limit(25))),
    ]);
    const counts = new Map(countsSnap.docs.map((d) => [d.id, d.data() as Counts]));
    setRows(studentsSnap.docs.filter((d) => d.get("active") === true).map((d) => {
      const c = counts.get(d.id) ?? { good: 0, behavior: 0, academic: 0 };
      const cc = { good: c.good ?? 0, behavior: c.behavior ?? 0, academic: c.academic ?? 0 };
      return { id: d.id, name: d.get("name"), grade: d.get("grade"), counts: cc, total: cc.good + cc.behavior + cc.academic };
    }));
    setRecent(recentSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Recent, "id">) })));
    setLoaded(true);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const grandTotal = totals.good + totals.behavior + totals.academic;
  const names = useMemo(() => new Map(rows.map((r) => [r.id, r.name])), [rows]);

  const byGrade = useMemo(() => GRADES.map((g) => {
    const c = { good: 0, behavior: 0, academic: 0 };
    rows.filter((r) => r.grade === g).forEach((r) => { c.good += r.counts.good; c.behavior += r.counts.behavior; c.academic += r.counts.academic; });
    return { grade: g, c, total: c.good + c.behavior + c.academic };
  }), [rows]);
  const maxGrade = Math.max(1, ...byGrade.map((g) => g.total));
  const maxRow = Math.max(1, ...rows.map((r) => r.total));

  const visible = useMemo(() => {
    const q = normalize(search);
    const list = rows.filter((r) => (grade === "all" || r.grade === grade) && (!q || normalize(r.name).includes(q)));
    const val = (r: Row) => (sort.key === "name" ? r.name : sort.key === "grade" ? r.grade : sort.key === "total" ? r.total : r.counts[sort.key]);
    return list.sort((a, b) => {
      const va = val(a), vb = val(b);
      const cmp = typeof va === "string" ? va.localeCompare(vb as string) : (va as number) - (vb as number);
      return cmp * sort.dir || a.name.localeCompare(b.name);
    });
  }, [rows, grade, search, sort]);

  const toggleSort = (key: SortKey) => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : key === "name" ? 1 : -1 }));

  async function deleteOne(id: string) {
    if (!window.confirm(t.deleteConfirm)) return;
    try { await deleteLogFn({ logId: id }); toast(t.deleted); window.setTimeout(() => void load(), 800); }
    catch { toast(t.deleteFailed, false); }
  }

  async function voidOne(id: string) {
    if (!window.confirm(t.voidConfirm)) return;
    try { await voidLogFn({ logId: id }); toast(t.voidDone); window.setTimeout(() => void load(), 1200); }
    catch { toast(t.voidFailed, false); }
  }

  const subTabs = (
    <div className="sub-tabs no-print">
      <Segmented id="admin-sub" label="Admin" value={sub} onChange={setSub} options={[
        { value: "overview" as const, label: t.overview }, { value: "activity" as const, label: t.activityTab },
        { value: "reports" as const, label: t.reportsTab }, { value: "manage" as const, label: t.manageStudents },
        { value: "staff" as const, label: t.staffTab }, { value: "feedback" as const, label: t.feedbackTab }]} />
    </div>
  );
  if (sub === "manage") return <main className="admin">{subTabs}<ManageStudents /></main>;
  if (sub === "activity") return <main className="admin">{subTabs}<ActivityPage /></main>;
  if (sub === "reports") return <main className="admin">{subTabs}<ReportsPage /></main>;
  if (sub === "staff") return <main className="admin">{subTabs}<StaffPage /></main>;
  if (sub === "feedback") return <main className="admin">{subTabs}<FeedbackAdmin /></main>;
  if (!loaded) return <main className="admin">{subTabs}<div className="glass pad"><Skeleton lines={10} /></div></main>;

  return (
    <main className="admin">
      {subTabs}
      <section className="totals">
        {CATEGORIES.map((c, i) => {
          const pct = grandTotal ? Math.round((totals[c] / grandTotal) * 100) : 0;
          return (
            <motion.div key={c} className={`total-card glass ${c}`} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
              <div className="tc-top"><span className="cat-icon"><CategoryIcon c={c} /></span><span>{t.categories[c]}</span></div>
              <b className="tc-num"><AnimatedNumber value={totals[c]} /></b>
              <div className="tc-bar"><motion.span initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ delay: 0.3 + i * 0.08, duration: 0.9, ease: [0.16, 1, 0.3, 1] }} /></div>
              <small className="muted">{t.share(pct)}</small>
            </motion.div>
          );
        })}
      </section>

      <section className="glass pad">
        <h2>{t.byGrade}</h2>
        <div className="grade-chart">
          {byGrade.map((g, i) => (
            <div key={g.grade} className="gc-row">
              <span className="gc-label">{t.grade(g.grade)}</span>
              <div className="gc-track">
                <motion.div className="gc-bar" initial={{ width: 0 }} animate={{ width: `${(g.total / maxGrade) * 100}%` }} transition={{ delay: 0.1 + i * 0.05, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}>
                  {CATEGORIES.map((c) => g.c[c] > 0 && <span key={c} className={c} style={{ flexGrow: g.c[c] }} title={`${t.categories[c]}: ${g.c[c]}`} />)}
                </motion.div>
              </div>
              <span className="gc-total tnum">{g.total}</span>
            </div>
          ))}
          <div className="legend">{CATEGORIES.map((c) => <span key={c} className={c}><i />{t.categories[c]}</span>)}</div>
        </div>
      </section>

      <section className="glass pad">
        <div className="table-head">
          <h2>{t.perStudent}</h2>
          <div className="search compact"><Search size={16} /><input type="search" placeholder={t.search} value={search} onChange={(e) => setSearch(e.target.value)} aria-label={t.search} /></div>
        </div>
        <div className="grade-scroll">
          <Segmented id="admin-grade" label={t.filter} value={grade} onChange={setGrade}
            options={[{ value: "all" as const, label: t.allGrades }, ...GRADES.map((g) => ({ value: g, label: `${g}º` }))]} />
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {([["name", t.studentLabel], ["grade", t.gradeLabel], ...CATEGORIES.map((c) => [c, t.categories[c]]), ["total", t.logsTotal]] as Array<[SortKey, string]>).map(([k, label]) => (
                  <th key={k} className={k === "name" ? "" : "num"} aria-sort={sort.key === k ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
                    <button className="th-btn" onClick={() => toggleSort(k)}>{label}<ArrowUpDown size={12} /></button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id}>
                  <td><span className="cell-student"><Avatar name={r.name} size={26} />{r.name}</span></td>
                  <td className="num">{r.grade}º</td>
                  {CATEGORIES.map((c) => <td key={c} className={`num ${r.counts[c] ? c : "zero"}`}>{r.counts[c]}</td>)}
                  <td className="num"><span className="heat"><i style={{ width: `${(r.total / maxRow) * 100}%` }} /><b>{r.total}</b></span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="glass pad">
        <h2><History size={17} />{t.recentLogs}</h2>
        {recent.length === 0 ? <p className="empty-note"><Inbox size={16} />{t.recentNone}</p> : (
          <ul className="feed">
            {recent.map((r) => (
              <li key={r.id} className={r.voided ? "voided" : ""}>
                <span className={`tag cat-${r.category}`}>{r.category in t.categories ? t.categories[r.category as Category] : t.otherCategory}</span>
                <span className="feed-text"><strong>{names.get(r.studentId) ?? r.studentId}</strong> · {t.by} {r.authorName} · {r.createdAt ? relativeTime(r.createdAt.toDate(), lang) : "—"}</span>
                {r.legacy ? <span className="tag">{t.legacyTag}</span>
                  : r.voided ? <span className="feed-actions"><span className="tag bad">{t.voidedLabel}</span><button className="link-btn danger" onClick={() => void deleteOne(r.id)}><Trash2 size={12} />{t.deleteLog}</button></span>
                  : <button className="link-btn danger" onClick={() => void voidOne(r.id)}><Ban size={12} />{t.voidLog}</button>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}