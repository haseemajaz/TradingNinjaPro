import { describe, expect, it, vi } from "vitest";
import { exportDrawingBackup, parseDrawingBackup, restoreDrawings } from "./ninja-drawing-backup.ts";

const drawing = { id: "abc", type: "position", price: 100, price2: 105, time: 1700000000, time2: 1700001000, price3: 110, time3: 1700002000, color: "#fff", width: 2, lineStyle: "dashed", locked: true, extendLeft: false, extendRight: true, hidden: false, zIndex: 4, createdTf: "1h", visibility: "tf", fillColor: "#000", fillOpacity: 0.5, arrowStart: false, arrowEnd: true, text: "note", fontSize: 12, bold: true, italic: false, textBg: true, textBgColor: "#fff", textBorder: true, textBorderColor: "#000", fibLevels: [0, 0.5, 1], side: "long", stopPrice: 90, targetPrice: 120, riskPct: 1, alertEnabled: false, alertMessage: "watch" };
const file = (drawings: unknown = [drawing], symbol = "BTCUSD") => JSON.stringify({ format: "TradingNinjaPro.drawings.v1", symbol, savedAt: "2026-01-01T00:00:00.000Z", drawings });
function storage(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial));
  return { get length() { return map.size; }, clear: () => map.clear(), getItem: (k) => map.get(k) ?? null, key: (n) => [...map.keys()][n] ?? null, removeItem: (k) => { map.delete(k); }, setItem: (k, v) => { map.set(k, v); } };
}
const locks = (available: boolean) => ({ request: vi.fn(async (_name: string, _options: unknown, callback: (lock: object | null) => unknown) => callback(available ? {} : null)) }) as unknown as LockManager;
describe("native drawing backup", () => {
  it("round-trips all supported fields without altering other keys", async () => {
    const s = storage({ oc_drawings_BTCUSD: JSON.stringify([drawing]), oc_drawings_ETHUSD: "untouched", "tnp-v2-account:demo": "account" });
    const text = exportDrawingBackup(s, "BTCUSD");
    expect(parseDrawingBackup(text, "BTCUSD").drawings).toEqual([drawing]);
    s.setItem("oc_drawings_BTCUSD", "[]");
    const l = locks(true); await restoreDrawings(s, l, "demo", text, "BTCUSD", () => true);
    expect(l.request).toHaveBeenCalledWith("TradingNinjaPro:live", { ifAvailable: true }, expect.any(Function));
    expect(JSON.parse(s.getItem("oc_drawings_BTCUSD")!)).toEqual([drawing]);
    expect(s.getItem("oc_drawings_ETHUSD")).toBe("untouched"); expect(s.getItem("tnp-v2-account:demo")).toBe("account");
  });
  it("rejects malformed, oversized, mismatched and unsupported backups without writing", async () => {
    const s = storage({ oc_drawings_BTCUSD: "original" });
    for (const text of ["{", " ".repeat(1_000_001), file([drawing, drawing]), file([{ ...drawing, type: "unknown" }]), file([{ ...drawing, extra: true }]), file([drawing], "ETHUSD"), file([{ ...drawing, price: null }])]) {
      await expect(restoreDrawings(s, locks(true), "demo", text, "BTCUSD", () => true)).rejects.toThrow();
      expect(s.getItem("oc_drawings_BTCUSD")).toBe("original");
    }
  });
  it("refuses locked, unsafe or failed storage restores", async () => {
    const s = storage({ oc_drawings_BTCUSD: "original" });
    await expect(restoreDrawings(s, locks(false), "demo", file(), "BTCUSD", () => true)).rejects.toThrow(/other data-mode/);
    await expect(restoreDrawings(s, undefined, "demo", file(), "BTCUSD", () => true)).rejects.toThrow(/locked account/);
    await expect(restoreDrawings(s, locks(true), "demo", file(), "BTCUSD", () => false)).rejects.toThrow(/locked account/);
    const fail = { ...s, setItem: () => { throw new Error("quota"); } };
    await expect(restoreDrawings(fail, locks(true), "demo", file(), "BTCUSD", () => true)).rejects.toThrow(/quota/);
    expect(s.getItem("oc_drawings_BTCUSD")).toBe("original");
  });
  it("does not silently discard unknown existing data during export", () => {
    const s = storage({ oc_drawings_BTCUSD: JSON.stringify([{ ...drawing, futureField: 1 }]) });
    expect(() => exportDrawingBackup(s, "BTCUSD")).toThrow();
    expect(s.getItem("oc_drawings_BTCUSD")).toContain("futureField");
  });
});
