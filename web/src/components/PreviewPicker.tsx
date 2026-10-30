import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Eye, Search } from "lucide-react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth, Role } from "../auth";
import { useT } from "../i18n";
import { normalize } from "../lib/text";
import { PreviewPerson, usePreview } from "../lib/preview";
import { Avatar } from "./ui";

const ROLES: Role[] = ["admin", "teacher", "psychologist", "substitute", "office"];

/** Botão "Ver como…": o ADMIN escolhe uma pessoa da equipe para simular a visão dela. */
export function PreviewPicker() {
  const { t } = useT();
  const { state } = useAuth();
  const { person, setPerson } = usePreview();
  const me = state.status === "ready" ? state.staff.email : "";
  const [open, setOpen] = useState(false);
  const [people, setPeople] = useState<PreviewPerson[] | null>(null);
  const [q, setQ] = useState("");
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || people) return;
    void getDocs(collection(db, "staff")).then((snap) => setPeople(snap.docs
      .filter((d) => d.id !== me && d.get("active") === true)
      .map((d) => ({ email: d.id, name: d.get("name") ?? d.id, role: (ROLES.includes(d.get("role")) ? d.get("role") : "teacher") as Role, canSeeCounts: d.get("canSeeCounts") === true }))
      .sort((a, b) => a.name.localeCompare(b.name))));
  }, [open, people, me]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const list = useMemo(() => (people ?? []).filter((p) => !q || normalize(p.name).includes(normalize(q)) || p.email.includes(q.toLowerCase())), [people, q]);

  return (
    <div className="preview-picker" ref={box}>
      <button className={`icon-btn ${person ? "on" : ""}`} aria-expanded={open} onClick={() => setOpen((o) => !o)} title={t.previewAs}>
        <Eye size={16} /><span className="hide-sm">{person ? person.name.split(" ")[0] : t.previewAs}</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div className="picker-pop glass" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
            <div className="search compact"><Search size={15} /><input autoFocus placeholder={t.searchStaff} value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <ul>
              {people === null && <li className="muted small">{t.loading}</li>}
              {list.map((p) => (
                <li key={p.email}>
                  <button onClick={() => { setPerson(p); setOpen(false); }}>
                    <Avatar name={p.name} size={28} />
                    <span className="person"><b>{p.name}</b><small>{t.roles[p.role]}{p.canSeeCounts ? ` · ${t.seesCountsShort}` : ""}</small></span>
                  </button>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
