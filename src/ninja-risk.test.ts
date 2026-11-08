import { describe, expect, it } from "vitest";
import { calculateRisk, type RiskInputs } from "./ninja-risk.ts";
const base: RiskInputs = { balance: 10000, riskPercent: 1, side: "long", entry: 100, stop: 98, target: 104, contractSize: 1, feeBps: 0, slippageBps: 0, leverage: 1 };
describe("cost-aware risk scenarios", () => {
  it("computes unlevered long sizing and reward", () => { const r = calculateRisk(base); expect(r.units).toBe(50); expect(r.budget).toBe(100); expect(r.targetPnl).toBe(200); expect(r.rewardRisk).toBe(2); expect(r.margin).toBe(5000); });
  it("handles short direction, contract size, costs and margin", () => { const r = calculateRisk({ ...base, side: "short", stop: 102, target: 96, contractSize: 10, feeBps: 10, slippageBps: 20, leverage: 10 }); expect(r.entryFill).toBeCloseTo(99.8); expect(r.stopFill).toBeCloseTo(102.204); expect(r.lossPerUnit).toBeCloseTo(26.06004); expect(r.units).toBeCloseTo(100 / 26.06004); expect(r.margin).toBeCloseTo(r.units * 99.8); expect(r.rewardRisk).toBeGreaterThan(0); });
  it("reduces size as costs increase and reports a net losing target", () => { const r = calculateRisk({ ...base, target: 100.1, feeBps: 50, slippageBps: 50 }); expect(r.units).toBeLessThan(50); expect(r.targetPnl).toBeLessThan(0); });
  it("rejects wrong-side, missing and out-of-range inputs", () => { for (const x of [{ ...base, stop: 101 }, { ...base, side: "short" as const, stop: 99 }, { ...base, target: 95 }, { ...base, balance: NaN }, { ...base, feeBps: -1 }, { ...base, slippageBps: 1001 }, { ...base, leverage: 0 }, { ...base, contractSize: 0 }]) expect(() => calculateRisk(x)).toThrow(); });
});
