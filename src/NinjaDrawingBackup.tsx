import { useRef, useState } from "react";
import { ASSET_CATALOG, downloadText } from "./ninja-workspace.ts";
import { exportDrawingBackup, parseDrawingBackup, restoreDrawings } from "./ninja-drawing-backup.ts";
import type { LocalSession, LocalState, Mode } from "./ninja-session.ts";

export function NinjaDrawingBackup({ session, state, mode }: { session: LocalSession; state: LocalState; mode: Mode }) {
  const [symbol, setSymbol] = useState("BTCUSD");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const restore = async (input: HTMLInputElement) => {
    const selected = input.files?.[0]; if (!selected) return;
    setBusy(true); setMessage("");
    try {
      if (selected.size > 1_000_000) throw new Error("Drawing backup exceeds the 1 MB limit.");
      const text = await selected.text();
      const preview = parseDrawingBackup(text, symbol);
      if (!window.confirm(`Restore ${preview.drawings.length} native drawings for ${symbol}, saved ${preview.savedAt}?\n\nThis replaces all existing native drawings for this pair across BOTH live and historical-demo modes. Other instruments and accounts are unchanged. TradingView drawings and chart settings are excluded. Export the current drawings first and close all other TradingNinjaPro tabs.`)) return;
      await restoreDrawings(window.localStorage, navigator.locks, mode, text, symbol, () => session.getState().status === "ready");
      window.location.reload();
    } catch (e) { setMessage(`Drawing backup was not restored. ${e instanceof Error ? e.message : "Please check the file and browser storage."}`); }
    finally { input.value = ""; setBusy(false); }
  };
  return <div className="tnp-backups"><h3>Native crypto drawing backups</h3>
    <p>Export or restore one pair at a time. Native drawings are shared between live and historical-demo modes on this browser. This is separate from the account backup and excludes TradingView drawings and chart settings. Close other app tabs before restoring.</p>
    <div className="tnp-inline-actions"><label>Drawing instrument<select value={symbol} disabled={busy} onChange={(e) => setSymbol(e.target.value)}>{ASSET_CATALOG.filter((a) => a.market === "crypto").map((a) => <option value={a.id} key={a.id}>{a.name} · {a.id.replace("USD", "/USDT")}</option>)}</select></label>
      <button disabled={busy} onClick={() => { try { downloadText(`TradingNinjaPro-drawings-${symbol}.json`, exportDrawingBackup(window.localStorage, symbol)); setMessage("Drawing backup downloaded. Keep it private."); } catch (e) { setMessage(`Drawing backup failed; existing drawings were not changed. ${e instanceof Error ? e.message : "Check browser storage."}`); } }}>Export drawings</button>
      <button disabled={busy || state.status !== "ready"} onClick={() => file.current?.click()}>Restore drawings</button>
      <input ref={file} type="file" accept=".json,application/json" aria-label="Restore native drawing backup" onChange={(e) => { void restore(e.currentTarget); }} hidden />
    </div>{message && <p role="status">{message}</p>}</div>;
}
