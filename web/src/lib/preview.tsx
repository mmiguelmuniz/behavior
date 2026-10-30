import { createContext, ReactNode, useContext, useState } from "react";
import type { Role } from "../auth";

/** Pessoa que o ADMIN está simulando em "Ver como". Só leitura: nada é gravado em nome dela. */
export interface PreviewPerson { email: string; name: string; role: Role; canSeeCounts: boolean }

const Ctx = createContext<{ person: PreviewPerson | null; setPerson: (p: PreviewPerson | null) => void }>({ person: null, setPerson: () => undefined });

export function PreviewProvider({ children }: { children: ReactNode }) {
  const [person, setPerson] = useState<PreviewPerson | null>(null);
  return <Ctx.Provider value={{ person, setPerson }}>{children}</Ctx.Provider>;
}
export const usePreview = () => useContext(Ctx);
