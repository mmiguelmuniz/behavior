import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { onAuthStateChanged, signInWithPopup, signOut, User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db, googleProvider } from "./firebase";

export type Role = "admin" | "teacher" | "psychologist" | "substitute" | "office";
const ROLES: Role[] = ["admin", "teacher", "psychologist", "substitute", "office"];
export interface Staff { email: string; name: string; role: Role; division: string; canSeeCounts: boolean }

type AuthState =
  | { status: "loading" }
  | { status: "signedOut"; error?: string }
  | { status: "unauthorized"; user: User }
  | { status: "ready"; user: User; staff: Staff };

interface AuthApi { state: AuthState; signIn: () => Promise<void>; signOut: () => Promise<void> }
const Ctx = createContext<AuthApi | null>(null);

const SCHOOL_DOMAIN = "@ear.com.br";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  useEffect(() => onAuthStateChanged(auth, async (user) => {
    if (!user) { setState((s) => (s.status === "signedOut" ? s : { status: "signedOut" })); return; }
    const email = (user.email ?? "").toLowerCase();
    if (!email.endsWith(SCHOOL_DOMAIN) || !user.emailVerified) {
      await signOut(auth);
      setState({ status: "signedOut", error: "domain" });
      return;
    }
    try {
      const snap = await getDoc(doc(db, "staff", email));
      const data = snap.data();
      if (!snap.exists() || data?.active !== true) { setState({ status: "unauthorized", user }); return; }
      setState({
        status: "ready", user,
        staff: {
          email, name: data.name ?? email,
          role: ROLES.includes(data.role) ? data.role : "teacher",
          division: data.division ?? "", canSeeCounts: data.canSeeCounts === true,
        },
      });
    } catch {
      setState({ status: "unauthorized", user });
    }
  }), []);

  const doSignIn = useCallback(async () => {
    try { await signInWithPopup(auth, googleProvider); }
    catch (e) {
      const code = (e as { code?: string }).code ?? "";
      // Bloqueio da blocking function aparece como erro de login.
      setState({ status: "signedOut", error: code.includes("blocking") || code.includes("permission") ? "blocked" : "failed" });
    }
  }, []);
  const doSignOut = useCallback(() => signOut(auth), []);
  const api = useMemo<AuthApi>(() => ({ state, signIn: doSignIn, signOut: doSignOut }), [state, doSignIn, doSignOut]);
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth fora do AuthProvider");
  return v;
}