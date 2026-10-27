import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { QueryClient } from "@tanstack/react-query";
import { ArrowUpRight, CandlestickChart, Check, ChevronDown, CircleHelp, Download, Moon, ShieldCheck, Sun, X } from "lucide-react";
import { createDemoAdapter } from "./adapter/demo.ts";
import { OpenChartsProvider } from "./adapter/provider.tsx";
import { Terminal } from "./terminal/Terminal.tsx";
import { safeStorage } from "./lib/safe-storage.ts";
import { createNinjaLiveAdapter, type FeedHealth } from "./ninja-live.ts";
import * as engine from "./services/demo/engine.ts";
import { MarketEmbed } from "./NinjaMarketChart.tsx";
import { NinjaDashboard, BackupControls } from "./NinjaDashboard.tsx";
import { NinjaPlanner } from "./NinjaPlanner.tsx";
import { ASSET_CATALOG, type Market, type View } from "./ninja-workspace.ts";
import { startLocalSession, type LocalSession } from "./ninja-session.ts";
import { useTradingStore } from "./services/store.tsx";

const CATEGORIES: { id: View; name: string; detail: string }[] = [
  { id: "dashboard", name: "Dashboard", detail: "Your research desk" },
  { id: "crypto", name: "Crypto", detail: "Native terminal" },
  { id: "forex", name: "Forex", detail: "Embedded charts" },
  { id: "metals", name: "Gold & silver", detail: "Embedded charts" },
  { id: "stocks", name: "Stocks", detail: "Embedded charts" },
  { id: "planner", name: "Strategy planner", detail: "Manual checklists" },
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
  const [session, setSession] = useState<LocalSession | null>(null);
  useEffect(() => {
    let cancelled = false;
    void startLocalSession(DEMO ? "demo" : "live").then((next) => { if (!cancelled) setSession(next); });
    return () => { cancelled = true; };
  }, []);
  if (!session) return <div className="tnp-boot" role="status">Opening your local TradingNinjaPro workspace…</div>;
  return <NinjaApp session={session} />;
}

function NinjaApp({ session }: { session: LocalSession }) {
  const state = useSyncExternalStore(session.subscribe, session.getState);
  const blocked = state.status === "blocked" || state.status === "busy";
  const [view, setView] = useState<View>(() => {
    const saved = safeStorage.getItem("tnp-v2-view");
    return CATEGORIES.some((c) => c.id === saved) ? saved as View : "dashboard";
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
  const [adapter] = useState(() => session.wrapAdapter(live?.adapter ?? createDemoAdapter()));
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 5000 } } }));
  useEffect(() => {
    if (!live) return;
    return live.onHealth((next) => { setHealth(next); if (next === "live") void queryClient.invalidateQueries(); });
  }, [live, queryClient]);
  useEffect(() => {
    document.documentElement.classList.toggle("light", !dark);
    document.documentElement.classList.toggle("dark", dark);
    safeStorage.setItem("tnp-theme", dark ? "dark" : "light");
  }, [dark]);
  const external = view === "forex" || view === "metals" || view === "stocks" ? view : null;
  const selected = external ? ASSETS[external].find((a) => a[0] === symbol) ?? ASSETS[external][0]! : null;
  const selectView = (next: View) => {
    setView(next); safeStorage.setItem("tnp-v2-view", next);
    if (next === "forex" || next === "metals" || next === "stocks") setSymbol(ASSETS[next][0]![0]!);
  };
  const openAsset = (id: string) => {
    const asset = ASSET_CATALOG.find((a) => a.id === id); if (!asset) return;
    setView(asset.market); safeStorage.setItem("tnp-v2-view", asset.market);
    if (asset.market === "crypto") useTradingStore.getState().setSelectedSymbol(asset.id);
    else setSymbol(asset.id);
  };
  const healthLabel = { live: "Live quotes", waiting: "Connecting…", stale: "Stale · trading paused", reconnecting: "Reconnecting · trading paused", offline: "Offline · trading paused" }[health];
  const toggleMode = () => {
    if (!window.confirm("Switch data mode? Live and historical practice accounts are stored separately. Browser-local saves are not cloud sync. Stops and pending orders are evaluated only while this app receives ticks.")) return;
    const url = new URL(window.location.href);
    if (DEMO) url.searchParams.delete("mode"); else url.searchParams.set("mode", "demo");
    window.location.assign(url.href);
  };
  return <div className="tnp" data-theme={dark ? "dark" : "light"}>
    <a href="#tnp-workspace" className="tnp-skip">Skip to workspace</a>
    <header className="tnp-header">
      <a className="tnp-brand" href={`${import.meta.env.BASE_URL}${DEMO ? "?mode=demo" : ""}`} onClick={(e) => { e.preventDefault(); selectView("dashboard"); }} aria-label="TradingNinjaPro home"><span className="tnp-mark" aria-hidden="true"><CandlestickChart size={25} /></span><span>TradingNinja<span className="tnp-pro">Pro</span><small>THE INDEPENDENT TRADER’S WORKSPACE</small></span></a>
      <div className="tnp-header-actions"><span className="tnp-practice"><ShieldCheck size={15} /> Paper trading only</span><button onClick={() => setRiskOpen(true)}>Risk calculator</button><button aria-label={dark ? "Use light theme" : "Use dark theme"} onClick={() => setDark((v) => !v)}>{dark ? <Sun size={19} /> : <Moon size={19} />}</button><button aria-label="About and data sources" aria-expanded={aboutOpen} onClick={() => setAboutOpen((v) => !v)}><CircleHelp size={19} /></button></div>
    </header>
    <div className="tnp-marketbar"><nav aria-label="Workspace navigation">{CATEGORIES.map((c) => <button key={c.id} aria-current={view === c.id ? "page" : undefined} onClick={() => selectView(c.id)}>{c.name}<span>{c.detail}</span></button>)}</nav><span className="tnp-version">V0.2</span></div>
    {aboutOpen && <section className="tnp-about" aria-label="About TradingNinjaPro"><div><h2>Built for practice. Clear about the data.</h2><p>An independent fork of <a href="https://github.com/dylanpersonguy/OpenCharts" target="_blank" rel="noreferrer">OpenCharts</a>. No deposits, brokerage accounts or real-money execution. Educational software, not investment advice. Dashboard and planner workflows are original implementations—not copies of proprietary products.</p></div><div><h3>Know what you’re seeing</h3><p>Crypto: Binance spot USDT pairs (legacy native labels end in USD). Paper fills use the midpoint; the depth ladder is synthetic. Live candles and volume between history refreshes are approximations. Native replay is disabled in live mode to avoid mixing chart history with current practice execution.</p><p>Accounts, journal, watchlists and plans are browser-local, with separate live/demo saves. Use backup/restore to move them between domains or devices. Open positions initially show their entry mark after reload until fresh ticks arrive. Offline stops cannot execute; orders may fill at a gap on reconnection. No unattended trading or cloud sync.</p><p>Forex, metals, equities and all multi-chart embeds are display-only. Quotes and delays depend on the provider. The manual strategy planner does not evaluate signals or backtest. The crypto scanner uses completed 1-hour candles, not an executable signal.</p><p>TradingView Lightweight Charts™ · Copyright (с) 2025 TradingView, Inc. <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">tradingview.com</a>. Licence notices are included in the deployment.</p></div></section>}
    <main id="tnp-workspace" className="tnp-main" tabIndex={-1}>
      <div className="tnp-sourcebar"><div><span className={`tnp-status ${view === "crypto" && !DEMO && health === "live" ? "is-live" : ""}`} />{view === "crypto" ? <><strong>{DEMO ? "Historical replay" : "Binance spot"}</strong><span>{DEMO ? "Not live · simulated stream" : healthLabel}</span></> : external ? <><strong>TradingView embed</strong><span>Provider-dependent data & delays · display only</span></> : <><strong>{view === "planner" ? "Manual strategy planner" : "Research workspace"}</strong><span>{DEMO ? "Historical practice mode · not live" : "Live-data practice mode"} · {state.status === "ready" ? "local save enabled" : state.status}</span></>}</div><button onClick={toggleMode}>{DEMO ? "Switch to live" : "Use historical demo"}<ChevronDown size={14} /></button></div>
      {state.status === "memory-only" && <div className="tnp-storage-warning" role="alert">{state.message}</div>}
      {blocked ? <section className="tnp-recovery"><h1>Local account unavailable</h1><p role="alert">{state.message}</p><button onClick={() => window.location.reload()}>Reload this tab</button><BackupControls session={session} state={state} /></section> : <>
        {view === "dashboard" && <NinjaDashboard session={session} state={state} dark={dark} adapter={adapter} demo={DEMO} health={health} onOpen={openAsset} onPlanner={() => selectView("planner")} />}
        {view === "planner" && <NinjaPlanner workspace={state.workspace} onUpdate={session.updateWorkspace} onOpen={openAsset} />}
        <section className="tnp-native" hidden={view !== "crypto"} aria-label="Crypto practice terminal">
          <div className="tnp-session-note"><span>{DEMO ? "Historical" : "Live-data"} practice account · {state.status === "ready" ? "saved on this browser" : "temporary session"} · USDT quoted markets</span><button onClick={() => { downloadTrades(); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>{copied ? <Check size={14} /> : <Download size={14} />}{copied ? "CSV downloaded" : "Export closed trades"}</button></div>
          <div className="tnp-terminal"><OpenChartsProvider adapter={adapter} queryClient={queryClient} fallback={<div className="tnp-loading">Preparing your TradingNinjaPro workspace…</div>}><Terminal /></OpenChartsProvider></div>
          {!DEMO && health !== "live" && <div className="tnp-feed-notice" role="status">Waiting for fresh quotes. New paper orders and manual closes are paused. Automatic stops cannot execute offline. Provider access restrictions may apply. <button onClick={toggleMode}>Use historical demo instead</button></div>}
        </section>
        {external && <section className="tnp-external" aria-label={`${external} charts`}><div className="tnp-instruments"><div><span className="tnp-eyebrow">EXPLORE MARKETS</span><h1>{external === "metals" ? "Precious metals" : external === "stocks" ? "US equities" : "Foreign exchange"}</h1></div><label>Instrument<select value={selected![0]} onChange={(e) => setSymbol(e.target.value)}>{ASSETS[external].map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><p>Use the embedded chart’s symbol search to explore additional instruments. Availability varies by provider.</p><div className="tnp-display-note"><ShieldCheck size={18} /><span><b>Analysis, not execution.</b> These charts are not connected to the practice account.</span></div><button onClick={() => setRiskOpen(true)}>Plan a position <ArrowUpRight size={16} /></button></div><div className="tnp-chart-card"><MarketEmbed symbol={selected![0]!} dark={dark} /></div></section>}
      </>}
    </main>
    <footer className="tnp-footer"><span>Independent by design. Disciplined by practice. · v0.2</span><span>Built on <a href="https://github.com/dylanpersonguy/OpenCharts" target="_blank" rel="noreferrer">OpenCharts</a> · <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">TradingView Lightweight Charts™</a></span></footer>
    {riskOpen && <RiskCalculator close={() => setRiskOpen(false)} />}
  </div>;
}
