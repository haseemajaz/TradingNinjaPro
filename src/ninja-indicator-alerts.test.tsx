import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { createDemoAdapter } from "./adapter/demo.ts";
import type { LocalSession } from "./ninja-session.ts";
import { completedRsi, fireIndicatorAlerts, useIndicatorAlerts } from "./ninja-indicator-alerts.ts";
import { defaultWorkspace, IndicatorAlertSchema, WorkspaceSchema, type IndicatorAlert } from "./ninja-workspace.ts";

const now = 1_700_000_000_000;
const bars = () => Array.from({ length: 100 }, (_, i) => ({ time: Math.floor(now / 1000) - (100 - i) * 3600, open: 100 + i, high: 101 + i, low: 99 + i, close: 100 + i, volume: 1 }));
const alert = (id = "a"): IndicatorAlert => ({ id, asset: "BTCUSD", timeframe: "1h", direction: "above", threshold: 70, createdAt: "2023-01-01T00:00:00.000Z", firedAt: null, firedValue: null, firedBar: null });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("completed-bar RSI alerts", () => {
  it("uses completed candles and ignores a forming candle", () => {
    const data = bars(); data.push({ ...data.at(-1)!, time: data.at(-1)!.time + 3600, close: 1 });
    const reading = completedRsi(data, "1h", now);
    expect(reading.value).toBe(100); expect(reading.bar).toBe(data.at(-2)!.time);
  });
  it("rejects insufficient, stale, malformed, gapped and future data", () => {
    const data = bars();
    expect(() => completedRsi(data.slice(0, 10), "1h", now)).toThrow(/enough/);
    expect(() => completedRsi(data.slice(0, -2), "1h", now)).toThrow(/stale/);
    expect(() => completedRsi(data.filter((_, i) => i !== 50), "1h", now)).toThrow(/gapped/);
    expect(() => completedRsi([...data.slice(0, -1), { ...data.at(-1)!, close: NaN }], "1h", now)).toThrow(/Invalid/);
    expect(() => completedRsi([...data, { ...data.at(-1)!, time: Math.floor(now / 1000) + 3600 }], "1h", now)).toThrow(/Invalid/);
  });
  it("fires only eligible matching one-shot alerts, including equality", () => {
    const initial = [alert(), { ...alert("b"), direction: "below" as const, threshold: 70 }, { ...alert("c"), asset: "ETHUSD" }];
    const fired = fireIndicatorAlerts(initial, new Set(["a", "b", "c"]), "BTCUSD", "1h", { value: 70, bar: 1700000000 }, now);
    expect(fired[0]?.firedValue).toBe(70); expect(fired[1]?.firedValue).toBe(70); expect(fired[2]?.firedAt).toBeNull();
    expect(fireIndicatorAlerts(fired, new Set(["a"]), "BTCUSD", "1h", { value: 80, bar: 1700000000 }, now)).toBe(fired);
    expect(fireIndicatorAlerts(initial, new Set(), "BTCUSD", "1h", { value: 100, bar: 1700000000 }, now)).toBe(initial);
  });
  it("migrates older workspaces and rejects broken alert records", () => {
    expect(WorkspaceSchema.parse({ ...defaultWorkspace(), indicatorAlerts: undefined }).indicatorAlerts).toEqual([]);
    expect(IndicatorAlertSchema.safeParse({ ...alert(), threshold: 101 }).success).toBe(false);
    expect(IndicatorAlertSchema.safeParse({ ...alert(), firedAt: "2023-01-01T00:00:00.000Z" }).success).toBe(false);
    expect(WorkspaceSchema.safeParse({ ...defaultWorkspace(), indicatorAlerts: [alert(), alert()] }).success).toBe(false);
  });
  it("polls one group at a time, updates the latest workspace and respects per-group limits", async () => {
    vi.useFakeTimers(); vi.setSystemTime(now);
    const workspace = { ...defaultWorkspace(), indicatorAlerts: [alert(), { ...alert("b"), asset: "ETHUSD", direction: "below" as const, threshold: 20 }] };
    let state = { status: "ready" as const, message: "", workspace, savedAt: null };
    const session = { getState: () => state, updateWorkspace: (w: typeof workspace) => { state = { ...state, workspace: w }; } } as unknown as LocalSession;
    const adapter = createDemoAdapter(); const getCandles = vi.fn(async () => bars()); adapter.marketData.getCandles = getCandles;
    const { result, unmount } = renderHook(() => useIndicatorAlerts(session, adapter));
    await act(async () => { await Promise.resolve(); });
    expect(getCandles).toHaveBeenCalledTimes(1); expect(state.workspace.indicatorAlerts[0]?.firedValue).toBe(100);
    expect(result.current["BTCUSD:1h"]?.value).toBe(100);
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(getCandles).toHaveBeenCalledTimes(2); expect(state.workspace.indicatorAlerts[1]?.firedAt).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(50_000); });
    expect(getCandles).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(getCandles).toHaveBeenCalledTimes(3); unmount();
  });
  it("pauses while hidden and shows provider failures without firing", async () => {
    vi.useFakeTimers(); vi.setSystemTime(now);
    let hidden = true;
    const visibility = vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
    const workspace = { ...defaultWorkspace(), indicatorAlerts: [alert()] };
    const state = { status: "ready" as const, message: "", workspace, savedAt: null };
    const updateWorkspace = vi.fn();
    const session = { getState: () => state, updateWorkspace } as unknown as LocalSession;
    const adapter = createDemoAdapter(); const getCandles = vi.fn(async () => { throw new Error("Provider unavailable"); }); adapter.marketData.getCandles = getCandles;
    const { result, unmount } = renderHook(() => useIndicatorAlerts(session, adapter));
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(getCandles).not.toHaveBeenCalled(); hidden = false;
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(getCandles).toHaveBeenCalledTimes(1); expect(result.current["BTCUSD:1h"]?.error).toBe("Provider unavailable");
    expect(updateWorkspace).not.toHaveBeenCalled(); unmount(); visibility.mockRestore();
  });
  it("does not resurrect alerts deleted while a request is in flight", async () => {
    vi.useFakeTimers(); vi.setSystemTime(now);
    let resolve!: (value: ReturnType<typeof bars>) => void;
    const workspace = { ...defaultWorkspace(), indicatorAlerts: [alert()] };
    let state = { status: "ready" as const, message: "", workspace, savedAt: null };
    const updateWorkspace = vi.fn((w: typeof workspace) => { state = { ...state, workspace: w }; });
    const session = { getState: () => state, updateWorkspace } as unknown as LocalSession;
    const adapter = createDemoAdapter(); adapter.marketData.getCandles = () => new Promise((r) => { resolve = r; });
    const { unmount } = renderHook(() => useIndicatorAlerts(session, adapter));
    state = { ...state, workspace: { ...state.workspace, indicatorAlerts: [], chartCount: 1 } };
    await act(async () => { resolve(bars()); await Promise.resolve(); });
    expect(updateWorkspace).not.toHaveBeenCalled(); expect(state.workspace.chartCount).toBe(1); expect(state.workspace.indicatorAlerts).toEqual([]); unmount();
  });

});
