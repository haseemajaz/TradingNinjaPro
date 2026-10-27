import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Download, LayoutGrid, Plus, RefreshCw, Trash2, Upload } from "lucide-react";
import { MarketEmbed } from "./NinjaMarketChart.tsx";
import { ASSET_CATALOG, downloadText, type Workspace } from "./ninja-workspace.ts";
import type { LocalSession, LocalState } from "./ninja-session.ts";
import type { OpenChartsAdapter } from "./adapter/types.ts";
import { uid } from "./lib/uid.ts";
import { rsi, sma } from "./lib/indicators.ts";
import { useTradingStore } from "./services/store.tsx";
import * as engine from "./services/demo/engine.ts";
import type { FeedHealth } from "./ninja-live.ts";

export function BackupControls({ session, state }: { session: LocalSession; state: LocalState }) {
  const file = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");
  const restore = async (input: HTMLInputElement) => {
    const selected = input.files?.[0]; if (!selected) return;
    try {
      if (selected.size > 4_000_000) throw new Error("Backup exceeds 4 MB.");
      const text = await selected.text();
      if (!window.confirm("Replace this data mode’s saved practice account, journal, watchlists and strategy plans with this backup? Export a current backup first. Other data modes are not changed.")) return;
      session.importBackup(text); window.location.reload();
    } catch (e) { setMessage(e instanceof Error ? e.message : "Backup could not be restored."); }
    finally { input.value = ""; }
  };
  return <div className="tnp-backups"><div className="tnp-inline-actions">
    <button disabled={state.status === "busy" || state.status === "blocked"} onClick={() => { try { downloadText("TradingNinjaPro-local-backup.json", session.exportBackup()); setMessage("Backup downloaded. Keep it private; it includes your notes and practice trades."); } catch (e) { setMessage(e instanceof Error ? e.message : "Backup failed."); } }}><Download size={16} /> Backup</button>
    <button disabled={state.status === "busy"} onClick={() => file.current?.click()}><Upload size={16} /> Restore</button>
    <input ref={file} type="file" accept=".json,application/json" aria-label="Restore local account backup" onChange={(e) => { void restore(e.currentTarget); }} hidden />
    <button disabled={state.status === "busy"} onClick={() => { if (window.confirm("Reset this mode’s financial practice account to $100,000 and remove all positions, orders, fills and closed history? Watchlists, plans and journal notes remain.")) { try { session.resetAccount(); window.location.reload(); } catch (e) { setMessage(e instanceof Error ? e.message : "Reset failed."); } } }}>Reset practice account</button>
  </div><p>Backup contains this mode’s account, journal, watchlists, chart selections and plans. It excludes chart drawings, theme and third-party widget preferences. No cloud sync.</p>{message && <p role="status">{message}</p>}</div>;
}

type ScanRow = { id: string; close?: number; rsi?: number; trend?: string; barTime?: number; error?: string };
function CryptoScanner({ adapter, demo, onOpen }: { adapter: OpenChartsAdapter; demo: boolean; onOpen: (id: string) => void }) {
  const [rows, setRows] = useState<ScanRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [updated, setUpdated] = useState<number | null>(null);
  const [filter, setFilter] = useState("all");
  const lastScan = useRef(0);
  const inFlight = useRef(false);
  const [message, setMessage] = useState("");
  const scan = async () => {
    if (inFlight.current) return;
    if (Date.now() - lastScan.current < 60_000) { setMessage("Wait at least one minute between scans to respect provider limits."); return; }
    inFlight.current = true; lastScan.current = Date.now(); setBusy(true); setMessage("");
    try {
      const result = await Promise.all(ASSET_CATALOG.filter((a) => a.market === "crypto").map(async (a): Promise<ScanRow> => {
        try {
          const data = await adapter.marketData.getCandles({ symbol: a.id, timeframe: "1h", limit: 100 });
          const closed = data.filter((c) => (c.time + 3600) * 1000 <= Date.now());
          if (closed.length < 30) throw new Error("Not enough completed candles.");
          const last = closed.at(-1)!; const mean = sma(closed, 20).at(-1)?.value; const strength = rsi(closed, 14).at(-1)?.value;
          return { id: a.id, close: last.close, rsi: strength, trend: mean == null ? "Unavailable" : last.close >= mean ? "Above SMA 20" : "Below SMA 20", barTime: last.time };
        } catch { return { id: a.id, error: "Unavailable — provider access, rate limits or history" }; }
      }));
      setRows(result); setUpdated(Date.now());
    } finally { setBusy(false); inFlight.current = false; }
  };
  const shown = rows.filter((r) => filter === "all" || (filter === "above" && r.trend === "Above SMA 20") || (filter === "low-rsi" && r.rsi != null && r.rsi < 30));
  return <section className="tnp-panel tnp-scanner" aria-labelledby="scanner-title"><div className="tnp-section-heading"><div><span className="tnp-eyebrow">NATIVE DATA TOOLS</span><h2 id="scanner-title">Crypto technical snapshot</h2></div><button disabled={busy} onClick={() => { void scan(); }}><RefreshCw size={16} />{busy ? "Scanning…" : "Scan 6 pairs"}</button></div>
    <p>Completed 1-hour candles · RSI 14 and SMA 20 · {demo ? "historical demo data, not live" : "Binance USDT markets"}. A manual snapshot, not a recommendation or a backtest.</p>
    <div className="tnp-inline-actions"><label>Filter<select value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">All pairs</option><option value="above">Close above SMA 20</option><option value="low-rsi">RSI below 30</option></select></label>{updated && <span>Scanned {new Date(updated).toLocaleTimeString()}</span>}</div>
    {message && <p role="status">{message}</p>}
    <div className="tnp-table-scroll"><table><thead><tr><th>Pair</th><th>Last completed close</th><th>RSI 14</th><th>Position vs SMA 20</th><th>Bar opened (UTC)</th></tr></thead><tbody>{shown.map((r) => <tr key={r.id}><td><button onClick={() => onOpen(r.id)}>{r.id.replace("USD", "/USDT")}</button></td><td>{r.close?.toLocaleString(undefined, { maximumFractionDigits: 5 }) ?? "Unavailable"}</td><td>{r.rsi?.toFixed(1) ?? "—"}</td><td>{r.error ?? r.trend}</td><td>{r.barTime ? new Date(r.barTime * 1000).toISOString().replace("T", " ").slice(0, 16) : "—"}</td></tr>)}</tbody></table></div>
    {!rows.length && <div className="tnp-empty">Run a scan to calculate indicators from available historical candles. Six requests per scan; no continuous background scanning.</div>}
    {rows.length > 0 && shown.length === 0 && <div className="tnp-empty">No pairs match this filter. Missing data is not treated as a match.</div>}
  </section>;
}

export function NinjaDashboard({ session, state, dark, adapter, demo, health, onOpen, onPlanner }: {
  session: LocalSession; state: LocalState; dark: boolean; adapter: OpenChartsAdapter; demo: boolean; health: FeedHealth;
  onOpen: (id: string) => void; onPlanner: () => void;
}) {
  const w = state.workspace;
  const active = w.lists.find((l) => l.id === w.activeList)!;
  const ticks = useTradingStore((s) => s.ticks);
  const [snapshot, setSnapshot] = useState(() => engine.exportPaperSnapshot());
  const [now, setNow] = useState(() => Date.now());
  const [newList, setNewList] = useState("");
  const [query, setQuery] = useState("");
  const [assetToAdd, setAssetToAdd] = useState<string>("BTCUSD");
  const [error, setError] = useState("");
  useEffect(() => { const t = setInterval(() => { setSnapshot(engine.exportPaperSnapshot()); setNow(Date.now()); }, 1500); return () => clearInterval(t); }, []);
  const update = (next: Workspace) => { try { session.updateWorkspace(next); setError(""); } catch { setError("Workspace could not be saved. Check list names and the storage status."); } };
  const addList = () => {
    if (!newList.trim()) return;
    if (w.lists.length >= 8) { setError("Up to eight watchlists can be saved."); return; }
    const list = { id: uid(), name: newList.trim(), assets: [] as string[] };
    update({ ...w, lists: [...w.lists, list], activeList: list.id }); setNewList("");
  };
  const matches = ASSET_CATALOG.filter((a) => active.assets.includes(a.id) && `${a.id} ${a.name} ${a.market}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="tnp-dashboard">
    <section className="tnp-workspace-intro"><div><span className="tnp-eyebrow">YOUR RESEARCH DESK / V0.2</span><h1>Know your markets.<br />Own your process.</h1><p>One workspace for watchlists, market context and disciplined practice. {demo ? "Historical demo account" : "Live-data practice account"} · {state.status === "ready" ? "saved locally" : "temporary storage"}.</p></div><button className="tnp-primary" onClick={onPlanner}>Build a strategy checklist <ArrowUpRight size={18} /></button></section>
    <div className="tnp-account-cards"><div><span>Paper balance</span><strong>{snapshot.account.balance.toLocaleString(undefined, { style: "currency", currency: "USD" })}</strong><small>Simulated funds · not withdrawable</small></div><div><span>Open positions</span><strong>{snapshot.positions.length}</strong><small>Marked only while fresh ticks arrive</small></div><div><span>Closed records</span><strong>{snapshot.closed.length}</strong><small>Includes partial closes · saved history</small></div></div>
    <section className="tnp-panel" aria-labelledby="watchlists-title"><div className="tnp-section-heading"><div><span className="tnp-eyebrow">FOLLOW WHAT MATTERS</span><h2 id="watchlists-title">Your watchlists</h2></div><span>{w.lists.length} / 8 lists</span></div>
      <div className="tnp-list-tabs" aria-label="Saved watchlists">{w.lists.map((l) => <button key={l.id} aria-pressed={l.id === active.id} onClick={() => update({ ...w, activeList: l.id })}>{l.name}<span>{l.assets.length}</span></button>)}</div>
      <form className="tnp-inline-actions" onSubmit={(e) => { e.preventDefault(); addList(); }}><label>New watchlist<input maxLength={50} value={newList} placeholder="e.g. Macro focus" onChange={(e) => setNewList(e.target.value)} /></label><button type="submit"><Plus size={16} /> Create list</button><button type="button" disabled={w.lists.length === 1} onClick={() => { if (window.confirm(`Delete “${active.name}”?`)) update({ ...w, lists: w.lists.filter((l) => l.id !== active.id), activeList: w.lists.find((l) => l.id !== active.id)!.id }); }}><Trash2 size={16} /> Delete list</button></form>
      <div className="tnp-inline-actions"><label>Add instrument<select value={assetToAdd} onChange={(e) => setAssetToAdd(e.target.value)}>{ASSET_CATALOG.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.market}</option>)}</select></label><button onClick={() => { if (!active.assets.includes(assetToAdd)) update({ ...w, lists: w.lists.map((l) => l.id === active.id ? { ...l, assets: [...l.assets, assetToAdd] } : l) }); }}><Plus size={16} /> Add</button><label>Search this list<input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, symbol or market" /></label></div>
      {error && <p role="alert">{error}</p>}
      <div className="tnp-table-scroll"><table><thead><tr><th>Instrument</th><th>Market</th><th>Quote / availability</th><th>Workspace</th><th><span className="tnp-sr-only">Remove</span></th></tr></thead><tbody>{matches.map((a) => {
        const t = ticks[a.id]; const fresh = t && now - t.timestamp < 20000;
        return <tr key={a.id}><td><b>{a.name}</b><small>{a.market === "crypto" ? a.id.replace("USD", "/USDT") : a.id}</small></td><td>{a.market === "metals" ? "Metals" : a.market}</td><td>{a.market === "crypto" ? fresh && (demo || health === "live") ? <><b>{((t.bid + t.ask) / 2).toLocaleString(undefined, { maximumFractionDigits: 5 })}</b><small>{demo ? "Historical replay · not live" : "Live exchange midpoint · USDT"}</small></> : "Waiting / stale quote" : "Embedded chart · provider-dependent delays"}</td><td><button onClick={() => onOpen(a.id)}>Open <ArrowUpRight size={14} /></button></td><td><button aria-label={`Remove ${a.name} from watchlist`} onClick={() => update({ ...w, lists: w.lists.map((l) => l.id === active.id ? { ...l, assets: l.assets.filter((id) => id !== a.id) } : l) })}><XIcon /></button></td></tr>;
      })}</tbody></table></div>
      {!matches.length && <div className="tnp-empty">No instruments found. Add a market above or clear the search.</div>}
    </section>
    <section className="tnp-panel" aria-labelledby="multi-title"><div className="tnp-section-heading"><div><span className="tnp-eyebrow">CONTEXT, SIDE BY SIDE</span><h2 id="multi-title">Multi-chart desk</h2></div><label>Chart layout<select value={w.chartCount} onChange={(e) => update({ ...w, chartCount: Number(e.target.value) as 1 | 2 | 4 })}><option value={1}>Single chart</option><option value={2}>Two charts</option><option value={4}>Four charts</option></select></label></div><p>Independent TradingView embeds; cursors and timeframes are not synchronised. These charts are display-only—even for crypto—and are separate from native paper execution. Each chart requires an external-content opt-in.</p>
      <div className={`tnp-chart-grid tnp-charts-${w.chartCount}`}>{w.chartAssets.slice(0, w.chartCount).map((id, i) => { const a = ASSET_CATALOG.find((asset) => asset.id === id)!; return <section className="tnp-grid-chart" key={i}><label>Chart {i + 1}<select value={id} onChange={(e) => update({ ...w, chartAssets: w.chartAssets.map((old, j) => j === i ? e.target.value : old) })}>{ASSET_CATALOG.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label><div className="tnp-chart-card"><MarketEmbed symbol={a.chart} dark={dark} /></div></section>; })}</div>
    </section>
    <CryptoScanner adapter={adapter} demo={demo} onOpen={onOpen} />
    <section className="tnp-panel"><div className="tnp-section-heading"><div><span className="tnp-eyebrow">YOUR DATA, YOUR DEVICE</span><h2>Local account & backups</h2></div><LayoutGrid size={24} /></div><p role="status">{state.message}{state.savedAt ? ` · last saved ${new Date(state.savedAt).toLocaleTimeString()}` : ""}. Live and historical-demo accounts are separate. Clearing site data removes local saves. Browser-origin changes do not migrate data: export before moving from this preview to 20i.</p><BackupControls session={session} state={state} /></section>
  </div>;
}
function XIcon() { return <span aria-hidden="true">×</span>; }
