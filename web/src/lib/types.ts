export type Category = "good" | "behavior" | "academic";
/** Registros importados do Drive podem ter a categoria "other". */
export type HistoryCategory = Category | "other";
export const CATEGORIES: Category[] = ["good", "behavior", "academic"];
export interface Student {
  id: string; name: string; grade: number;
  guardianNames: string[]; parentContactReady: boolean; studentEmailReady: boolean;
  hasPhoto: boolean; photoVersion: number;
}
export type Counts = Record<Category, number>;
export interface LogEntry {
  id: string; category: HistoryCategory; message: string; authorName: string; createdAt: string | null;
  voided: boolean; canVoid: boolean; canDelete: boolean; mine: boolean; legacy: boolean; sourceUrl: string | null;
}
export interface DriveDoc { title: string; url: string }