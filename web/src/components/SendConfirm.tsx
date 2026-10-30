import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useT } from "../i18n";

/**
 * Animação de envio concluído. Aparece sozinha quando a aba do Gmail fecha
 * (ou quando o professor clica em "Já enviei"). Fecha a aba do Gmail se ainda estiver aberta.
 */
export function SendConfirm({ open, gmailTab, onDone }: { open: boolean; gmailTab: Window | null; onDone: () => void }) {
  const { t } = useT();
  const reduce = useReducedMotion();
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    if (!open) return;
    // Se a aba do Gmail ainda estiver acessível e aberta, fecha (no Gmail, normalmente ela já fechou sozinha).
    try { gmailTab?.close(); } catch { /* ok */ }
    const id = window.setTimeout(() => done.current(), reduce ? 900 : 2300);
    return () => window.clearTimeout(id);
  }, [open, gmailTab, reduce]);

  const particles = Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2;
    const r = 72 + (i % 3) * 20;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r, c: ["var(--good)", "var(--academic)", "var(--brand)", "var(--behavior)"][i % 4], d: (i % 5) * 0.03 };
  });

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => done.current()}>
          <motion.div className="modal glass send-confirm" role="status" aria-live="polite"
            initial={{ opacity: 0, y: 24, scale: .94 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: .98 }}
            transition={{ type: "spring", stiffness: 320, damping: 24 }}>
            <div className="sc-art" aria-hidden="true">
              <motion.div className="sc-ok" initial={{ scale: .4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 14 }}>
                <svg viewBox="0 0 52 52" width="80" height="80">
                  <motion.circle cx="26" cy="26" r="24" fill="none" stroke="currentColor" strokeWidth="3"
                    initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: .5, ease: "easeOut" }} />
                  <motion.path d="M15 27 l7 7 l15 -16" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"
                    initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: .4, delay: .35, ease: "easeOut" }} />
                </svg>
                {!reduce && particles.map((p, i) => (
                  <motion.i key={i} style={{ background: p.c }} initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
                    animate={{ x: p.x, y: p.y, scale: [0, 1.2, .6], opacity: [1, 1, 0] }} transition={{ duration: .9, delay: .4 + p.d, ease: "easeOut" }} />
                ))}
              </motion.div>
            </div>
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .4 }}>
              <h2>{t.sendDoneTitle}</h2>
              <p className="muted">{t.sendDoneText}</p>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}