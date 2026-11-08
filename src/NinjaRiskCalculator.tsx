import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { calculateRisk, type RiskInputs } from "./ninja-risk.ts";

function number(value: string) { return value.trim() === "" ? NaN : Number(value); }
function display(value: number, digits = 2) { return value.toLocaleString(undefined, { maximumFractionDigits: digits }); }
export function NinjaRiskCalculator({ close }: { close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [side, setSide] = useState<RiskInputs["side"]>("long");
  const [balance, setBalance] = useState("10000"), [risk, setRisk] = useState("1"), [entry, setEntry] = useState("100"), [stop, setStop] = useState("98"), [target, setTarget] = useState(""), [contract, setContract] = useState("1"), [fee, setFee] = useState("0"), [slippage, setSlippage] = useState("0"), [leverage, setLeverage] = useState("1");
  let result: ReturnType<typeof calculateRisk> | null = null, error = "";
  try { result = calculateRisk({ balance: number(balance), riskPercent: number(risk), side, entry: number(entry), stop: number(stop), target: target.trim() === "" ? null : number(target), contractSize: number(contract), feeBps: number(fee), slippageBps: number(slippage), leverage: number(leverage) }); } catch (e) { error = e instanceof Error ? e.message : "Check the inputs."; }
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog className="tnp-dialog" ref={dialog} onCancel={close} onClose={close} aria-labelledby="risk-title">
    <div className="tnp-dialog-heading"><h2 id="risk-title">Plan your risk</h2><button aria-label="Close risk calculator" onClick={close}><X /></button></div>
    <p>Scenario for a linear instrument whose quote currency matches the account currency. Estimates only; this does not place or change trades.</p>
    <div className="tnp-risk-fields"><label>Direction<select value={side} onChange={(e) => setSide(e.target.value as RiskInputs["side"])}><option value="long">Long</option><option value="short">Short</option></select></label>{([
      ["Account balance", balance, setBalance], ["Risk per trade (%)", risk, setRisk], ["Entry price", entry, setEntry], ["Stop price", stop, setStop], ["Target price (optional)", target, setTarget], ["Contract size per unit", contract, setContract], ["Fee per fill (bps)", fee, setFee], ["Adverse slippage per fill (bps)", slippage, setSlippage], ["Assumed leverage", leverage, setLeverage],
    ] as const).map(([label, value, setter]) => <label key={label}>{label}<input type="number" min="0" step="any" value={value} onChange={(e) => setter(e.target.value)} /></label>)}</div>
    <div className="tnp-risk-result" aria-live="polite">{result ? <><span>Risk budget <b>{display(result.budget)}</b></span><span>Estimated units <b>{display(result.units, 8)}</b></span><span>Assumed entry / stop fill <b>{display(result.entryFill, 8)} / {display(result.stopFill, 8)}</b></span><span>Entry notional <b>{display(result.notional)}</b></span><span>Estimated initial margin <b>{display(result.margin)}</b></span>{result.targetPnl !== null && <><span>Net P&amp;L at target <b>{display(result.targetPnl)}</b></span><span>Net reward / risk <b>{display(result.rewardRisk!, 2)}R</b></span></>}{result.margin > number(balance) && <p>Estimated initial margin exceeds the entered balance; this position may not be affordable.</p>}</> : <p>{error}</p>}</div>
    <p className="tnp-fine">1 basis point (bp) = 0.01%. Fees and adverse slippage are applied at entry and exit; include spread in the slippage assumption if needed. Excludes funding, taxes, exchange increments and liquidation; round position sizes down to the permitted increment. Stops can gap and losses can exceed the budget. This calculator does not change the paper engine, which uses midpoint fills, 100× leverage and no commission.</p>
  </dialog>;
}
