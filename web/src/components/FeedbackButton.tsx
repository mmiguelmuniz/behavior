import { useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { MessageSquarePlus, X, Send } from "lucide-react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";
import { useT } from "../i18n";
import { Segmented, useToast } from "./ui";

const sendFn = httpsCallable<object, { ok: boolean }>(functions, "sendfeedback");
const MAX = 1200;
type FbType = "suggestion" | "problem" | "praise";

/** Botão flutuante para a equipe enviar sugestões, problemas ou elogios. */
export function FeedbackButton({ page }: { page: string }) {
  const { t } = useT();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<FbType>("suggestion");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    try { await sendFn({ type, message, page }); toast(t.feedbackThanks); setMessage(""); setOpen(false); }
    catch { toast(t.saveFailed, false); }
    finally { setBusy(false); }
  }

  return (
    <>
      <button className="feedback-fab no-print" onClick={() => setOpen(true)}><MessageSquarePlus size={17} /><span>{t.feedbackButton}</span></button>
      {createPortal(<AnimatePresence>
        {open && (
          <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)}>
            <motion.div className="modal glass" role="dialog" aria-modal="true" aria-label={t.feedbackTitle}
              initial={{ opacity: 0, y: 20, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10 }} onClick={(e) => e.stopPropagation()}>
              <div className="table-head"><h2>{t.feedbackTitle}</h2><button className="icon-btn ghost" onClick={() => setOpen(false)} aria-label="Close"><X size={18} /></button></div>
              <p className="muted">{t.feedbackIntro}</p>
              <Segmented id="fb-type" label={t.feedbackTitle} value={type} onChange={setType} options={[
                { value: "suggestion" as const, label: t.fbSuggestion }, { value: "problem" as const, label: t.fbProblem }, { value: "praise" as const, label: t.fbPraise }]} />
              <label className="message">
                <span className="sr-only">{t.message}</span>
                <textarea rows={6} maxLength={MAX} value={message} placeholder={t.feedbackPlaceholder} onChange={(e) => setMessage(e.target.value)} />
                <span className="char-count">{message.length}/{MAX}</span>
              </label>
              <p className="muted small">{t.feedbackPrivacy}</p>
              <div className="actions">
                <button className="btn primary" disabled={busy || message.trim().length < 3} onClick={() => void send()}><Send size={16} />{t.send}</button>
                <button className="btn" onClick={() => setOpen(false)}>{t.cancel}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>, document.body)}
    </>
  );
}
