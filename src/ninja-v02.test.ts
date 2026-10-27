import { beforeEach, describe, expect, it } from "vitest";
import * as engine from "./services/demo/engine.ts";
import { parseBackup } from "./ninja-session.ts";
import { defaultWorkspace, newPlan, PlanSchema, WorkspaceSchema } from "./ninja-workspace.ts";

beforeEach(() => engine.__resetForTests());
const backup = () => ({ format: "TradingNinjaPro.local.v2", mode: "live", savedAt: new Date().toISOString(), account: engine.exportPaperSnapshot(), workspace: defaultWorkspace(), journal: [] });
const open = () => {
  engine.mark("BTCUSD", 100);
  engine.placeOrder({ accountId: engine.getAccount().id, symbol: "BTCUSD", side: "BUY", type: "MARKET", quantity: 1 });
};
describe("local paper-account snapshots", () => {
  it("round-trips positions and stable account identity", () => {
    open(); const saved = engine.exportPaperSnapshot(); const id = saved.account.id;
    engine.__resetForTests(); engine.restorePaperSnapshot(saved);
    expect(engine.getAccount().id).toBe(id); expect(engine.getPositions()).toHaveLength(1);
    expect(engine.getPositions()[0]?.entryPrice).toBe(100);
  });
  it("does not restore stale quotes, unrealised marks or imported margin", () => {
    open(); const saved = engine.exportPaperSnapshot(); saved.positions[0]!.margin = 99999; saved.positions[0]!.currentPrice = 99999;
    engine.restorePaperSnapshot(saved);
    expect(engine.getLastPrice("BTCUSD")).toBe(0);
    expect(engine.getPositions()[0]?.currentPrice).toBe(100);
    expect(engine.getPositions()[0]?.margin).toBe(1);
  });
  it("persists realised balance, close records and pending orders", () => {
    open(); engine.mark("BTCUSD", 110); engine.closeAllPositions();
    engine.placeOrder({ accountId: engine.getAccount().id, symbol: "BTCUSD", side: "BUY", type: "LIMIT", quantity: 1, price: 90 });
    const saved = engine.exportPaperSnapshot(); engine.__resetForTests(); engine.restorePaperSnapshot(saved);
    expect(engine.getAccount().balance).toBe(100010); expect(engine.getClosedPositions()).toHaveLength(1);
    expect(engine.getOrders().some((o) => o.status === "PENDING")).toBe(true);
  });
  it("rejects invalid snapshots atomically", () => {
    open(); const saved = engine.exportPaperSnapshot(); const before = engine.exportPaperSnapshot();
    saved.positions[0]!.quantity = -1;
    expect(() => engine.restorePaperSnapshot(saved)).toThrow(); expect(engine.exportPaperSnapshot()).toEqual(before);
  });
  it("rejects unknown symbols, account mismatches and duplicate records", () => {
    open(); const saved = engine.exportPaperSnapshot(); saved.positions[0]!.symbolName = "FAKE";
    expect(() => engine.parsePaperSnapshot(saved)).toThrow(); saved.positions[0]!.symbolName = "BTCUSD";
    saved.positions[0]!.accountId = "another"; expect(() => engine.parsePaperSnapshot(saved)).toThrow();
    saved.positions[0]!.accountId = saved.account.id; saved.positions.push({ ...saved.positions[0]! });
    expect(() => engine.parsePaperSnapshot(saved)).toThrow();
  });
  it("rejects non-finite values and unknown snapshot versions", () => {
    const saved = engine.exportPaperSnapshot(); saved.account.equity = Infinity;
    expect(() => engine.parsePaperSnapshot(saved)).toThrow();
    expect(() => engine.parsePaperSnapshot({ ...engine.exportPaperSnapshot(), version: 99 })).toThrow();
  });
});
describe("backup and workspace validation", () => {
  it("round-trips a complete backup and its named watchlists", () => {
    const data = backup(); expect(parseBackup(data, "live").workspace.lists[0]?.name).toBe("My markets");
  });
  it("keeps live and demo account backups isolated", () => { expect(() => parseBackup(backup(), "demo")).toThrow("Switch to that data mode"); });
  it("rejects another account’s journal without changing the engine", () => {
    const data = { ...backup(), journal: [{ id: "j", accountId: "other", tags: [], notes: "private", createdAt: new Date().toISOString() }] };
    expect(() => parseBackup(data, "live")).toThrow("Journal entries belong");
  });
  it("rejects invalid layouts, duplicate assets and missing list identities", () => {
    const w = defaultWorkspace(); w.lists[0]!.assets.push("BTCUSD"); expect(WorkspaceSchema.safeParse(w).success).toBe(false);
    expect(WorkspaceSchema.safeParse({ ...defaultWorkspace(), activeList: "missing" }).success).toBe(false);
    expect(WorkspaceSchema.safeParse({ ...defaultWorkspace(), chartCount: 3 }).success).toBe(false);
  });
  it("validates manual strategy rules and finite risk bounds", () => {
    const plan = newPlan(); expect(PlanSchema.safeParse(plan).success).toBe(true);
    expect(PlanSchema.safeParse({ ...plan, conditions: [] }).success).toBe(false);
    expect(PlanSchema.safeParse({ ...plan, riskPercent: 11 }).success).toBe(false);
    expect(PlanSchema.safeParse({ ...plan, targetR: NaN }).success).toBe(false);
    expect(PlanSchema.safeParse({ ...plan, asset: "UNKNOWN" }).success).toBe(false);
  });
});
