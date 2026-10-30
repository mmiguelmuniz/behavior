export const clean = (v: unknown) => String(v ?? "").trim();
export const normalize = (v: unknown) => clean(v).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
export const validEmail = (v: unknown): v is string =>
  typeof v === "string" && v.length <= 254 && /^[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/.test(v);
export function safeDriveUrl(v: unknown): string | null {
  try {
    const u = new URL(String(v));
    return u.protocol === "https:" && (u.hostname === "drive.google.com" || u.hostname === "docs.google.com") ? u.href : null;
  } catch { return null; }
}
export const parseEmailList = (v: string) => [...new Set(v.split(/[,;\s]+/).map((s) => s.trim().toLowerCase()).filter(validEmail))];
