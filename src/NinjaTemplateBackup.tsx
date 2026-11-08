import { useRef, useState } from "react";
import { downloadText } from "./ninja-workspace.ts";
import { exportTemplateBackup, parseTemplateBackup, restoreTemplates } from "./ninja-template-backup.ts";
import type { LocalSession, LocalState, Mode } from "./ninja-session.ts";
export function NinjaTemplateBackup({ session, state, mode }: { session: LocalSession; state: LocalState; mode: Mode }) {
  const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false); const file = useRef<HTMLInputElement>(null);
  const restore = async (input: HTMLInputElement) => {
    const selected = input.files?.[0]; if (!selected) return; setBusy(true); setMessage("");
    try {
      if (selected.size > 1_000_000) throw new Error("Template backup exceeds 1 MB.");
      const text = await selected.text(); const preview = parseTemplateBackup(text);
      if (!window.confirm(`Restore ${preview.templates.length} native chart templates, saved ${preview.savedAt}?\n\nThis replaces ALL native chart templates shared by BOTH live and historical-demo modes. Accounts, drawings, current chart preferences and TradingView widgets are unchanged. Close other app tabs and export current templates first. If template autosave is enabled, disable it before restoring to avoid overwriting a restored template when opening a chart.`)) return;
      await restoreTemplates(window.localStorage, navigator.locks, mode, text, () => session.getState().status === "ready"); window.location.reload();
    } catch (e) { setMessage(`Templates were not restored. ${e instanceof Error ? e.message : "Check the file and browser storage."}`); }
    finally { input.value = ""; setBusy(false); }
  };
  return <div className="tnp-backups"><h3>Native chart template backups</h3><p>Templates are shared by live and historical-demo modes. Export and restore them separately from accounts and drawings. This excludes current chart preferences and third-party widgets. Disable native template autosave from the chart template menu on desktop, and close other app tabs before restoring.</p><div className="tnp-inline-actions">
    <button disabled={busy} onClick={() => { try { downloadText("TradingNinjaPro-chart-templates.json", exportTemplateBackup(window.localStorage)); setMessage("Template backup downloaded. Keep it private."); } catch (e) { setMessage(`Template backup failed; existing templates were not changed. ${e instanceof Error ? e.message : "Check browser storage."}`); } }}>Export templates</button>
    <button disabled={busy || state.status !== "ready"} onClick={() => file.current?.click()}>Restore templates</button>
    <input ref={file} type="file" accept=".json,application/json" aria-label="Restore native chart template backup" onChange={(e) => { void restore(e.currentTarget); }} hidden />
  </div>{message && <p role="status">{message}</p>}</div>;
}
