import { useEffect, useRef, useState } from "react";
import { QueryClient } from "@tanstack/react-query";
import { ArrowUpRight, CandlestickChart, Check, ChevronDown, CircleHelp, Download, Moon, ShieldCheck, Sun, X } from "lucide-react";
import { createDemoAdapter } from "./adapter/demo.ts";
import { OpenChartsProvider } from "./adapter/provider.tsx";
import { Terminal } from "./terminal/Terminal.tsx";
import { safeStorage } from "./lib/safe-storage.ts";
import { createNinjaLiveAdapter, type FeedHealth } from "./ninja-live.ts";
import * as engine from "./services/demo/engine.ts";

type Market = "crypto" | "forex" | "metals" | "stocks";
const CATEGORIES: { id: Market; name: string; detail: string }[] = [
  { id: "crypto", name: "Crypto", detail: "Native terminal" },
  { id: "forex", name: "Forex", detail: "Embedded charts" },
  { id: "metals", name: "Gold & silver", detail: "Embedded charts" },
  { id: "stocks", name: "Stocks", detail: "Embedded charts" },
];
const ASSETS = {
  forex: [["FX:EURUSD", "EUR / USD"], ["FX:GBPUSD", "GBP / USD"], ["FX:USDJPY", "USD / JPY"], ["FX:AUDUSD", "AUD / USD"], ["FX:USDCAD", "USD / CAD"], ["FX:USDCHF", "USD / CHF"]],
  metals: [["OANDA:XAUUSD", "Gold / USD"], ["OANDA:XAGUSD", "Silver / USD"]],
  stocks: [["NASDAQ:AAPL", "Apple"], ["NASDAQ:MSFT", "Microsoft"], ["NASDAQ:NVDA", "NVIDIA"], ["NASDAQ:TSLA", "Tesla"], ["NASDAQ:AMZN", "Amazon"], ["NASDAQ:GOOGL", "Alphabet"]],
} satisfies Record<Exclude<Market, "crypto">, string[][]>;
const DEMO = new URLSearchParams(window.location.search).get("mode") === "demo";

function downloadTrades() {
  const rows = engine.getClosedPositions();
  const escape = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
  // Only engine-generated fields are exported; journal free text is intentionally excluded.
  const csv = ["Symbol,Side,Quantity,Entry price,Exit price,Realized PnL,Closed at", ...rows.map((r) =>
    [r.symbolName, r.side, r.quantity, r.entryPrice, r.exitPrice, r.realizedPnl, r.closedAt].map(escape).join(","),
  )].join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a"); link.href = url; link.download = "TradingNinjaPro-paper-trades.csv";
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function MarketEmbed({ symbol, dark }: { symbol: string; dark: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const [consent, setConsent] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState("Loading external chart…");
  useEffect(() => {
    if (!consent || !host.current) return;
    const node = host.current;
    const container = document.createElement("div");
    container.className = "tradingview-widget-container";
    container.style.height = "100%";
    const widget = document.createElement("div");
    widget.className = "tradingview-widget-container__widget";
    widget.style.height = "100%";
    container.append(widget);
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;
    script.type = "text/javascript";
    script.textContent = JSON.stringify({
      autosize: true, symbol, interval: "60", timezone: "Etc/UTC", theme: dark ? "dark" : "light",
      style: "1", locale: "en", allow_symbol_change: true, hide_side_toolbar: false,
      calendar: false, support_host: "https://www.tradingview.com",
    });
    script.onerror = () => setStatus("Chart could not load. Check your connection or content blocker, then retry.");
    container.append(script); node.append(container);
    const observer = new MutationObserver(() => {
      if (node.querySelector("iframe")) setStatus("Embedded chart · check the provider’s market-data status inside the chart");
    });
    observer.observe(node, { childList: true, subtree: true });
    const timer = setTimeout(() => {
      if (!node.querySelector("iframe")) setStatus("The external chart is taking longer than expected. Retry or open it on TradingView.");
    }, 15_000);
    return () => { clearTimeout(timer); observer.disconnect(); node.replaceChildren(); };
  }, [symbol, dark, consent, attempt]);
  return <>
    <div className="tnp-embed-status"><span role="status">{consent ? status : "External chart not loaded"}</span>
      {consent && <button onClick={() => { setStatus("Reloading external chart…"); setAttempt((n) => n + 1); }}>Retry chart</button>}
    </div>
    <div className="tnp-embed-body">
      {!consent && <div className="tnp-consent"><CandlestickChart size={40} aria-hidden="true" /><h2>Your next market. One workspace.</h2>
        <p>Load a TradingView chart for forex, precious metals or stocks. This contacts TradingView, which may use cookies or similar technology. Feed availability and delays vary by symbol.</p>
        <button className="tnp-primary" onClick={() => { setStatus("Loading external chart…"); setConsent(true); }}>Load market chart <ArrowUpRight size={18} /></button>
        <a href="https://www.tradingview.com/privacy-policy/" target="_blank" rel="noreferrer">TradingView privacy policy</a>
      </div>}
      <div className="tnp-embed-host" ref={host} hidden={!consent} />
    </div>
    <div className="tnp-widget-credit"><a href={`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(symbol)}`} target="_blank" rel="noreferrer">Charts by TradingView ↗</a><span>Display only · not connected to our paper-trading engine</span></div>
  </>;
}

function RiskCalculator({ close }: { close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [balance, setBalance] = useState("10000");
  const [risk, setRisk] = useState("1");
  const [entry, setEntry] = useState("100");
  const [stop, setStop] = useState("98");
  const amount = Number(balance) * Number(risk) / 100;
  const distance = Math.abs(Number(entry) - Number(stop));
  const valid = [balance, risk, entry, stop].every((v) => v.trim() !== "" && Number.isFinite(Number(v)) && Number(v) > 0) && Number(risk) <= 100 && distance > 0 && Number.isFinite(amount / distance);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog className="tnp-dialog" ref={dialog} onCancel={close} onClose={close} aria-labelledby="risk-title">
    <div className="tnp-dialog-heading"><h2 id="risk-title">Plan your risk</h2><button aria-label="Close risk calculator" onClick={close}><X /></button></div>
    <p>Estimate units for a linear instrument. Account currency must match the quote currency.</p>
    <div className="tnp-risk-fields">{([
      ["Account balance", balance, setBalance], ["Risk per trade (%)", risk, setRisk], ["Entry price", entry, setEntry], ["Stop price", stop, setStop],
    ] as const).map(([label, value, setter]) => <label key={label}>{label}<input type="number" min="0" step="any" value={value} onChange={(e) => setter(e.target.value)} /></label>)}</div>
    <div className="tnp-risk-result" aria-live="polite">{valid ? <><span>Maximum planned risk <b>{amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}</b></span><span>Estimated units <b>{(amount / distance).toLocaleString(undefined, { maximumFractionDigits: 6 })}</b></span></> : <p>Enter positive values, risk of 100% or less, and different entry and stop prices.</p>}</div>
    <p className="tnp-fine">Not a forex lot calculator. Excludes fees, spread, leverage, slippage and gaps. A stop order does not guarantee the planned loss.</p>
  </dialog>;
}

export function TradingNinjaPro() {
  const [market, setMarket] = useState<Market>(() => {
    const saved = safeStorage.getItem("tnp-market");
    return CATEGORIES.some((c) => c.id === saved) ? saved as Market : "crypto";
  });
  const [symbol, setSymbol] = useState("FX:EURUSD");
  const [dark, setDark] = useState(() => {
    const stored = safeStorage.getItem("tnp-theme");
    return stored ? stored === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
  });
  const [riskOpen, setRiskOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [health, setHealth] = useState<FeedHealth>("waiting");
  const [live] = useState(() => DEMO ? null : createNinjaLiveAdapter());
  const [adapter] = useState(() => live?.adapter ?? createDemoAdapter());
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 5000 } } }));
  useEffect(() => {
    if (!live) return;
    return live.onHealth((next) => {
      setHealth(next);
      if (next === "live") void queryClient.invalidateQueries();
    });
  }, [live, queryClient]);
  useEffect(() => {
    document.documentElement.classList.toggle("light", !dark);
    document.documentElement.classList.toggle("dark", dark);
    safeStorage.setItem("tnp-theme", dark ? "dark" : "light");
  }, [dark]);
  const selectMarket = (next: Market) => {
    setMarket(next); safeStorage.setItem("tnp-market", next);
    if (next !== "crypto") setSymbol(ASSETS[next][0]![0]!);
  };
  const selected = market === "crypto" ? null : ASSETS[market].find((a) => a[0] === symbol) ?? ASSETS[market][0]!;
  const healthLabel = { live: "Live quotes", waiting: "Connecting…", stale: "Stale · trading paused", reconnecting: "Reconnecting · trading paused", offline: "Offline · trading paused" }[health];
  const toggleMode = () => {
    if (!window.confirm("Switch data mode and reset the practice account? Positions, orders and this session’s trade history will be lost. Drawings and journal entries remain in this browser.")) return;
    const url = new URL(window.location.href);
    if (DEMO) url.searchParams.delete("mode"); else url.searchParams.set("mode", "demo");
    window.location.assign(url.href);
  };
  return <div className="tnp" data-theme={dark ? "dark" : "light"}>
    <a href="#tnp-workspace" className="tnp-skip">Skip to workspace</a>
    <header className="tnp-header">
      <a className="tnp-brand" href={import.meta.env.BASE_URL} aria-label="TradingNinjaPro home"><span className="tnp-mark" aria-hidden="true"><CandlestickChart size={25} /></span><span>TradingNinja<span className="tnp-pro">Pro</span><small>THE INDEPENDENT TRADER’S WORKSPACE</small></span></a>
      <div className="tnp-header-actions"><span className="tnp-practice"><ShieldCheck size={15} /> Paper trading only</span><button onClick={() => setRiskOpen(true)}>Risk calculator</button><button aria-label={dark ? "Use light theme" : "Use dark theme"} onClick={() => setDark((v) => !v)}>{dark ? <Sun size={19} /> : <Moon size={19} />}</button><button aria-label="About and data sources" aria-expanded={aboutOpen} onClick={() => setAboutOpen((v) => !v)}><CircleHelp size={19} /></button></div>
    </header>
    <div className="tnp-marketbar"><nav aria-label="Market categories">{CATEGORIES.map((c) => <button key={c.id} aria-current={market === c.id ? "page" : undefined} onClick={() => selectMarket(c.id)}>{c.name}<span>{c.detail}</span></button>)}</nav><span className="tnp-version">WORKSPACE / 01</span></div>
    {aboutOpen && <section className="tnp-about" aria-label="About TradingNinjaPro"><div><h2>Built for practice. Clear about the data.</h2><p>TradingNinjaPro is an independent fork of <a href="https://github.com/dylanpersonguy/OpenCharts" target="_blank" rel="noreferrer">OpenCharts</a>. No deposits, brokerage accounts or real-money execution. This is educational software, not investment advice.</p></div><div><h3>Know what you’re seeing</h3><p>Crypto: Binance spot USDT pairs (legacy terminal labels end in USD). Paper fills use the bid/ask midpoint; depth is synthetic, not an exchange order book. Account state resets on refresh. Drawings and journal entries use local browser storage; the upstream journal is account-ID scoped, so it is not a durable cross-session journal.</p><p>Embedded markets: provider-specific quotes; stocks may be delayed or unavailable. Do not assume any chart is execution-grade. Third-party charts are display-only and not a source for our order engine.</p><p>TradingView Lightweight Charts™ · Copyright (с) 2025 TradingView, Inc. <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">tradingview.com</a>. MIT and third-party notices are included with the source.</p></div></section>}
    <main id="tnp-workspace" className="tnp-main" tabIndex={-1}>
      <div className="tnp-sourcebar"><div><span className={`tnp-status ${market === "crypto" && !DEMO && health === "live" ? "is-live" : ""}`} />{market === "crypto" ? <><strong>{DEMO ? "Historical replay" : "Binance spot"}</strong><span>{DEMO ? "Not live · simulated stream" : healthLabel}</span></> : <><strong>TradingView embed</strong><span>Provider-dependent data & delays · display only</span></>}</div><button onClick={market === "crypto" ? toggleMode : () => setAboutOpen((v) => !v)}>{market === "crypto" ? DEMO ? "Switch to live" : "Use offline demo" : "Data details"}<ChevronDown size={14} /></button></div>
      <section className="tnp-native" hidden={market !== "crypto"} aria-label="Crypto practice terminal">
        <div className="tnp-session-note"><span>Practice account · refresh resets account state · USDT quoted markets</span><button onClick={() => { downloadTrades(); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>{copied ? <Check size={14} /> : <Download size={14} />}{copied ? "CSV downloaded" : "Export closed trades"}</button></div>
        <div className="tnp-terminal"><OpenChartsProvider adapter={adapter} queryClient={queryClient} fallback={<div className="tnp-loading">Preparing your TradingNinjaPro workspace…</div>}><Terminal /></OpenChartsProvider></div>
        {!DEMO && health !== "live" && <div className="tnp-feed-notice" role="status">Waiting for fresh market quotes. Your region or network may restrict Binance. New paper orders and position closes require a fresh quote; automatic stops cannot execute while offline. <button onClick={toggleMode}>Try the clearly labelled historical demo</button></div>}
      </section>
      {market !== "crypto" && <section className="tnp-external" aria-label={`${market} charts`}><div className="tnp-instruments"><div><span className="tnp-eyebrow">EXPLORE MARKETS</span><h1>{market === "metals" ? "Precious metals" : market === "stocks" ? "US equities" : "Foreign exchange"}</h1></div><label>Instrument<select value={selected![0]} onChange={(e) => setSymbol(e.target.value)}>{ASSETS[market].map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><p>Use the embedded chart’s symbol search to explore additional instruments. Availability varies by provider.</p><div className="tnp-display-note"><ShieldCheck size={18} /><span><b>Analysis, not execution.</b> These charts are not connected to the practice account.</span></div><button onClick={() => setRiskOpen(true)}>Plan a position <ArrowUpRight size={16} /></button></div><div className="tnp-chart-card"><MarketEmbed symbol={selected![0]!} dark={dark} /></div></section>}
    </main>
    <footer className="tnp-footer"><span>Independent by design. Disciplined by practice.</span><span>Built on <a href="https://github.com/dylanpersonguy/OpenCharts" target="_blank" rel="noreferrer">OpenCharts</a> · <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">TradingView Lightweight Charts™</a></span></footer>
    {riskOpen && <RiskCalculator close={() => setRiskOpen(false)} />}
  </div>;
}
