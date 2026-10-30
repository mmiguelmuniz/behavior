import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { animate, AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CheckCircle2, AlertCircle } from "lucide-react";

/* Fundo animado: manchas suaves nas cores das categorias. */
export function Aurora() {
  return (
    <div className="aurora" aria-hidden="true">
      <span className="blob b1" /><span className="blob b2" /><span className="blob b3" /><span className="blob b4" />
      <div className="grain" />
    </div>
  );
}

/* Avatar com iniciais e cor estável derivada do nome. */
export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.38, ["--h" as string]: h }} aria-hidden="true">
      {initials}
    </span>
  );
}

/* Número que conta até o valor. */
export function AnimatedNumber({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();
  const prev = useRef(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduce) { el.textContent = String(value); return; }
    const controls = animate(prev.current, value, {
      duration: 0.9, ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => { el.textContent = Math.round(v).toLocaleString(); },
    });
    prev.current = value;
    return () => controls.stop();
  }, [value, reduce]);
  return <span ref={ref} className="tnum">0</span>;
}

/* Controle segmentado com pílula deslizante. */
export function Segmented<T extends string | number>({ options, value, onChange, id, label }: {
  options: Array<{ value: T; label: ReactNode }>; value: T; onChange: (v: T) => void; id: string; label: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.value === value && <motion.span layoutId={`seg-${id}`} className="seg-pill" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
          <span className="seg-label">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

/* Toasts. */
type Toast = { id: number; text: string; ok: boolean };
const ToastCtx = createContext<(text: string, ok?: boolean) => void>(() => undefined);
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, ok = true) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, ok }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div key={t.id} className={`toast ${t.ok ? "ok" : "bad"}`} layout
              initial={{ opacity: 0, y: 24, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}>
              {t.ok ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}<span>{t.text}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}

export function Skeleton({ lines = 6 }: { lines?: number }) {
  return <div className="skeleton">{Array.from({ length: lines }, (_, i) => <span key={i} style={{ width: `${60 + ((i * 37) % 35)}%` }} />)}</div>;
}

export function relativeTime(date: Date, lang: string) {
  const rtf = new Intl.RelativeTimeFormat(lang === "pt" ? "pt-BR" : "en", { numeric: "auto" });
  const diff = (date.getTime() - Date.now()) / 1000;
  const steps: Array<[Intl.RelativeTimeFormatUnit, number]> = [["second", 60], ["minute", 60], ["hour", 24], ["day", 7], ["week", 4.35], ["month", 12]];
  let v = diff;
  for (const [unit, size] of steps) { if (Math.abs(v) < size) return rtf.format(Math.round(v), unit); v /= size; }
  return rtf.format(Math.round(v), "year");
}
