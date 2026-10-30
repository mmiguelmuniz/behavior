import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { FileDown, RefreshCw, Lock } from "lucide-react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";
import { useAuth } from "../auth";
import { useT } from "../i18n";
import { PeriodKey, periodRange, toInputDate } from "../lib/period";
import { AnimatedNumber, Segmented, Skeleton } from "../components/ui";
import logoFull from "../assets/ear-logo.png";
import { usePreview } from "../lib/preview";

type Cat = "good" | "behavior" | "academic" | "other";
const CATS: Cat[] = ["good", "behavior", "academic", "other"];
type Counts = Record<Cat, number>;
interface Report {
  from: string; to: string; generatedAt: string; scopeStudents: number; scopeGrades: number[];
  totals: Counts;
  byGrade: Array<{ grade: number } & Counts>;
  byWeek: Array<{ week: string } & Counts>;
  students: Array<{ id: string; name: string; grade: number } & Counts>;
  authors: Array<{ name: string; count: number }>;
}
type Scope = "all" | "ms" | "hs";
const SCOPE_GRADES: Record<Scope, number[] | null> = { all: null, ms: [6, 7, 8], hs: [9, 10, 11, 12] };
const reportFn = httpsCallable<object, Report>(functions, "reportdata");
const sum = (c: Counts) => c.good + c.behavior + c.academic + c.other;

/** Barras empilhadas por categoria (funciona na tela e na impressão). */
function Stack({ c, max }: { c: Counts; max: number }) {
  const total = sum(c);
  return (
    <div className="rp-track">
      <motion.div className="rp-bar" initial={{ width: 0 }} animate={{ width: `${max ? (total / max) * 100 : 0}%` }} transition={{ duration: .8, ease: [0.16, 1, 0.3, 1] }}>
        {CATS.map((k) => c[k] > 0 && <span key={k} className={k} style={{ flexGrow: c[k] }} />)}
      </motion.div>
    </div>
  );
}

export function ReportsPage() {
  const { t, lang } = useT();
  const { state } = useAuth();
  const staff = state.status === "ready" ? state.staff : null;
  const { person: preview } = usePreview();
  const [scope, setScope] = useState<Scope>("all");
  const [period, setPeriod] = useState<PeriodKey>("30d");
  const [custom, setCustom] = useState({ from: toInputDate(new Date(Date.now() - 30 * 86400000)), to: toInputDate(new Date()) });
  const [report, setReport] = useState<Report | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "denied" | "error">("idle");

  async function generate() {
    setStatus("loading");
    try {
      const { from, to } = periodRange(period, custom);
      const r = (await reportFn({ from: from.toISOString(), to: to.toISOString(), grades: SCOPE_GRADES[scope] ?? undefined, ...(preview ? { previewAs: preview.email } : {}) })).data;
      setReport(r); setStatus("idle");
    } catch (e) {
      setStatus(String((e as { code?: string }).code ?? "").includes("permission") ? "denied" : "error");
    }
  }
  useEffect(() => { void generate(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [scope, period, custom, preview?.email]);

  const loc = lang === "pt" ? "pt-BR" : "en-US";
  const fmt = (iso: string) => new Date(iso).toLocaleDateString(loc);
  const catLabel = (c: Cat) => (c === "other" ? t.otherCategory : t.categories[c]);
  const maxGrade = useMemo(() => Math.max(1, ...(report?.byGrade ?? []).map(sum)), [report]);
  const maxWeek = useMemo(() => Math.max(1, ...(report?.byWeek ?? []).map(sum)), [report]);
  const scopeLabel = { all: t.scopeAllGrades, ms: "Middle School (6º–8º)", hs: "High School (9º–12º)" }[scope];

  if (status === "denied") return <section className="glass pad"><div className="locked"><Lock size={28} /><p>{t.reportsDenied}</p></div></section>;

  return (
    <section className="reports">
      <div className="glass pad no-print">
        <div className="table-head">
          <h2>{t.reportsTitle}</h2>
          <div className="actions">
            <button className="btn" onClick={() => void generate()} disabled={status === "loading"}><RefreshCw size={15} className={status === "loading" ? "spin" : ""} />{t.refresh}</button>
            <button className="btn primary" disabled={!report || status === "loading"} onClick={() => window.print()}><FileDown size={16} />{t.downloadPdf}</button>
          </div>
        </div>
        <div className="manage-filters">
          <Segmented id="rp-scope" label={t.scopeLabel} value={scope} onChange={setScope} options={[
            { value: "all" as const, label: t.scopeAllGrades }, { value: "ms" as const, label: "Middle School" }, { value: "hs" as const, label: "High School" }]} />
          <Segmented id="rp-period" label={t.periodLabel} value={period} onChange={setPeriod} options={[
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
        <p className="muted small">{t.pdfHint}</p>
      </div>

      {status === "error" && <p className="callout bad no-print">{t.reportError}</p>}
      {!report || status === "loading" ? <div className="glass pad"><Skeleton lines={10} /></div> : (
        <article className="report glass">
          <header className="rp-head">
            <img src={logoFull} alt="American School of Recife" className="rp-logo" />
            <div>
              <h1>{t.reportHeading}</h1>
              <p>{scopeLabel} · {fmt(report.from)} – {fmt(report.to)}</p>
              <p className="muted small">{t.generatedBy(staff?.name ?? "", new Date(report.generatedAt).toLocaleString(loc))} · {t.studentsInScope(report.scopeStudents)}</p>
            </div>
          </header>

          <div className="rp-kpis">
            {CATS.map((c) => (
              <div key={c} className={`rp-kpi ${c}`}><b><AnimatedNumber value={report.totals[c]} /></b><span>{catLabel(c)}</span></div>
            ))}
            <div className="rp-kpi total"><b><AnimatedNumber value={sum(report.totals)} /></b><span>{t.logsTotal}</span></div>
          </div>

          <div className="rp-grid">
            <section>
              <h3>{t.byGrade}</h3>
              {report.byGrade.length === 0 ? <p className="muted">{t.noData}</p> : report.byGrade.map((g) => (
                <div key={g.grade} className="rp-row"><span className="rp-label">{t.grade(g.grade)}</span><Stack c={g} max={maxGrade} /><span className="rp-num">{sum(g)}</span></div>
              ))}
            </section>
            <section>
              <h3>{t.byWeekTitle}</h3>
              {report.byWeek.length === 0 ? <p className="muted">{t.noData}</p> : (
                <div className="rp-weeks">
                  {report.byWeek.slice(-16).map((w) => (
                    <div key={w.week} className="rp-week" title={`${fmt(w.week)}: ${sum(w)}`}>
                      <div className="rp-col">
                        {CATS.map((c) => w[c] > 0 && <motion.span key={c} className={c} initial={{ height: 0 }} animate={{ height: `${(w[c] / maxWeek) * 100}%` }} transition={{ duration: .7 }} />)}
                      </div>
                      <small>{new Date(`${w.week}T12:00:00`).toLocaleDateString(loc, { day: "2-digit", month: "2-digit" })}</small>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
          <div className="legend">{CATS.map((c) => <span key={c} className={c}><i />{catLabel(c)}</span>)}</div>

          <section className="rp-section">
            <h3>{t.studentsWithLogs(report.students.length)}</h3>
            {report.students.length === 0 ? <p className="muted">{t.noData}</p> : (
              <table className="rp-table">
                <thead><tr><th>{t.studentLabel}</th><th className="num">{t.gradeLabel}</th>{CATS.map((c) => <th key={c} className="num">{catLabel(c)}</th>)}<th className="num">{t.logsTotal}</th></tr></thead>
                <tbody>
                  {report.students.map((s) => (
                    <tr key={s.id}><td>{s.name}</td><td className="num">{s.grade}º</td>{CATS.map((c) => <td key={c} className={`num ${s[c] ? c : "zero"}`}>{s[c]}</td>)}<td className="num"><b>{sum(s)}</b></td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {report.authors.length > 0 && (
            <section className="rp-section">
              <h3>{t.topAuthors}</h3>
              <div className="rp-authors">{report.authors.map((a) => <span key={a.name} className="chip">{a.name} · <b>{a.count}</b></span>)}</div>
            </section>
          )}

          <footer className="rp-foot">{t.reportFooter}</footer>
        </article>
      )}
    </section>
  );
}