import { describe, it, expect } from "vitest";
import { newPlan } from "./ninja-workspace.ts";
import { runBacktest } from "./ninja-backtest.ts";
import type { CandleData } from "./lib/indicators.ts";
const bars = (): CandleData[] => Array.from({ length: 35 }, (_,i) => ({ time: 1700000000 + i*3600, open:i < 19 ? 99 : 100, high:i < 19 ? 99.5 : 100.5, low:i < 19 ? 98.5 : 99.5, close:i < 19 ? 99 : 100, volume:1 }));
const plan = () => ({ ...newPlan(), conditions: ["close-above-sma20"] as const, stopPercent:1, targetR:1 });
const config = { quantity:1, feePercent:0, slippagePercent:0 };
describe("crypto backtest", () => {
  it("uses completed signal close and next open and resolves ambiguous candles conservatively", () => {
    const data=bars(); data[20]={...data[20]!,high:102,low:98};
    const trades=runBacktest(data,{...plan(),conditions:[...plan().conditions]},config);
    expect(trades[0]?.entryTime).toBe(data[20]!.time); expect(trades[0]?.reason).toBe("stop"); expect(trades[0]?.pnl).toBe(-1);
  });
  it("fills adverse stop gaps at the open and accounts for costs", () => {
    const data=bars(); data[21]={...data[21]!,open:85,high:86,low:84,close:85};
    const trades=runBacktest(data,{...plan(),conditions:[...plan().conditions]},{...config,feePercent:0.1});
    expect(trades[0]?.reason).toBe("stop"); expect(trades[0]?.exit).toBe(85); expect(trades[0]?.fees).toBeCloseTo(.185); expect(trades[0]?.pnl).toBeCloseTo(-15.185);
  });
  it("closes open positions on the last bar and charges adverse slippage on both fills", () => {
    const trades=runBacktest(bars(),{...plan(),conditions:[...plan().conditions],stopPercent:20,targetR:2},{...config,slippagePercent:.1});
    expect(trades).toHaveLength(1); expect(trades[0]?.reason).toBe("end"); expect(trades[0]?.entry).toBeCloseTo(100.1); expect(trades[0]?.exit).toBeCloseTo(99.9); expect(trades[0]?.pnl).toBeCloseTo(-.2);
  });
  it("rejects short targets at or below zero and malformed candles", () => {
    expect(()=>runBacktest(bars(),{...plan(),conditions:[...plan().conditions],side:"short",stopPercent:20,targetR:5},config)).toThrow(/above zero/);
    const bad=bars(); bad[4]={...bad[4]!,time:bad[3]!.time}; expect(()=>runBacktest(bad,{...plan(),conditions:[...plan().conditions]},config)).toThrow(/unordered/);
  });
});
