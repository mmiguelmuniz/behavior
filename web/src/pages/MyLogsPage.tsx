import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Search, Ban, Trash2, ChevronDown, ChevronUp, Users } from "lucide-react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";
import { useT } from "../i18n";
import { normalize } from "../lib/text";
import { PeriodKey, periodRange, toInputDate } from "../lib/period";
import { AnimatedNumber, Segmented, Skeleton, useToast } from "../components/ui";
import { CategoryIcon } from "../components/icons";
import { deleteLogFn, voidLogFn } from "../components/StudentPanel";
import { CATEGORIES, Category } from "../lib/types";

interface MyLog {
  id: string; studentId: string; studentName: string; grade: number | null; category: string; message: string;
  createdAt: string | null; voided: boolean; collective: boolean; canVoid: boolean; canDelete: boolean;
}
const myLogsFn = httpsCallable<object, { logs: MyLog[] }>(functions, "mylogs");

/** Painel do professor: tudo o que ele registrou, com os próprios totais. */
export function MyLogsPage() {
  const { t, lang } = useT();
  const toast = useToast();
  const [period, setPeriod] = useState<PeriodKey>("30d");
  const [custom, setCustom] = useState({ from: toInputDate(new Date(Date.now() - 30 * 86400000)), to: toInputDate(new Date()) });
  const [logs, setLogs] = useState<MyLog[] | null>(null);
  const [cat, setCat] = useState<string>("all");
  const [q, setQ] = useState("");
  const [showCanceled, setShowCanceled] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLogs(null);
    const { from, to } = periodRange(period, custom);
    try { setLogs((await myLogsFn({ from: from.toISOString(), to: to.toISOString() })).data.logs); }
    catch { setLogs([]); toast(t.reportError, false); }
  }, [period, custom, toast, t.reportError]);
  useEffect(() => { void load(); }, [load]);

  const active = (logs ?? []).filter((l) => !l.voided);
  const totals = useMemo(() => {
    const c: Record<Category, number> = { good: 0, behavior: 0, academic: 0 };
    active.forEach((l) => { if (l.category in c) c[l.category as Category]++; });
    return c;
  }, [active]);
  const students = new Set(active.map((l) => l.studentId)).size;

  const visible = useMemo(() => (logs ?? []).filter((l) => (showCanceled || !l.voided) && (cat === "all" || l.category === cat)
    && (!q || normalize(l.studentName).includes(normalize(q)) || normalize(l.message).includes(normalize(q)))), [logs, showCanceled, cat, q]);

  const loc = lang === "pt" ? "pt-BR" : "en-US";
  const catLabel = (c: string) => (c in t.categories ? t.categories[c as Category] : t.otherCategory);

  async function voidOne(id: string) {
    if (!window.confirm(t.voidConfirm)) return;
    try { await voidLogFn({ logId: id }); toast(t.voidDone); void load(); } catch { toast(t.voidFailed, false); }
  }
  async function deleteOne(id: string) {
    if (!window.confirm(t.deleteConfirm)) return;
    try { await deleteLogFn({ logId: id }); toast(t.deleted); void load(); } catch { toast(t.deleteFailed, false); }
  }

  return (
    <main className="admin">
      <section className="glass pad">
        <div className="table-head"><h2>{t.myLogsTitle}</h2></div>
        <p className="muted small">{t.myLogsIntro}</p>
        <div className="manage-filters">
          <Segmented id="my-period" label={t.periodLabel} value={period} onChange={setPeriod} options={[
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
      </section>

      <section className="totals my-totals">
        {CATEGORIES.map((c, i) => (
          <motion.div key={c} className={`total-card glass ${c}`} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * .06 }}>
            <div className="tc-top"><span className="cat-icon"><CategoryIcon c={c} /></span><span>{t.categories[c]}</span></div>
            <b className="tc-num"><AnimatedNumber value={logs ? totals[c] : 0} /></b>
          </motion.div>
        ))}
        <motion.div className="total-card glass" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .18 }}>
          <div className="tc-top"><span className="cat-icon"><Users size={18} /></span><span>{t.studentsReached}</span></div>
          <b className="tc-num"><AnimatedNumber value={logs ? students : 0} /></b>
        </motion.div>
      </section>

      <section className="glass pad">
        <div className="manage-filters">
          <div className="h-chips">
            <button aria-pressed={cat === "all"} onClick={() => setCat("all")}>{t.allLabel}</button>
            {CATEGORIES.map((c) => <button key={c} className={c} aria-pressed={cat === c} onClick={() => setCat(c)}><i />{t.categories[c]}</button>)}
          </div>
          <div className="search compact"><Search size={16} /><input type="search" value={q} placeholder={t.searchStudent} onChange={(e) => setQ(e.target.value)} aria-label={t.searchStudent} /></div>
          <label className="check"><input type="checkbox" checked={showCanceled} onChange={(e) => setShowCanceled(e.target.checked)} />{t.showVoided}</label>
          <span className="muted small">{t.recordsShown(visible.length)}</span>
        </div>
        {logs === null ? <Skeleton lines={8} /> : visible.length === 0 ? <p className="empty-note">{t.noData}</p> : (
          <ul className="my-list">
            {visible.map((l) => (
              <li key={l.id} className={`${l.category} ${l.voided ? "voided" : ""}`}>
                <span className="dot" />
                <div className="my-main">
                  <div className="my-line">
                    <b>{l.studentName}</b>
                    {l.grade && <span className="muted small">{t.grade(l.grade)}</span>}
                    <span className={`tag cat-${l.category}`}>{catLabel(l.category)}</span>
                    {l.collective && <span className="tag">{t.collectiveTag}</span>}
                    {l.voided && <span className="tag bad">{t.voidedLabel}</span>}
                    <span className="spacer" />
                    <span className="muted small nowrap">{l.createdAt ? new Date(l.createdAt).toLocaleString(loc, { dateStyle: "short", timeStyle: "short" }) : ""}</span>
                  </div>
                  {open === l.id && <p className="t-msg open">{l.message}</p>}
                  <span className="t-actions">
                    {l.message && <button className="link-btn" onClick={() => setOpen(open === l.id ? null : l.id)}>{open === l.id ? <><ChevronUp size={12} />{t.showLess}</> : <><ChevronDown size={12} />{t.showMore}</>}</button>}
                    {l.canVoid && <button className="link-btn danger" onClick={() => void voidOne(l.id)}><Ban size={12} />{t.voidLog}</button>}
                    {l.canDelete && <button className="link-btn danger" onClick={() => void deleteOne(l.id)}><Trash2 size={12} />{t.deleteLog}</button>}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
