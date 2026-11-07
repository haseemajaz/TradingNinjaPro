import { useState } from "react";
import { CONDITION_LABELS, TradeReviewSchema, type TradeReview, type Workspace } from "./ninja-workspace.ts";
import type { ClosedPosition } from "./services/schemas.ts";
import { performance } from "./ninja-performance.ts";

const money = (n: number) => n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 });
function BalanceChart({ points }: { points: number[] }) {
  if (points.length < 2) return null;
  const min = Math.min(...points), max = Math.max(...points), span = max - min || Math.max(Math.abs(max) * .01, 1);
  const low = min === max ? min - span / 2 : min, high = min === max ? max + span / 2 : max;
  const vertices = points.map((v, i) => `${40 + 920 * i / (points.length - 1)},${12 + 136 * (high - v) / (high - low)}`).join(" ");
  return <div className="tnp-balance-chart"><div className="tnp-chart-scale"><span>{money(high)}</span><span>{money(low)}</span></div><svg viewBox="0 0 1000 160" preserveAspectRatio="none" role="img" aria-label={`Reconstructed balance at ${points.length - 1} successive closes, from ${money(points[0]!)} to ${money(points.at(-1)!)}. Exact close values are in the table below.`}><polyline points={vertices} fill="none" stroke="currentColor" strokeWidth="3" vectorEffect="non-scaling-stroke" /></svg><div className="tnp-chart-axis"><span>Before first close</span><span>After latest close</span></div></div>;
}

function TradeReviews({ records, workspace, onUpdate }: { records: ClosedPosition[]; workspace: Workspace; onUpdate: (w: Workspace) => boolean }) {
  const [selected, setSelected] = useState("");
  const [draft, setDraft] = useState<TradeReview | null>(null);
  const [message, setMessage] = useState("");
  const chooseRecord = (id: string) => { setSelected(id); setDraft(workspace.reviews.find((r) => r.closedId === id) ?? null); setMessage(""); };
  const selectPlan = (id: string) => {
    const plan = workspace.plans.find((p) => p.id === id);
    if (!plan) { setDraft(null); return; }
    setDraft({ closedId: selected, planId: plan.id, planName: plan.name, rules: [...plan.conditions.map((c) => CONDITION_LABELS[c]), "Risk, spread and stop distance reviewed", "Data source, market session and events reviewed"], checked: [], notes: "", updatedAt: new Date().toISOString() });
  };
  const save = () => {
    if (!draft) return;
    const parsed = TradeReviewSchema.safeParse({ ...draft, updatedAt: new Date().toISOString() });
    if (!parsed.success) { setMessage("Review could not be saved; check your notes and selections."); return; }
    if (workspace.reviews.length >= 1000 && !workspace.reviews.some((r) => r.closedId === selected)) { setMessage("Review limit reached; export a backup before removing old reviews."); return; }
    if (!onUpdate({ ...workspace, reviews: [parsed.data, ...workspace.reviews.filter((r) => r.closedId !== selected)] })) { setMessage("Review could not be saved."); return; }
    setDraft(parsed.data); setMessage("Review saved locally; check storage status for persistence.");
  };
  return <section className="tnp-panel tnp-review"><h2>Strategy-linked trade review</h2><p>After a close, associate a saved strategy and record your own review. This does not verify that the rules were met or attach a plan at order entry. Partial closes are separate records.</p>
    {!records.length ? <div className="tnp-empty">Close a paper position to review it here.</div> : <><div className="tnp-form-grid"><label>Closed record<select value={selected} onChange={(e) => chooseRecord(e.target.value)}><option value="">Choose a closed record</option>{records.map((r) => <option key={r.id} value={r.id}>{r.symbolName} · {r.side} · {money(r.realizedPnl)} · {r.closedAt ? new Date(r.closedAt).toLocaleString() : "date unavailable"} {r.isPartialClose ? "· partial" : ""}</option>)}</select></label><label>Saved strategy<select value={draft?.planId ?? ""} disabled={!selected} onChange={(e) => selectPlan(e.target.value)}><option value="">Choose a saved plan</option>{draft && !workspace.plans.some((p) => p.id === draft.planId) && <option value={draft.planId}>{draft.planName} (deleted plan snapshot)</option>}{workspace.plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label></div>
      {selected && !workspace.plans.length && !draft && <p>Save a strategy in the planner first.</p>}
      {draft && <><p>Snapshot of “{draft.planName}” at review time. Check only items you personally verified.</p><fieldset><legend>Review checklist</legend>{draft.rules.map((rule, i) => <label className="tnp-checkbox" key={`${i}-${rule}`}><input type="checkbox" checked={draft.checked.includes(i)} onChange={(e) => setDraft({ ...draft, checked: e.target.checked ? [...draft.checked, i] : draft.checked.filter((v) => v !== i) })} />{rule}</label>)}</fieldset><label className="tnp-review-notes">Review notes<textarea rows={3} maxLength={4000} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></label><div className="tnp-inline-actions"><button onClick={save}>Save review</button><span>{draft.checked.length} / {draft.rules.length} items checked</span></div></>}{message && <p role="status">{message}</p>}</>}
  </section>;
}

export function NinjaPerformance({ records, balance, workspace, onUpdate }: { records: ClosedPosition[]; balance: number; workspace: Workspace; onUpdate: (w: Workspace) => boolean }) {
  const data = performance(records, balance);
  return <><section className="tnp-panel" aria-labelledby="performance-title"><span className="tnp-eyebrow">PRACTICE REVIEW</span><h2 id="performance-title">Paper performance</h2><p>Closed records only; partial closes count separately. Simulated results are not verified and do not predict future performance. Current engine uses midpoint fills, 100× leverage and zero commissions; actual execution costs and risk can differ substantially.</p>
    <div className="tnp-performance-stats"><div><span>Realised P&amp;L</span><b>{money(data.pnl)}</b></div><div><span>Winning closes / all closes</span><b>{data.winRate == null ? "—" : `${(data.winRate * 100).toFixed(1)}%`}</b><small>{data.wins} wins · {data.losses} losses · {data.flat} flat</small></div><div><span>Average winning close</span><b>{data.averageWin == null ? "—" : money(data.averageWin)}</b></div><div><span>Average losing close</span><b>{data.averageLoss == null ? "—" : money(data.averageLoss)}</b></div><div><span>Max realised drawdown</span><b>{data.maxDrawdown == null ? "Unavailable" : money(data.maxDrawdown)}</b></div></div>
    {records.length > 0 && <><h3>Reconstructed realised balance</h3><p>Starts at current balance minus recorded realised P&amp;L, then adds each close in chronological order. This is not a time-weighted or mark-to-market equity curve; open-position changes and intratrade drawdown are excluded.</p>{data.points.length ? <BalanceChart points={data.points} /> : <p>Chart and drawdown unavailable because a close date is missing or invalid.</p>}
      <h3>By instrument</h3><div className="tnp-table-scroll"><table><thead><tr><th>Instrument</th><th>Close records</th><th>Realised P&amp;L</th></tr></thead><tbody>{data.symbols.map((s) => <tr key={s.symbol}><td>{s.symbol.replace("USD", "/USDT")}</td><td>{s.count}</td><td>{money(s.pnl)}</td></tr>)}</tbody></table></div>
      <details><summary>Exact close-by-close balance data</summary><div className="tnp-table-scroll"><table><thead><tr><th>Close</th><th>Time</th><th>Instrument</th><th>Realised P&amp;L</th><th>Balance after close</th></tr></thead><tbody>{data.ordered.map((r, i) => <tr key={r.id}><td>{i + 1}{r.isPartialClose ? " · partial" : ""}</td><td>{r.closedAt}</td><td>{r.symbolName}</td><td>{money(r.realizedPnl)}</td><td>{money(data.points[i + 1]!)}</td></tr>)}</tbody></table></div></details></>}
    {!records.length && <div className="tnp-empty">Close a practice position to start tracking results.</div>}</section><TradeReviews records={records} workspace={workspace} onUpdate={onUpdate} /></>;
}
