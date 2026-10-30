import { useEffect, useRef, useState } from "react";
import { getBlob, ref } from "firebase/storage";
import { storage } from "../firebase";
import { Avatar } from "./ui";

// Cache em memória (só nesta aba): nada é salvo no disco do navegador.
const cache = new Map<string, Promise<string | null>>();

function loadPhoto(studentId: string, version: number) {
  const key = `${studentId}@${version}`;
  if (!cache.has(key)) {
    // getBlob respeita as regras do Storage (só equipe autorizada); não gera link público.
    cache.set(key, getBlob(ref(storage, `student-photos/${studentId}`)).then((b) => URL.createObjectURL(b)).catch(() => null));
  }
  return cache.get(key)!;
}

/**
 * Foto do aluno (ou iniciais, se não houver).
 * Com `lazy`, só baixa quando aparece na tela — a lista não baixa 270 fotos de uma vez.
 */
export function StudentPhoto({ studentId, name, hasPhoto, version, size = 72, lazy = false }: {
  studentId: string; name: string; hasPhoto: boolean; version: number; size?: number; lazy?: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [visible, setVisible] = useState(!lazy);
  const slot = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (visible || !hasPhoto || !slot.current) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setVisible(true); io.disconnect(); }
    }, { rootMargin: "200px" });
    io.observe(slot.current);
    return () => io.disconnect();
  }, [visible, hasPhoto]);

  useEffect(() => {
    let alive = true;
    setUrl(null);
    if (hasPhoto && visible) void loadPhoto(studentId, version).then((u) => { if (alive) setUrl(u); });
    return () => { alive = false; };
  }, [studentId, hasPhoto, version, visible]);

  return (
    <span ref={slot} className="photo-slot" style={{ width: size, height: size }}>
      {url
        ? <img className="student-photo" src={url} alt="" width={size} height={size} style={{ width: size, height: size }} />
        : <Avatar name={name} size={size} />}
    </span>
  );
}