export const REGION = "southamerica-east1";

export const ALLOWED_DOMAIN = "ear.com.br";

export const CATEGORIES = ["good", "behavior", "academic"] as const;
export type Category = (typeof CATEGORIES)[number];

export const isCategory = (v: unknown): v is Category =>
  typeof v === "string" && (CATEGORIES as readonly string[]).includes(v);
