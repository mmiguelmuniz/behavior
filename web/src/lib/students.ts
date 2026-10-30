import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { Student } from "./types";

export const toStudent = (id: string, d: Record<string, unknown>): Student => ({
  id, name: String(d.name ?? ""), grade: Number(d.grade),
  guardianNames: (d.guardianNames as string[] | undefined) ?? [],
  parentContactReady: d.parentContactReady === true,
  studentEmailReady: d.studentEmailReady === true,
  hasPhoto: d.hasPhoto === true, photoVersion: Number(d.photoVersion ?? 0),
});

/** Alunos ativos, ordenados por ano e nome. */
export async function loadActiveStudents(): Promise<Student[]> {
  const snap = await getDocs(collection(db, "students"));
  return snap.docs
    .filter((d) => d.get("active") === true)
    .map((d) => toStudent(d.id, d.data()))
    .sort((a, b) => a.grade - b.grade || a.name.localeCompare(b.name));
}
