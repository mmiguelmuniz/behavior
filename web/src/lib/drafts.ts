/**
 * Rascunho salvo automaticamente neste navegador, por pessoa e por aluno.
 * Expira em 24 h, é apagado ao salvar o registro e ao clicar em "Sair".
 */
export interface SavedDraft { category: string | null; message: string; bcc: string; savedAt: number; extra?: string[] }

const PREFIX = "hub-draft:";
const TTL = 24 * 3_600_000;
const key = (user: string, scope: string) => `${PREFIX}${user}:${scope}`;

export function loadDraft(user: string, scope: string): SavedDraft | null {
  try {
    const raw = localStorage.getItem(key(user, scope));
    if (!raw) return null;
    const d = JSON.parse(raw) as SavedDraft;
    if (!d || typeof d.message !== "string" || Date.now() - d.savedAt > TTL) { localStorage.removeItem(key(user, scope)); return null; }
    return d;
  } catch { return null; }
}

export function saveDraft(user: string, scope: string, d: Omit<SavedDraft, "savedAt">) {
  try {
    if (!d.message.trim() && !d.category) { localStorage.removeItem(key(user, scope)); return null; }
    const full = { ...d, savedAt: Date.now() };
    localStorage.setItem(key(user, scope), JSON.stringify(full));
    return full;
  } catch { return null; }
}

export function clearDraft(user: string, scope: string) {
  try { localStorage.removeItem(key(user, scope)); } catch { /* ok */ }
}

/** Apaga todos os rascunhos desta pessoa (e os expirados de qualquer pessoa). */
export function clearAllDrafts(user: string) {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (!k?.startsWith(PREFIX)) continue;
      if (k.startsWith(`${PREFIX}${user}:`)) { localStorage.removeItem(k); continue; }
      try { const d = JSON.parse(localStorage.getItem(k) ?? "{}"); if (Date.now() - (d.savedAt ?? 0) > TTL) localStorage.removeItem(k); }
      catch { localStorage.removeItem(k); }
    }
  } catch { /* ok */ }
}
