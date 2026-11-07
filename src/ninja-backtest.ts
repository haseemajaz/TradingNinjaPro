import { ema, rsi, sma, type CandleData } from "./lib/indicators.ts";
import type { StrategyPlan } from "./ninja-workspace.ts";

export type BacktestTrade = { entryTime: number; exitTime: number; side: "long" | "short"; entry: number; exit: number; quantity: number; fees: number; pnl: number; reason: "stop" | "target" | "end" };
export type BacktestConfig = { quantity: number; feePercent: number; slippagePercent: number };

/** One position at a time, no lookahead: signal on close; entry at next open. */
export function runBacktest(candles: CandleData[], plan: StrategyPlan, config: BacktestConfig): BacktestTrade[] {
  if (candles.length < 30 || candles.length > 1000) throw new Error("Backtest requires 30–1000 completed candles.");
  if (!Number.isFinite(config.quantity) || config.quantity <= 0 || config.quantity > 1000 || !Number.isFinite(config.feePercent) || config.feePercent < 0 || config.feePercent > 5 || !Number.isFinite(config.slippagePercent) || config.slippagePercent < 0 || config.slippagePercent > 5) throw new Error("Check quantity, fee and slippage limits.");
  if (!plan.conditions.length || !Number.isFinite(plan.stopPercent) || plan.stopPercent <= 0 || plan.stopPercent > 50 || !Number.isFinite(plan.targetR) || plan.targetR <= 0 || plan.targetR > 20) throw new Error("Choose valid strategy rules, stop and target.");
  if (plan.side === "short" && plan.stopPercent * plan.targetR >= 100) throw new Error("Short target must remain above zero. Reduce stop distance or target multiple.");
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i]!;
    if (![c.time,c.open,c.high,c.low,c.close].every(Number.isFinite) || !Number.isInteger(c.time) || c.time <= 0 || c.time > 8640000000000 || c.open <= 0 || c.close <= 0 || c.low <= 0 || c.high > 1e12 || c.high < Math.max(c.open,c.close) || c.low > Math.min(c.open,c.close) || (i > 0 && c.time <= candles[i-1]!.time)) throw new Error("Provider returned invalid or unordered candles.");
  }
  const lookup = (a: { time: number; value: number }[]) => new Map(a.map((p) => [p.time, p.value]));
  const fast = lookup(ema(candles,9)), slow = lookup(ema(candles,21)), rsis = lookup(rsi(candles,14)), averages = lookup(sma(candles,20));
  const signal = (i: number) => {
    if (i < 1) return false;
    const c = candles[i]!, prev = candles[i-1]!, f = fast.get(c.time), s = slow.get(c.time), pf = fast.get(prev.time), ps = slow.get(prev.time), r = rsis.get(c.time), avg = averages.get(c.time);
    return plan.conditions.every((rule) => {
      switch(rule) {
        case "ema-cross-up": return f != null && s != null && pf != null && ps != null && pf <= ps && f > s;
        case "ema-cross-down": return f != null && s != null && pf != null && ps != null && pf >= ps && f < s;
        case "rsi-below-30": return r != null && r < 30;
        case "rsi-above-70": return r != null && r > 70;
        case "close-above-sma20": return avg != null && c.close > avg;
        case "close-below-sma20": return avg != null && c.close < avg;
      }
    });
  };
  const long = plan.side === "long", slip = config.slippagePercent / 100, fee = config.feePercent / 100;
  let pending = false;
  let position: { time: number; entry: number; stop: number; target: number } | null = null;
  const trades: BacktestTrade[] = [];
  for (let i = 0; i < candles.length; i++) {
    const bar = candles[i]!;
    if (pending) {
      const entry = bar.open * (long ? 1 + slip : 1 - slip), distance = entry * plan.stopPercent / 100;
      position = { time: bar.time, entry, stop: entry + (long ? -distance : distance), target: entry + (long ? distance : -distance) * plan.targetR };
      pending = false;
    }
    if (position) {
      const hitStop = long ? bar.low <= position.stop : bar.high >= position.stop;
      const hitTarget = long ? bar.high >= position.target : bar.low <= position.target;
      const reason: BacktestTrade["reason"] | null = hitStop ? "stop" : hitTarget ? "target" : i === candles.length - 1 ? "end" : null;
      if (reason) {
        // If both levels are hit, pessimistically assume stop first. Gaps through
        // a stop fill at the worse open; targets do not receive gap improvement.
        const raw = reason === "stop" ? (long ? Math.min(position.stop, bar.open) : Math.max(position.stop, bar.open)) : reason === "target" ? position.target : bar.close;
        const exit = raw * (long ? 1 - slip : 1 + slip);
        const fees = (position.entry + exit) * config.quantity * fee;
        const pnl = (exit - position.entry) * (long ? 1 : -1) * config.quantity - fees;
        trades.push({ entryTime: position.time, exitTime: bar.time, side: plan.side, entry: position.entry, exit, quantity: config.quantity, fees, pnl, reason });
        position = null;
      }
    }
    if (!position && i < candles.length - 1 && signal(i)) pending = true;
  }
  return trades;
}
