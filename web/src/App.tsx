import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { LogOut, Eye, Languages } from "lucide-react";
import { Role, useAuth } from "./auth";
import { useT } from "./i18n";
import { StudentsPage } from "./pages/StudentsPage";
import { AdminPage } from "./pages/AdminPage";
import { CollectivePage } from "./pages/CollectivePage";
import { ReportsPage } from "./pages/ReportsPage";
import { MyLogsPage } from "./pages/MyLogsPage";
import { PreviewPicker } from "./components/PreviewPicker";
import { FeedbackButton } from "./components/FeedbackButton";
import { usePreview } from "./lib/preview";
import { clearAllDrafts } from "./lib/drafts";
import { Aurora, Avatar, Segmented } from "./components/ui";
import { GoogleMark } from "./components/icons";
import logoFull from "./assets/ear-logo.png";
import logoEagle from "./assets/ear-eagle.png";

const IDLE_MINUTES = 15;

function useIdleSignOut(active: boolean, onIdle: () => void) {
  useEffect(() => {
    if (!active) return;
    let timer = window.setTimeout(onIdle, IDLE_MINUTES * 60_000);
    const reset = () => { window.clearTimeout(timer); timer = window.setTimeout(onIdle, IDLE_MINUTES * 60_000); };
    const events = ["pointerdown", "keydown", "scroll"] as const;
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    return () => { window.clearTimeout(timer); events.forEach((e) => window.removeEventListener(e, reset)); };
  }, [active, onIdle]);
}

function LangSwitch() {
  const { lang, setLang } = useT();
  return (
    <button className="icon-btn lang-btn" onClick={() => setLang(lang === "en" ? "pt" : "en")} aria-label="Language / Idioma">
      <Languages size={16} /><span>{lang === "en" ? "EN" : "PT"}</span>
    </button>
  );
}

export function App() {
  const { state, signIn, signOut } = useAuth();
  const { t } = useT();
  const [tab, setTab] = useState<"students" | "collective" | "mine" | "reports" | "admin">("students");
  const { person: previewPerson, setPerson: setPreviewPerson } = usePreview();
  const [idleNote, setIdleNote] = useState(false);
  const onIdle = useCallback(() => { setIdleNote(true); void signOut(); }, [signOut]);
  useIdleSignOut(state.status === "ready", onIdle);

  if (state.status === "loading") {
    return <><Aurora /><main className="center"><div className="loader" aria-label={t.loading} /></main></>;
  }

  if (state.status !== "ready") {
    const error = state.status === "signedOut" && state.error
      ? ({ domain: t.errDomain, blocked: t.errBlocked, failed: t.errFailed } as Record<string, string>)[state.error]
      : null;
    return (
      <>
        <Aurora />
        <main className="center">
          <motion.section className="gate glass" initial={{ opacity: 0, y: 24, filter: "blur(8px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}>
            <div className="gate-top"><img className="gate-logo" src={logoFull} alt={t.school} /><LangSwitch /></div>
            <h1>{t.appName}</h1>
            {state.status === "unauthorized" ? (
              <>
                <p className="callout bad" role="alert">{t.unauthorized}</p>
                <button className="btn" onClick={() => void signOut()}><LogOut size={16} />{t.signOut}</button>
              </>
            ) : (
              <>
                <p className="muted">{t.signInIntro}</p>
                {idleNote && <p className="callout">{t.lockedIdle}</p>}
                {error && <p className="callout bad" role="alert">{error}</p>}
                <button className="btn google" onClick={() => { setIdleNote(false); void signIn(); }}><GoogleMark />{t.signIn}</button>
              </>
            )}
          </motion.section>
        </main>
      </>
    );
  }

  const isAdmin = state.staff.role === "admin";
  const preview = isAdmin ? previewPerson : null;
  const effectiveRole: Role = preview ? preview.role : state.staff.role;
  const firstName = state.staff.name.split(" ")[0];
  // Em "ver como", tudo é somente leitura: nada é gravado em nome de outra pessoa.
  const canWrite = !preview && effectiveRole !== "office";
  // Relatórios fora do Admin: psicólogas e Learning Support (o servidor limita o escopo).
  const canReports = preview
    ? preview.role === "admin" || preview.role === "psychologist" || preview.canSeeCounts
    : !isAdmin && (state.staff.role === "psychologist" || state.staff.canSeeCounts);
  const view = tab === "admin" && isAdmin && !preview ? "admin"
    : tab === "collective" && canWrite ? "collective"
    : tab === "mine" && canWrite ? "mine"
    : tab === "reports" && canReports ? "reports" : "students";
  const tabOptions = [
    { value: "students" as const, label: t.students },
    ...(canWrite ? [{ value: "collective" as const, label: t.collectiveTab }, { value: "mine" as const, label: t.myLogsTab }] : []),
    ...(canReports ? [{ value: "reports" as const, label: t.reportsTab }] : []),
    ...(isAdmin && !preview ? [{ value: "admin" as const, label: t.admin }] : []),
  ];
  const doSignOut = () => { clearAllDrafts(state.staff.email); setPreviewPerson(null); void signOut(); };

  return (
    <>
      <Aurora />
      <div className="shell">
        <header className="topbar glass no-print">
          <div className="brand"><img className="brand-mark" src={logoEagle} alt="" /><div><strong>{t.appName}</strong><span>{t.welcome(firstName)} · {t.roles[state.staff.role]}</span></div></div>
          {tabOptions.length > 1 && (
            <Segmented id="tab" label="View" value={view} onChange={setTab} options={tabOptions} />
          )}
          <div className="top-actions">
            {isAdmin && <PreviewPicker />}
            <LangSwitch />
            <span className="me"><Avatar name={state.staff.name} size={32} /><span className="hide-sm">{state.staff.email}</span></span>
            <button className="icon-btn" onClick={doSignOut} aria-label={t.signOut} title={t.signOut}><LogOut size={16} /></button>
          </div>
        </header>
        <AnimatePresence>
          {preview && (
            <motion.p className="preview-banner no-print" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
              <Eye size={15} /> <span>{t.previewAsBanner(preview.name, t.roles[preview.role])}</span>
              <button className="link-btn" onClick={() => setPreviewPerson(null)}>{t.exitPreview}</button>
            </motion.p>
          )}
        </AnimatePresence>
        <AnimatePresence mode="wait">
          <motion.div key={view + effectiveRole + (preview?.email ?? "")} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.28, ease: "easeOut" }}>
            {view === "admin" ? <AdminPage /> : view === "collective" ? <CollectivePage /> : view === "mine" ? <MyLogsPage /> : view === "reports" ? <main className="admin"><ReportsPage /></main> : <StudentsPage role={effectiveRole} />}
          </motion.div>
        </AnimatePresence>
        {!preview && <FeedbackButton page={view} />}
      </div>
    </>
  );
}