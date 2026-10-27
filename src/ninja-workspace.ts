import { z } from "zod";
import { uid } from "./lib/uid.ts";

export const ASSET_CATALOG = [
  { id: "BTCUSD", name: "Bitcoin", market: "crypto", chart: "BINANCE:BTCUSDT" },
  { id: "ETHUSD", name: "Ethereum", market: "crypto", chart: "BINANCE:ETHUSDT" },
  { id: "SOLUSD", name: "Solana", market: "crypto", chart: "BINANCE:SOLUSDT" },
  { id: "BNBUSD", name: "BNB", market: "crypto", chart: "BINANCE:BNBUSDT" },
  { id: "XRPUSD", name: "XRP", market: "crypto", chart: "BINANCE:XRPUSDT" },
  { id: "ADAUSD", name: "Cardano", market: "crypto", chart: "BINANCE:ADAUSDT" },
  { id: "FX:EURUSD", name: "EUR / USD", market: "forex", chart: "FX:EURUSD" },
  { id: "FX:GBPUSD", name: "GBP / USD", market: "forex", chart: "FX:GBPUSD" },
  { id: "FX:USDJPY", name: "USD / JPY", market: "forex", chart: "FX:USDJPY" },
  { id: "FX:AUDUSD", name: "AUD / USD", market: "forex", chart: "FX:AUDUSD" },
  { id: "FX:USDCAD", name: "USD / CAD", market: "forex", chart: "FX:USDCAD" },
  { id: "FX:USDCHF", name: "USD / CHF", market: "forex", chart: "FX:USDCHF" },
  { id: "OANDA:XAUUSD", name: "Gold / USD", market: "metals", chart: "OANDA:XAUUSD" },
  { id: "OANDA:XAGUSD", name: "Silver / USD", market: "metals", chart: "OANDA:XAGUSD" },
  { id: "NASDAQ:AAPL", name: "Apple", market: "stocks", chart: "NASDAQ:AAPL" },
  { id: "NASDAQ:MSFT", name: "Microsoft", market: "stocks", chart: "NASDAQ:MSFT" },
  { id: "NASDAQ:NVDA", name: "NVIDIA", market: "stocks", chart: "NASDAQ:NVDA" },
  { id: "NASDAQ:TSLA", name: "Tesla", market: "stocks", chart: "NASDAQ:TSLA" },
  { id: "NASDAQ:AMZN", name: "Amazon", market: "stocks", chart: "NASDAQ:AMZN" },
  { id: "NASDAQ:GOOGL", name: "Alphabet", market: "stocks", chart: "NASDAQ:GOOGL" },
] as const;
export type Market = typeof ASSET_CATALOG[number]["market"];
export type View = Market | "dashboard" | "planner";
export const ConditionSchema = z.enum(["ema-cross-up", "ema-cross-down", "rsi-below-30", "rsi-above-70", "close-above-sma20", "close-below-sma20"]);
export const CONDITION_LABELS: Record<z.infer<typeof ConditionSchema>, string> = {
  "ema-cross-up": "EMA 9 crosses above EMA 21", "ema-cross-down": "EMA 9 crosses below EMA 21",
  "rsi-below-30": "RSI 14 is below 30", "rsi-above-70": "RSI 14 is above 70",
  "close-above-sma20": "Close is above SMA 20", "close-below-sma20": "Close is below SMA 20",
};
export const PlanSchema = z.object({
  id: z.string().min(1).max(100), name: z.string().trim().min(1).max(80),
  asset: z.string().refine((s) => ASSET_CATALOG.some((a) => a.id === s)),
  timeframe: z.enum(["15m", "1h", "4h", "1d"]), side: z.enum(["long", "short"]),
  conditions: z.array(ConditionSchema).min(1).max(6),
  riskPercent: z.number().finite().positive().max(10), stopPercent: z.number().finite().positive().max(50),
  targetR: z.number().finite().min(0.1).max(20), notes: z.string().max(4000),
  checked: z.array(z.string().max(100)).max(12), updatedAt: z.string().datetime(),
});
export type StrategyPlan = z.infer<typeof PlanSchema>;
export const WorkspaceSchema = z.object({
  lists: z.array(z.object({ id: z.string().min(1).max(100), name: z.string().trim().min(1).max(50), assets: z.array(z.string().refine((s) => ASSET_CATALOG.some((a) => a.id === s))).max(30) })).min(1).max(8),
  activeList: z.string().max(100), chartCount: z.union([z.literal(1), z.literal(2), z.literal(4)]),
  chartAssets: z.array(z.string().refine((s) => ASSET_CATALOG.some((a) => a.id === s))).length(4),
  plans: z.array(PlanSchema).max(100),
}).superRefine((w, ctx) => {
  if (new Set(w.lists.map((l) => l.id)).size !== w.lists.length || !w.lists.some((l) => l.id === w.activeList)) ctx.addIssue({ code: "custom", message: "Invalid watchlist identity." });
  if (w.lists.some((l) => new Set(l.assets).size !== l.assets.length)) ctx.addIssue({ code: "custom", message: "Duplicate watchlist assets." });
  if (new Set(w.plans.map((p) => p.id)).size !== w.plans.length) ctx.addIssue({ code: "custom", message: "Duplicate strategy IDs." });
});
export type Workspace = z.infer<typeof WorkspaceSchema>;
export function defaultWorkspace(): Workspace {
  return { lists: [{ id: "core", name: "My markets", assets: ["BTCUSD", "ETHUSD", "FX:EURUSD", "OANDA:XAUUSD", "NASDAQ:AAPL"] }], activeList: "core", chartCount: 2, chartAssets: ["BTCUSD", "FX:EURUSD", "OANDA:XAUUSD", "NASDAQ:AAPL"], plans: [] };
}
export function newPlan(): StrategyPlan {
  return { id: uid(), name: "EMA trend checklist", asset: "BTCUSD", timeframe: "1h", side: "long", conditions: ["ema-cross-up", "close-above-sma20"], riskPercent: 1, stopPercent: 2, targetR: 2, notes: "", checked: [], updatedAt: new Date().toISOString() };
}
export const JOURNAL_SCHEMA = z.array(z.object({
  id: z.string().max(100), accountId: z.string().max(100), positionId: z.string().max(100).nullable().optional(),
  symbolName: z.string().max(100).nullable().optional(), side: z.string().max(20).nullable().optional(),
  entryPrice: z.number().finite().nullable().optional(), exitPrice: z.number().finite().nullable().optional(), pnl: z.number().finite().nullable().optional(),
  emotion: z.string().max(100).nullable().optional(), setupType: z.string().max(200).nullable().optional(),
  rating: z.number().finite().min(0).max(5).nullable().optional(), tags: z.array(z.string().max(100)).max(30),
  notes: z.string().max(20000), createdAt: z.string().datetime(),
})).max(5000);

export function downloadText(name: string, text: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
