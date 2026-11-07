import { z } from "zod";
import { ASSET_CATALOG } from "./ninja-workspace.ts";
import { preflightBackup, type Mode } from "./ninja-session.ts";

const MAX_BYTES = 1_000_000;
const number = z.number().finite().min(-1e15).max(1e15);
const short = z.string().max(20_000);
const DrawingSchema = z.strictObject({
  id: z.string().min(1).max(100),
  type: z.enum(["trendline", "horizontal", "fibonacci", "rectangle", "vertical", "channel", "text", "fibextension", "ellipse", "arrow", "triangle", "position"]),
  price: number, price2: number.optional(), time: number.optional(), time2: number.optional(), price3: number.optional(), time3: number.optional(), color: short,
  width: number.optional(), lineStyle: z.enum(["solid", "dashed", "dotted"]).optional(), locked: z.boolean().optional(), extendLeft: z.boolean().optional(), extendRight: z.boolean().optional(), hidden: z.boolean().optional(), zIndex: number.optional(), createdTf: short.optional(), visibility: z.enum(["all", "tf"]).optional(),
  fillColor: short.optional(), fillOpacity: number.optional(), arrowStart: z.boolean().optional(), arrowEnd: z.boolean().optional(), text: short.optional(), fontSize: number.optional(), bold: z.boolean().optional(), italic: z.boolean().optional(), textBg: z.boolean().optional(), textBgColor: short.optional(), textBorder: z.boolean().optional(), textBorderColor: short.optional(), fibLevels: z.array(number).max(100).optional(), side: z.enum(["long", "short"]).optional(), stopPrice: number.optional(), targetPrice: number.optional(), riskPct: number.optional(), alertEnabled: z.boolean().optional(), alertMessage: short.optional(),
});
const DrawingList = z.array(DrawingSchema).max(1000).refine((items) => new Set(items.map((d) => d.id)).size === items.length, "Duplicate drawing IDs.");
const DrawingBackup = z.strictObject({ format: z.literal("TradingNinjaPro.drawings.v1"), symbol: z.string().refine((id) => ASSET_CATALOG.some((a) => a.market === "crypto" && a.id === id)), savedAt: z.string().datetime(), drawings: DrawingList });
export function parseDrawingBackup(text: string, symbol: string) {
  if (text.length > MAX_BYTES) throw new Error("Drawing backup exceeds the 1 MB limit.");
  const parsed: unknown = JSON.parse(text);
  preflightBackup(parsed);
  const backup = DrawingBackup.parse(parsed);
  if (backup.symbol !== symbol) throw new Error(`This backup is for ${backup.symbol}; select that instrument before restoring.`);
  return backup;
}
export function exportDrawingBackup(storage: Storage, symbol: string) {
  const raw = storage.getItem(`oc_drawings_${symbol}`);
  if (raw && raw.length > MAX_BYTES) throw new Error("Stored drawings exceed the 1 MB limit; nothing was changed.");
  const drawings: unknown = raw === null ? [] : JSON.parse(raw);
  const backup = { format: "TradingNinjaPro.drawings.v1", symbol, savedAt: new Date().toISOString(), drawings };
  const text = JSON.stringify(backup, null, 2);
  parseDrawingBackup(text, symbol); // Never silently omit unknown or invalid saved fields.
  return text;
}
export async function restoreDrawings(storage: Storage, locks: LockManager | undefined, mode: Mode, text: string, symbol: string, isReady: () => boolean) {
  const backup = parseDrawingBackup(text, symbol);
  if (!locks || !isReady()) throw new Error("A saved, locked account session is required before restoring drawings.");
  const other = mode === "live" ? "demo" : "live";
  await locks.request(`TradingNinjaPro:${other}`, { ifAvailable: true }, (lock) => {
    if (!lock) throw new Error("Close the other data-mode tab before restoring drawings.");
    if (!isReady()) throw new Error("The account session is no longer ready; drawings were not changed.");
    storage.setItem(`oc_drawings_${symbol}`, JSON.stringify(backup.drawings));
  });
}
