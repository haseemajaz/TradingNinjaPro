/** TradingNinjaPro public market-data adapter. No credentials or order routing. */
import { createBinanceMarketData, buildKlineUrl, fromBinancePair, klineToCandle, toBinancePair, type BinanceKline } from "../examples/binance-adapter/binance-adapter.ts";
import { createDemoAdapter } from "./adapter/demo.ts";
import type { ConnectionState, MarketEvent, OpenChartsAdapter, Quote, TradingGateway } from "./adapter/types.ts";
import * as engine from "./services/demo/engine.ts";

const REST = "https://data-api.binance.vision/api/v3";
const WS = "wss://data-stream.binance.vision/stream";
const NAMES = ["BTCUSD", "ETHUSD", "SOLUSD", "BNBUSD", "XRPUSD", "ADAUSD"];
const STALE_MS = 20_000;
export type FeedHealth = "waiting" | "live" | "stale" | "reconnecting" | "offline";
export type LiveOptions = { fetchImpl?: typeof fetch; webSocketImpl?: typeof WebSocket };

export function validQuote(bid: number, ask: number): boolean {
  return Number.isFinite(bid) && Number.isFinite(ask) && bid > 0 && ask >= bid;
}
export function quoteIsFresh(timestamp: number | undefined, now = Date.now()): boolean {
  return timestamp != null && now >= timestamp && now - timestamp < STALE_MS;
}
export function createNinjaLiveAdapter(options: LiveOptions = {}) {
  const fetcher = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const Socket = options.webSocketImpl ?? globalThis.WebSocket;
  const paper = createDemoAdapter(); // its replay feed is never connected
  const specs = createBinanceMarketData();
  const handlers = new Set<(e: MarketEvent) => void>();
  const listeners = new Set<(s: ConnectionState) => void>();
  const healthListeners = new Set<(s: FeedHealth) => void>();
  const quotes = new Map<string, Quote>();
  let state: ConnectionState = "disconnected";
  let health: FeedHealth = "offline";
  let socket: WebSocket | null = null;
  let stopped = true;
  let attempt = 0;
  let reconnect: ReturnType<typeof setTimeout> | undefined;
  let watchdog: ReturnType<typeof setInterval> | undefined;
  let lastMessage = 0;
  const setHealth = (s: FeedHealth) => {
    if (health === s) return;
    health = s;
    healthListeners.forEach((fn) => fn(s));
  };
  const setState = (s: ConnectionState) => {
    state = s;
    listeners.forEach((fn) => fn(s));
  };
  async function json(url: string): Promise<unknown> {
    const response = await fetcher(url, { signal: AbortSignal.timeout(12_000) });
    if (!response.ok) throw new Error(`Market data unavailable (HTTP ${response.status}). Access or rate limits may apply.`);
    return response.json();
  }
  function open() {
    if (stopped || socket) return;
    setState(attempt ? "reconnecting" : "connecting");
    setHealth(attempt ? "reconnecting" : "waiting");
    const streams = NAMES.map((s) => `${toBinancePair(s)!.toLowerCase()}@bookTicker`).join("/");
    let current: WebSocket;
    try { current = new Socket(`${WS}?streams=${streams}`); }
    catch { schedule(); return; }
    socket = current;
    lastMessage = Date.now();
    current.onopen = () => { if (socket === current && !stopped) setState("connected"); };
    current.onmessage = (message) => {
      if (stopped || socket !== current) return;
      try {
        const payload = JSON.parse(String(message.data)) as { data?: { s?: string; b?: string; a?: string } };
        const d = payload.data;
        const symbol = d?.s ? fromBinancePair(d.s) : null;
        if (!symbol || !validQuote(Number(d?.b), Number(d?.a))) return;
        const quote: Quote = { symbol, bid: Number(d?.b), ask: Number(d?.a), timestamp: Date.now() };
        quotes.set(symbol, quote);
        lastMessage = quote.timestamp;
        attempt = 0;
        setHealth("live");
        engine.mark(symbol, (quote.bid + quote.ask) / 2);
        const event: MarketEvent = { type: "tick", ...quote };
        handlers.forEach((fn) => fn(event));
      } catch { /* Ignore malformed frames; watchdog still detects a dead stream. */ }
    };
    current.onclose = () => {
      if (socket !== current) return;
      socket = null;
      if (!stopped) schedule();
    };
    current.onerror = () => { current.close(); };
  }
  function schedule() {
    if (stopped || reconnect) return;
    setState("reconnecting");
    setHealth("reconnecting");
    const delay = Math.min(30_000, 1000 * 2 ** Math.min(attempt++, 5)) + Math.random() * 500;
    reconnect = setTimeout(() => { reconnect = undefined; open(); }, delay);
  }
  const requireFresh = (symbol: string) => {
    if (stopped || state !== "connected" || !quoteIsFresh(quotes.get(symbol)?.timestamp)) {
      throw new Error("Paper trading paused: wait for a fresh live quote for this symbol.");
    }
  };
  const gateway = paper.trading!;
  const trading: TradingGateway = {
    ...gateway,
    placeOrder: async (input) => { requireFresh(input.symbol); return gateway.placeOrder(input); },
    modifyOrder: async (id, changes) => {
      const order = engine.getOrders().find((o) => o.id === id);
      if (order) requireFresh(order.symbolName);
      return gateway.modifyOrder(id, changes);
    },
    closePosition: async (id, quantity) => {
      const position = engine.getPositions().find((p) => p.id === id);
      if (position) requireFresh(position.symbolName);
      return gateway.closePosition(id, quantity);
    },
    closeAllPositions: async (accountId) => {
      engine.getPositions().forEach((p) => requireFresh(p.symbolName));
      return gateway.closeAllPositions(accountId);
    },
  };
  const adapter: OpenChartsAdapter = {
    name: "TradingNinjaPro · Binance live / paper execution",
    storage: paper.storage,
    trading,
    marketData: {
      getSymbols: async () => (await specs.getSymbols()).map((s) => ({ ...s, displayName: `${s.displayName} · ${toBinancePair(s.name)}` })),
      getCandles: async (request) => {
        const original = buildKlineUrl(request);
        if (!original) return [];
        const url = original.replace("https://api.binance.com/api/v3", REST);
        const data = await json(url);
        if (!Array.isArray(data)) throw new Error("Invalid candle response from market-data provider.");
        return (data as BinanceKline[]).map(klineToCandle).filter((c) =>
          [c.time, c.open, c.high, c.low, c.close, c.volume].every(Number.isFinite) &&
          c.open > 0 && c.low > 0 && c.close > 0 && c.high >= Math.max(c.open, c.close) &&
          c.low <= Math.min(c.open, c.close) && c.volume >= 0,
        );
      },
      getQuote: async (symbol) => {
        if (!toBinancePair(symbol)) return null;
        const cached = quotes.get(symbol);
        if (cached && quoteIsFresh(cached.timestamp)) return cached;
        const data = await json(`${REST}/ticker/bookTicker?symbol=${toBinancePair(symbol)}`) as { bidPrice?: string; askPrice?: string };
        if (!validQuote(Number(data.bidPrice), Number(data.askPrice))) return null;
        return { symbol, bid: Number(data.bidPrice), ask: Number(data.askPrice), timestamp: Date.now() };
      },
      subscribe: (fn) => { handlers.add(fn); return () => { handlers.delete(fn); }; },
      getConnectionState: () => state,
      onConnectionChange: (fn) => { listeners.add(fn); fn(state); return () => { listeners.delete(fn); }; },
      connect: () => {
        if (!stopped) return;
        stopped = false;
        open();
        watchdog = setInterval(() => {
          if (Date.now() - lastMessage > STALE_MS) {
            setHealth("stale");
            if (socket) socket.close();
          }
        }, 5000);
      },
      disconnect: () => {
        stopped = true;
        clearTimeout(reconnect); reconnect = undefined;
        clearInterval(watchdog); watchdog = undefined;
        const old = socket; socket = null;
        old?.close();
        quotes.clear();
        setState("disconnected"); setHealth("offline");
      },
    },
  };
  return {
    adapter,
    onHealth: (fn: (s: FeedHealth) => void) => {
      healthListeners.add(fn); fn(health);
      return () => { healthListeners.delete(fn); };
    },
  };
}
