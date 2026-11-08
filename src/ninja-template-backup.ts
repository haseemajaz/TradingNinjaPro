import { z } from "zod";
import { preflightBackup, type Mode } from "./ninja-session.ts";
const MAX_BYTES = 1_000_000;
const text = z.string().max(1000);
const content = z.strictObject({ version: z.literal(1), prefs: z.record(z.string().max(100), z.union([text, z.boolean()])), indicators: z.array(text).max(100), plugins: z.array(text).max(100) });
const template = z.strictObject({ id: z.string().min(1).max(100), name: z.string().min(1).max(200), layoutType: text, isDefault: z.boolean(), panels: z.array(content).min(1).max(10), updatedAt: z.string().datetime() });
const list = z.array(template).max(500).refine((items) => new Set(items.map((t) => t.id)).size === items.length && new Set(items.map((t) => t.name)).size === items.length, "Duplicate template IDs or names.");
const schema = z.strictObject({ format: z.literal("TradingNinjaPro.chart-templates.v1"), savedAt: z.string().datetime(), templates: list });
export function parseTemplateBackup(input: string) {
  if (input.length > MAX_BYTES || new TextEncoder().encode(input).length > MAX_BYTES) throw new Error("Template backup exceeds 1 MB.");
  const data: unknown = JSON.parse(input); preflightBackup(data); return schema.parse(data);
}
export function exportTemplateBackup(storage: Storage) {
  const raw = storage.getItem("oc_chart_templates");
  if (raw && raw.length > MAX_BYTES) throw new Error("Stored templates exceed 1 MB.");
  const templates: unknown = raw === null ? [] : JSON.parse(raw);
  const result = JSON.stringify({ format: "TradingNinjaPro.chart-templates.v1", savedAt: new Date().toISOString(), templates }, null, 2);
  parseTemplateBackup(result); return result;
}
export async function restoreTemplates(storage: Storage, locks: LockManager | undefined, mode: Mode, input: string, isReady: () => boolean) {
  const backup = parseTemplateBackup(input);
  if (!locks || !isReady()) throw new Error("A saved, locked account session is required before restoring templates.");
  await locks.request(`TradingNinjaPro:${mode === "live" ? "demo" : "live"}`, { ifAvailable: true }, (lock) => {
    if (!lock) throw new Error("Close the other data-mode tab before restoring templates.");
    if (!isReady()) throw new Error("The account session is no longer ready; templates were not changed.");
    // The native terminal can remain mounted even while hidden. Refuse a restore
    // while its autosave is enabled, so an old in-memory snapshot cannot race it.
    const parsePrefs = (raw: string | null): Record<string, unknown> => {
      if (!raw) return {};
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Chart preferences could not be read safely; templates were not changed.");
      return parsed as Record<string, unknown>;
    };
    const scoped = parsePrefs(storage.getItem("trader_prefs:local-user"));
    const prefs = Object.keys(scoped).length ? scoped : parsePrefs(storage.getItem("trader_prefs"));
    if (prefs.chartTemplateAutosave === "true") throw new Error("Disable native chart template autosave before restoring templates.");
    storage.setItem("oc_chart_templates", JSON.stringify(backup.templates));
  });
}
