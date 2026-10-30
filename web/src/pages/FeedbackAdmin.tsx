import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, RotateCcw, Inbox } from "lucide-react";
import { collection, getDocs, limit, orderBy, query, Timestamp } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../firebase";
import { useT } from "../i18n";
import { Segmented, Skeleton, relativeTime, useToast } from "../components/ui";

interface Fb { id: string; type: string; message: string; authorName: string; role: string; page: string; status: string; createdAt?: Timestamp }
const statusFn = httpsCallable<object, { ok: boolean }>(functions, "setfeedbackstatus");

export function FeedbackAdmin() {
  const { t, lang } = useT();
  const toast = useToast();
  const [items, setItems] = useState<Fb[] | null>(null);
  const [filter, setFilter] = useState<"new" | "all">("new");

  const load = useCallback(async () => {
    const snap = await getDocs(query(collection(db, "feedback"), orderBy("createdAt", "desc"), limit(300)));
    setItems(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Fb, "id">) })));
  }, []);
  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => (items ?? []).filter((i) => filter === "all" || i.status !== "resolved"), [items, filter]);
  const typeLabel = (x: string) => ({ suggestion: t.fbSuggestion, problem: t.fbProblem, praise: t.fbPraise } as Record<string, string>)[x] ?? x;

  async function setStatus(id: string, status: "new" | "resolved") {
    try { await statusFn({ id, status }); void load(); } catch { toast(t.saveFailed, false); }
  }

  return (
    <section className="glass pad">
      <div className="table-head">
        <h2>{t.feedbackAdminTitle}</h2>
        <Segmented id="fb-filter" label={t.filter} value={filter} onChange={setFilter} options={[{ value: "new" as const, label: t.fbOpen }, { value: "all" as const, label: t.fbAll }]} />
      </div>
      {items === null ? <Skeleton lines={6} /> : visible.length === 0 ? <p className="empty-note"><Inbox size={16} />{t.fbNone}</p> : (
        <ul className="fb-list">
          {visible.map((f) => (
            <li key={f.id} className={f.status === "resolved" ? "done" : ""}>
              <div className="fb-head">
                <span className={`tag fb-${f.type}`}>{typeLabel(f.type)}</span>
                <b>{f.authorName}</b><span className="muted small">{t.roles[f.role as keyof typeof t.roles] ?? f.role} · {f.createdAt ? relativeTime(f.createdAt.toDate(), lang) : ""}</span>
                <span className="spacer" />
                {f.status === "resolved"
                  ? <button className="link-btn" onClick={() => void setStatus(f.id, "new")}><RotateCcw size={13} />{t.fbReopen}</button>
                  : <button className="link-btn" onClick={() => void setStatus(f.id, "resolved")}><CheckCircle2 size={13} />{t.fbResolve}</button>}
              </div>
              <p className="fb-msg">{f.message}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
