import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Search, Download, ChevronDown, ChevronUp } from "lucide-react";
import { collection, getDocs, limit, orderBy, query, Timestamp, where } from "firebase/firestore";
import { db } from "../firebase";
import { useT } from "../i18n";
import { normalize } from "../lib/text";
import { PeriodKey, periodRange, toInputDate } from "../lib/period";
import { Segmented, Skeleton } from "../components/ui";

interface Item {
  id: string; studentId: string; studentName: string; grade: number; category: string; message: string;
  authorName: string; createdAt: Date; legacy: boolean; voided: boolean;
}
const GRADES = [6, 7, 8, 9, 10, 11, 12];
const CATS = ["good", "behavior", "academic", "other"] as const;

/** Atividade de registros (só ADMIN, que lê os logs direto pelas regras do Firestore). */
export function ActivityPage() {
  const { t, lang } = useT();
  const [period, setPeriod] = useState<PeriodKey>("30d");
  const [custom, setCustom] = useState({ from: toInputDate(new Date(Date.now() - 30 * 86400000)), to: toInputDate(new Date()) });
  const [items, setItems] = useState<Item[] | null>(null);
  const [cat, setCat] = useState<(typeof CATS)[number] | "all">("all");
  const [grade, setGrade] = useState<number | "all">("all");
  const [search, setSearch] = useState("");
  const [showVoided, setShowVoided] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    setItems(null);
    const { from, to } = periodRange(period, custom);
    const [students, logs] = await Promise.all([
      getDocs(collection(db, "students")),
      getDocs(query(collection(db, "logs"), where("createdAt", ">=", Timestamp.fromDate(from)), where("createdAt", "<=", Timestamp.fromDate(to)), orderBy("createdAt", "desc"), limit(5000))),
    ]);
    const names = new Map(students.docs.map((d) => [d.id, { name: String(d.get("name") ?? d.id), grade: Number(d.get("grade")) }]));
    setItems(logs.docs.map((d) => {
      const s = names.get(d.get("studentId"));
      return {
        id: d.id, studentId: d.get("studentId"), studentName: s?.name ?? d.get("studentId"), grade: s?.grade ?? Number(d.get("grade")),
        category: d.get("category"), message: d.get("message") ?? "", authorName: d.get("authorName") ?? "",
        createdAt: (d.get("createdAt") as Timestamp).toDate(), legacy: d.get("legacy") === true, voided: d.get("voided") === true,
      };
    }));
  }, [period, custom]);
  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => {
    const q = normalize(search);
    return (items ?? []).filter((i) => (showVoided || !i.voided) && (cat === "all" || i.category === cat) && (grade === "all" || i.grade === grade)
      && (!q || normalize(i.studentName).includes(q) || normalize(i.authorName).includes(q)));
  }, [items, cat, grade, search, showVoided]);

  const summary = useMemo(() => {
    const s = { good: 0, behavior: 0, academic: 0, other: 0 };
    visible.forEach((i) => { if (!i.voided) s[(CATS as readonly string[]).includes(i.category) ? (i.category as keyof typeof s) : "other"]++; });
    return s;
  }, [visible]);

  const catLabel = (c: string) => (c in t.categories ? t.categories[c as keyof typeof t.categories] : t.otherCategory);

  function exportCsv() {
    const rows = [[t.dateLabel, t.studentLabel, t.gradeLabel, t.category, t.authorLabel, t.statusLabel]];
    visible.forEach((i) => rows.push([i.createdAt.toLocaleString(), i.studentName, String(i.grade), catLabel(i.category), i.authorName, i.voided ? t.voidedLabel : i.legacy ? t.legacyTag : ""]));
    const csv = "\uFEFF" + rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(";")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `registros-${toInputDate(new Date())}.csv`; a.click(); URL.revokeObjectURL(a.href);
  }

  return (
    <section className="glass pad">
      <div className="table-head">
        <h2>{t.activityTitle}</h2>
        <button className="btn" disabled={!visible.length} onClick={exportCsv}><Download size={15} />{t.exportCsv}</button>
      </div>
      <div className="manage-filters">
        <Segmented id="act-period" label={t.periodLabel} value={period} onChange={setPeriod} options={[
          { value: "7d" as const, label: t.period7 }, { value: "30d" as const, label: t.period30 }, { value: "90d" as const, label: t.period90 },
          { value: "year" as const, label: t.periodYear }, { value: "custom" as const, label: t.periodCustom }]} />
        {period === "custom" && (
          <span className="date-range">
            <input type="date" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} aria-label={t.fromLabel} />
            <span>→</span>
            <input type="date" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} aria-label={t.toLabel} />
          </span>
        )}
      </div>
      <div className="manage-filters">
        <Segmented id="act-cat" label={t.category} value={cat} onChange={setCat} options={[{ value: "all" as const, label: t.allCategories }, ...CATS.map((c) => ({ value: c, label: catLabel(c) }))]} />
        <Segmented id="act-grade" label={t.filter} value={grade} onChange={setGrade} options={[{ value: "all" as const, label: t.allGrades }, ...GRADES.map((g) => ({ value: g, label: `${g}º` }))]} />
        <div className="search compact"><Search size={16} /><input type="search" placeholder={t.searchActivity} value={search} onChange={(e) => setSearch(e.target.value)} aria-label={t.searchActivity} /></div>
        <label className="check"><input type="checkbox" checked={showVoided} onChange={(e) => setShowVoided(e.target.checked)} />{t.showVoided}</label>
      </div>

      <div className="act-summary">
        {CATS.map((c) => <span key={c} className={`tag cat-${c}`}>{catLabel(c)}: <b>{summary[c]}</b></span>)}
        <span className="muted small">{t.recordsShown(visible.length)}</span>
      </div>

      {items === null ? <Skeleton lines={8} /> : visible.length === 0 ? <p className="empty-note">{t.recentNone}</p> : (
        <div className="table-wrap">
          <table>
            <thead><tr>
              <th><span className="th-static">{t.dateLabel}</span></th><th><span className="th-static">{t.studentLabel}</span></th>
              <th className="num"><span className="th-static">{t.gradeLabel}</span></th><th><span className="th-static">{t.category}</span></th>
              <th><span className="th-static">{t.authorLabel}</span></th><th />
            </tr></thead>
            <tbody>
              {visible.map((i) => (
                <Fragment key={i.id}>
                  <tr className={i.voided ? "voided" : ""}>
                    <td className="nowrap">{i.createdAt.toLocaleDateString(lang === "pt" ? "pt-BR" : "en-US")} <span className="muted small">{i.createdAt.toLocaleTimeString(lang === "pt" ? "pt-BR" : "en-US", { hour: "2-digit", minute: "2-digit" })}</span></td>
                    <td><b>{i.studentName}</b></td>
                    <td className="num">{i.grade}º</td>
                    <td><span className={`tag cat-${i.category}`}>{catLabel(i.category)}</span>{i.legacy && <span className="tag">{t.legacyTag}</span>}{i.voided && <span className="tag bad">{t.voidedLabel}</span>}</td>
                    <td>{i.authorName || "—"}</td>
                    <td className="row-actions">{i.message && <button className="icon-btn" onClick={() => setOpen(open === i.id ? null : i.id)} aria-label={t.showMore}>{open === i.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</button>}</td>
                  </tr>
                  {open === i.id && <tr className="msg-row"><td colSpan={6}><p className="t-msg open">{i.message}</p></td></tr>}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
