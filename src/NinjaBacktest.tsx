import { useState } from "react";
import type { OpenChartsAdapter } from "./adapter/types.ts";
import { ASSET_CATALOG, CONDITION_LABELS, type StrategyPlan } from "./ninja-workspace.ts";
import { runBacktest, type BacktestTrade } from "./ninja-backtest.ts";

export function NinjaBacktest({ plans, adapter, demo }: { plans: StrategyPlan[]; adapter: OpenChartsAdapter; demo: boolean }) {
  const [id, setId] = useState(""); const [qty, setQty] = useState("0.01"); const [fee, setFee] = useState("0.1"); const [slippage, setSlippage] = useState("0.05");
  const [result, setResult] = useState<{ trades: BacktestTrade[]; bars: number; name: string; symbol: string; timeframe: string; at: string; quantity: number; fee: number; slippage: number; lastBar: number; side: string; stop: number; target: number; rules: string[] } | null>(null);
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  const plan = plans.find((p) => p.id === id);
  const run = async () => {
    if (!plan || !ASSET_CATALOG.some((a) => a.id === plan.asset && a.market === "crypto")) { setMessage("Choose a saved crypto strategy."); return; }
    const quantity = Number(qty), feePercent = Number(fee), slippagePercent = Number(slippage);
    if (![qty,fee,slippage].every((x) => x.trim()) || !Number.isFinite(quantity) || quantity <= 0 || quantity > 1000 || !Number.isFinite(feePercent) || feePercent < 0 || feePercent > 5 || !Number.isFinite(slippagePercent) || slippagePercent < 0 || slippagePercent > 5) { setMessage("Quantity must be 0–1000, above zero; fees and slippage must be 0–5% each."); return; }
    setBusy(true); setMessage(""); setResult(null);
    try {
      const data = await adapter.marketData.getCandles({ symbol: plan.asset, timeframe: plan.timeframe, limit: 1000 });
      const seconds = { "15m":900, "1h":3600, "4h":14400, "1d":86400 }[plan.timeframe];
      const bars = data.filter((c) => (c.time + seconds) * 1000 <= Date.now());
      const trades = runBacktest(bars, plan, { quantity, feePercent, slippagePercent });
      setResult({ trades, bars: bars.length, name: plan.name, symbol: plan.asset, timeframe: plan.timeframe, at: new Date().toISOString(), quantity, fee: feePercent, slippage: slippagePercent, lastBar: bars.at(-1)!.time, side: plan.side, stop: plan.stopPercent, target: plan.targetR, rules: plan.conditions.map((c) => CONDITION_LABELS[c]) });
    } catch (e) { setMessage(e instanceof Error ? e.message : "Backtest data unavailable."); }
    finally { setBusy(false); }
  };
  const metrics = (() => {
    let cumulative = 0, peak = 0, drawdown = 0, totalFees = 0;
    for (const t of result?.trades ?? []) { cumulative += t.pnl; peak = Math.max(peak, cumulative); drawdown = Math.max(drawdown, peak - cumulative); totalFees += t.fees; }
    return { cumulative, drawdown, totalFees };
  })();
  return <section className="tnp-panel"><span className="tnp-eyebrow">HISTORICAL RESEARCH</span><h2>Crypto strategy backtest</h2><p>Test saved crypto plans on up to 1,000 completed candles. Signals use all selected rules at bar close; entry is at the next bar’s open. One position at a time, fixed units, no margin, funding or borrowing costs. If stop and target are both hit in one candle, the stop is assumed first. Stops can gap; target fills receive no gap improvement. Fees and slippage are assumptions, not exchange quotes.</p><p>{demo ? "Historical demo data is time-shifted and is not live. Results are illustrative." : "Binance public historical candles; availability and rate limits apply."} No result is a prediction or investment advice. This test does not modify the practice account.</p>
    <div className="tnp-form-grid"><label>Saved crypto plan<select value={id} disabled={busy} onChange={(e) => { setId(e.target.value); setResult(null); }}><option value="">Choose plan</option>{plans.filter((p) => ASSET_CATALOG.some((a) => a.id === p.asset && a.market === "crypto")).map((p) => <option key={p.id} value={p.id}>{p.name} · {p.asset.replace("USD","/USDT")} · {p.timeframe} · {p.side}</option>)}</select></label><label>Fixed quantity (units)<input type="number" min="0.00000001" max="1000" step="any" value={qty} onChange={(e) => setQty(e.target.value)} /></label><label>Fee per fill (%)<input type="number" min="0" max="5" step="0.01" value={fee} onChange={(e) => setFee(e.target.value)} /></label><label>Adverse slippage per fill (%)<input type="number" min="0" max="5" step="0.01" value={slippage} onChange={(e) => setSlippage(e.target.value)} /></label></div><button disabled={busy || !plan} onClick={() => void run()}>{busy ? "Running…" : "Run backtest"}</button>{message && <p role="status">{message}</p>}
    {result && <div role="status"><p>Results for {result.name} · {result.symbol.replace("USD","/USDT")} · {result.timeframe} · {result.bars} completed bars · run {new Date(result.at).toLocaleString()}. Last bar opened {new Date(result.lastBar * 1000).toISOString()} {demo ? "(shifted)" : ""}. Side {result.side} · stop {result.stop}% · target {result.target}R · quantity {result.quantity} · fee {result.fee}% per fill · slippage {result.slippage}% per fill. Rules: {result.rules.join("; ")}. Rerun after changes.</p><p><b>{result.trades.length} simulated closes</b> · net P&amp;L {metrics.cumulative.toLocaleString(undefined,{style:"currency",currency:"USD"})} · {result.trades.filter((t)=>t.pnl>0).length} winning closes · total fees {metrics.totalFees.toLocaleString(undefined,{style:"currency",currency:"USD"})} · maximum realised drawdown {metrics.drawdown.toLocaleString(undefined,{style:"currency",currency:"USD"})}. Drawdown is measured after closes and excludes intratrade moves. Costs and market behaviour may differ significantly in reality.</p><div className="tnp-table-scroll"><table><thead><tr><th>Entry bar (UTC)</th><th>Exit bar (UTC)</th><th>Entry</th><th>Exit</th><th>Fees</th><th>Net P&amp;L</th><th>Reason</th></tr></thead><tbody>{result.trades.map((t,i)=><tr key={i}><td>{new Date(t.entryTime*1000).toISOString().slice(0,16).replace("T"," ")}</td><td>{new Date(t.exitTime*1000).toISOString().slice(0,16).replace("T"," ")}</td><td>{t.entry.toFixed(4)}</td><td>{t.exit.toFixed(4)}</td><td>{t.fees.toFixed(2)}</td><td>{t.pnl.toFixed(2)}</td><td>{t.reason}</td></tr>)}</tbody></table></div>{!result.trades.length && <p>No signals led to a completed trade in this dataset.</p>}</div>}
  </section>;
}
