import { describe, it, expect } from "vitest";
import type { ClosedPosition } from "./services/schemas.ts";
import { performance } from "./ninja-performance.ts";
import { defaultWorkspace, TradeReviewSchema, WorkspaceSchema } from "./ninja-workspace.ts";
const close = (id: string, realizedPnl: number, closedAt: string | null, symbolName = "BTCUSD"): ClosedPosition => ({ id, accountId: "a", symbolName, side: "LONG", quantity: 1, entryPrice: 100, exitPrice: 100 + realizedPnl, realizedPnl, commission: 0, swap: 0, openedAt: "2025-01-01T00:00:00Z", closedAt });
describe("realised performance", () => {
  it("handles empty, flat, partial and chronological records", () => {
    expect(performance([], 100).winRate).toBeNull();
    const rows = [close("3", 0, "2025-01-03T00:00:00Z"), { ...close("2", -4, "2025-01-02T00:00:00Z", "ETHUSD"), isPartialClose: true }, close("1", 10, "2025-01-01T00:00:00Z")];
    const result = performance(rows, 106);
    expect(result.points).toEqual([100, 110, 106, 106]);
    expect(result.maxDrawdown).toBe(4); expect(result.winRate).toBeCloseTo(1 / 3);
    expect([result.wins, result.losses, result.flat, result.averageWin, result.averageLoss]).toEqual([1, 1, 1, 10, -4]);
    expect(result.symbols.find((s) => s.symbol === "ETHUSD")?.pnl).toBe(-4);
  });
  it("does not invent order when a date is missing", () => {
    const result = performance([close("1", 2, null)], 102);
    expect(result.points).toEqual([]); expect(result.maxDrawdown).toBeNull(); expect(result.pnl).toBe(2);
  });
  it("preserves same-timestamp close order from the engine's newest-first records", () => {
    const result = performance([close("new", -10, "2025-01-01T00:00:00Z"), close("old", 10, "2025-01-01T00:00:00Z")], 100);
    expect(result.points).toEqual([100, 110, 100]); expect(result.maxDrawdown).toBe(10);
  });
  it("migrates old workspaces and rejects malformed review indices", () => {
    expect(WorkspaceSchema.parse({ ...defaultWorkspace(), reviews: undefined }).reviews).toEqual([]);
    expect(TradeReviewSchema.safeParse({ closedId: "1", planId: "2", planName: "test", rules: ["r"], checked: [1], notes: "", updatedAt: "2025-01-01T00:00:00.000Z" }).success).toBe(false);
  });
});
