import { useState } from "react";
import { uid } from "./lib/uid.ts";
import { ASSET_CATALOG, IndicatorAlertSchema, type IndicatorAlert, type Workspace } from "./ninja-workspace.ts";
import { indicatorKey, type IndicatorStatuses } from "./ninja-indicator-alerts.ts";

export function NinjaIndicatorAlerts({ workspace, onUpdate, demo, statuses }: { workspace: Workspace; onUpdate: (w: Workspace) => boolean; demo: boolean; statuses: IndicatorStatuses }) {
  const [asset, setAsset] = useState("BTCUSD");
  const [timeframe, setTimeframe] = useState<IndicatorAlert["timeframe"]>("1h");
  const [direction, setDirection] = useState<"above" | "below">("above");
  const [threshold, setThreshold] = useState("70");
  const [message, setMessage] = useState("");
  const add = () => {
    if (workspace.indicatorAlerts.length >= 20) { setMessage("Up to 20 RSI alerts can be saved. Delete old alerts first."); return; }
    const parsed = IndicatorAlertSchema.safeParse({ id: uid(), asset, timeframe, direction, threshold: threshold.trim() ? Number(threshold) : NaN, createdAt: new Date().toISOString(), firedAt: null, firedValue: null, firedBar: null });
    if (!parsed.success) { setMessage("Enter an RSI threshold from 0 to 100."); return; }
    if (!onUpdate({ ...workspace, indicatorAlerts: [parsed.data, ...workspace.indicatorAlerts] })) { setMessage("RSI alert could not be saved."); return; }
    setMessage("RSI alert armed. It may trigger at the next check if the completed-bar value already meets the condition. Check storage status for persistence.");
  };
  return <section className="tnp-panel"><span className="tnp-eyebrow">IN-SESSION INDICATOR MONITORING</span><h2>Crypto RSI alerts</h2>
    <p>One-shot RSI 14 thresholds use up to 100 completed candles, not the current forming candle. {demo ? "Historical demo candles are time-shifted and not live. " : "Candles come from Binance public history. "}A condition already met can trigger on the next check; this is not a crossing alert. One pair/timeframe is checked at a time, at least five seconds apart and no more than once per minute per pair/timeframe. More alerts, slow requests or provider limits can delay checks.</p>
    <p>Checks run only while this tab is open and visible; they pause when hidden, closed, offline or suspended. No push, email or guaranteed delivery. Stale or invalid history is rejected. Alerts can fire after returning if the condition is already met. This is not investment advice.</p>
    <div className="tnp-inline-actions"><label>RSI instrument<select value={asset} onChange={(e) => setAsset(e.target.value)}>{ASSET_CATALOG.filter((a) => a.market === "crypto").map((a) => <option key={a.id} value={a.id}>{a.id.replace("USD", "/USDT")}</option>)}</select></label><label>RSI timeframe<select value={timeframe} onChange={(e) => setTimeframe(e.target.value as IndicatorAlert["timeframe"])}>{["15m", "1h", "4h", "1d"].map((t) => <option key={t}>{t}</option>)}</select></label><label>RSI condition<select value={direction} onChange={(e) => setDirection(e.target.value as "above" | "below")}><option value="above">At or above</option><option value="below">At or below</option></select></label><label>RSI threshold<input type="number" min="0" max="100" step="any" value={threshold} onChange={(e) => setThreshold(e.target.value)} /></label><button onClick={add}>Add RSI alert</button></div>
    {message && <p role="status">{message}</p>}
    {workspace.indicatorAlerts.length ? <ul className="tnp-indicator-list">{workspace.indicatorAlerts.map((a) => { const status = statuses[indicatorKey(a.asset, a.timeframe)]; return <li key={a.id}><div><strong>{a.asset.replace("USD", "/USDT")} · {a.timeframe}</strong><p>RSI at or {a.direction} {a.threshold}</p><p>{a.firedAt ? `Triggered ${new Date(a.firedAt).toLocaleString()} · RSI ${a.firedValue?.toFixed(2)} · bar opened ${new Date(a.firedBar! * 1000).toISOString()}${demo ? " (shifted)" : ""}` : status?.error ? `Armed · check failed ${new Date(status.checkedAt).toLocaleTimeString()}: ${status.error}` : status?.value != null ? `Armed · last checked ${new Date(status.checkedAt).toLocaleTimeString()} · RSI ${status.value.toFixed(2)} · bar opened ${new Date(status.bar! * 1000).toISOString()}${demo ? " (shifted)" : ""}` : "Armed · awaiting check"}</p></div><button aria-label={`Delete RSI alert ${a.asset} ${a.timeframe} ${a.direction} ${a.threshold}`} onClick={() => { if (!onUpdate({ ...workspace, indicatorAlerts: workspace.indicatorAlerts.filter((v) => v.id !== a.id) })) setMessage("RSI alert could not be deleted."); }}>Delete</button></li>; })}</ul> : <div className="tnp-empty">No RSI alerts saved yet.</div>}
  </section>;
}
