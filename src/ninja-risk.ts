export type RiskInputs = { balance: number; riskPercent: number; side: "long" | "short"; entry: number; stop: number; target: number | null; contractSize: number; feeBps: number; slippageBps: number; leverage: number };
/** Scenario only: symmetric adverse slippage and percentage fees on both fills. */
export function calculateRisk(x: RiskInputs) {
  const finite = [x.balance, x.riskPercent, x.entry, x.stop, x.contractSize, x.feeBps, x.slippageBps, x.leverage].every(Number.isFinite) && (x.target === null || Number.isFinite(x.target));
  if (!finite || x.balance <= 0 || x.balance > 1e12 || x.riskPercent <= 0 || x.riskPercent > 100 || x.entry <= 0 || x.stop <= 0 || x.entry > 1e12 || x.stop > 1e12 || x.contractSize <= 0 || x.contractSize > 1e9 || x.leverage < 1 || x.leverage > 1000 || x.feeBps < 0 || x.feeBps > 1000 || x.slippageBps < 0 || x.slippageBps > 1000 || !["long", "short"].includes(x.side)) throw new Error("Enter valid values: positive balance, prices and contract size; risk 0–100%; leverage 1–1,000; fees and slippage 0–1,000 bps.");
  const dir = x.side === "long" ? 1 : -1;
  if (dir * (x.entry - x.stop) <= 0) throw new Error(`For a ${x.side}, the stop must be ${x.side === "long" ? "below" : "above"} the entry.`);
  if (x.target !== null && (x.target <= 0 || x.target > 1e12 || dir * (x.target - x.entry) <= 0)) throw new Error(`For a ${x.side}, the target must be positive and ${x.side === "long" ? "above" : "below"} the entry.`);
  const slip = x.slippageBps / 10_000, fee = x.feeBps / 10_000;
  const entryFill = x.entry * (1 + dir * slip);
  const stopFill = x.stop * (1 - dir * slip);
  const lossPerUnit = (dir * (entryFill - stopFill) + fee * (entryFill + stopFill)) * x.contractSize;
  const budget = x.balance * x.riskPercent / 100;
  const units = budget / lossPerUnit;
  const notional = units * entryFill * x.contractSize;
  const margin = notional / x.leverage;
  const targetFill = x.target === null ? null : x.target * (1 - dir * slip);
  const targetPnl = targetFill === null ? null : units * x.contractSize * (dir * (targetFill - entryFill) - fee * (entryFill + targetFill));
  if (![entryFill, stopFill, lossPerUnit, budget, units, notional, margin, ...(targetPnl === null ? [] : [targetPnl])].every(Number.isFinite) || lossPerUnit <= 0 || units <= 0) throw new Error("The inputs produce an unsupported result. Adjust the values.");
  return { budget, units, entryFill, stopFill, lossPerUnit, notional, margin, targetFill, targetPnl, rewardRisk: targetPnl === null ? null : targetPnl / budget };
}
