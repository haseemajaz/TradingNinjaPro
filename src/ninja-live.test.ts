import { afterEach, describe, expect, it, vi } from "vitest";
import { createNinjaLiveAdapter, quoteIsFresh, validQuote } from "./ninja-live.ts";
import type { MarketEvent } from "./adapter/types.ts";

class FakeSocket {
  static instances: FakeSocket[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((message: { data: string }) => void) | null = null;
  url: string;
  constructor(url: string) { this.url = url; FakeSocket.instances.push(this); }
  close() { this.onclose?.(); }
  tick(bid = "100", ask = "101") {
    this.onmessage?.({ data: JSON.stringify({ data: { s: "BTCUSDT", b: bid, a: ask } }) });
  }
}
afterEach(() => { vi.useRealTimers(); FakeSocket.instances = []; });
const setup = () => createNinjaLiveAdapter({ webSocketImpl: FakeSocket as unknown as typeof WebSocket });

describe("TradingNinjaPro live safeguards", () => {
  it("rejects invalid, crossed and non-positive quotes", () => {
    expect(validQuote(1, 2)).toBe(true);
    for (const [bid, ask] of [[0, 1], [2, 1], [NaN, 2], [1, Infinity], [-1, 2]]) {
      expect(validQuote(bid!, ask!)).toBe(false);
    }
  });
  it("expires quotes after 20 seconds and rejects future or missing timestamps", () => {
    expect(quoteIsFresh(100, 19999)).toBe(true);
    expect(quoteIsFresh(100, 20100)).toBe(false);
    expect(quoteIsFresh(undefined, 100)).toBe(false);
    expect(quoteIsFresh(101, 100)).toBe(false);
  });
  it("uses a public market-data-only WebSocket and ignores malformed frames", () => {
    vi.useFakeTimers();
    const live = setup();
    const ticks: MarketEvent[] = [];
    live.adapter.marketData.subscribe((e) => ticks.push(e));
    live.adapter.marketData.connect?.();
    const socket = FakeSocket.instances[0]!;
    expect(socket.url).toContain("wss://data-stream.binance.vision/stream");
    socket.onopen?.(); socket.tick("NaN", "1");
    expect(ticks).toHaveLength(0);
    socket.tick(); expect(ticks).toHaveLength(1);
    live.adapter.marketData.disconnect?.();
  });
  it("prevents disconnected paper orders before engine validation", async () => {
    const live = setup();
    await expect(live.adapter.trading!.placeOrder({ accountId: "missing", symbol: "BTCUSD", side: "BUY", type: "MARKET", quantity: 1 })).rejects.toThrow("fresh live quote");
  });
  it("reconnects after stale input and cancels reconnects on disconnect", () => {
    vi.useFakeTimers();
    const live = setup();
    const health: string[] = [];
    live.onHealth((s) => health.push(s));
    live.adapter.marketData.connect?.();
    const socket = FakeSocket.instances[0]!;
    socket.onopen?.(); socket.tick();
    expect(health).toContain("live");
    vi.advanceTimersByTime(25000);
    expect(health).toContain("stale");
    live.adapter.marketData.disconnect?.();
    const count = FakeSocket.instances.length;
    vi.advanceTimersByTime(60000);
    expect(FakeSocket.instances.length).toBe(count);
    expect(live.adapter.marketData.getConnectionState?.()).toBe("disconnected");
  });
  it("ignores late events from an old connection", () => {
    vi.useFakeTimers();
    const live = setup(); const handler = vi.fn();
    live.adapter.marketData.subscribe(handler);
    live.adapter.marketData.connect?.();
    const old = FakeSocket.instances[0]!;
    live.adapter.marketData.disconnect?.();
    live.adapter.marketData.connect?.();
    old.tick(); expect(handler).not.toHaveBeenCalled();
    live.adapter.marketData.disconnect?.();
  });
  it("honours candle pagination and uses only public historical endpoints", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => [[1000, "1", "3", "1", "2", "9"], [2000, "NaN", "3", "1", "2", "9"]] });
    const live = createNinjaLiveAdapter({ fetchImpl });
    const candles = await live.adapter.marketData.getCandles({ symbol: "BTCUSD", timeframe: "1m", toMs: 10000 });
    expect(candles).toHaveLength(1);
    expect(fetchImpl.mock.calls[0]![0]).toContain("https://data-api.binance.vision/api/v3/klines");
    expect(fetchImpl.mock.calls[0]![0]).toContain("endTime=9999");
  });
  it("surfaces restricted HTTP responses without demo fallback", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 451 });
    const live = createNinjaLiveAdapter({ fetchImpl });
    await expect(live.adapter.marketData.getCandles({ symbol: "BTCUSD", timeframe: "1m" })).rejects.toThrow("451");
  });
});
