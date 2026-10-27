import { z } from "zod";
import * as engine from "./services/demo/engine.ts";
import { DEMO_CHANNELS, subscribeChannel } from "./services/demo/bus.ts";
import { safeStorage } from "./lib/safe-storage.ts";
import { defaultWorkspace, JOURNAL_SCHEMA, WorkspaceSchema, type Workspace } from "./ninja-workspace.ts";
import type { OpenChartsAdapter } from "./adapter/types.ts";

export type Mode = "live" | "demo";
const MAX_BACKUP_BYTES = 4_000_000;
const BackupSchema = z.object({
  format: z.literal("TradingNinjaPro.local.v2"), mode: z.enum(["live", "demo"]), savedAt: z.string().datetime(),
  account: z.unknown(), workspace: WorkspaceSchema, journal: JOURNAL_SCHEMA,
});
export function parseBackup(input: unknown, mode: Mode) {
  const backup = BackupSchema.parse(input);
  if (backup.mode !== mode) throw new Error(`This is a ${backup.mode} backup. Switch to that data mode before restoring.`);
  const account = engine.parsePaperSnapshot(backup.account);
  if (backup.journal.some((e) => e.accountId !== account.account.id)) throw new Error("Journal entries belong to another account.");
  return { ...backup, account };
}
export type LocalState = { status: "ready" | "memory-only" | "blocked" | "busy"; message: string; workspace: Workspace; savedAt: string | null };
export type LocalSession = Awaited<ReturnType<typeof initializeSession>>;
let sessionPromise: Promise<LocalSession> | undefined;
export function startLocalSession(mode: Mode): Promise<LocalSession> {
  return sessionPromise ??= initializeSession(mode);
}
function initializeSession(mode: Mode) {
  const key = `tnp-v2-account:${mode}`;
  let workspace = defaultWorkspace();
  let journal: z.infer<typeof JOURNAL_SCHEMA> = [];
  let savedAt: string | null = null;
  let locked = false;
  let importing = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let current: LocalState = { status: "ready", message: "Saved on this browser only", workspace, savedAt };
  const subscribers = new Set<() => void>();
  const update = (patch: Partial<LocalState> = {}) => {
    current = { ...current, workspace, savedAt, ...patch };
    subscribers.forEach((fn) => fn());
  };
  const bundle = () => ({ format: "TradingNinjaPro.local.v2" as const, mode, savedAt: new Date().toISOString(), account: engine.exportPaperSnapshot(), workspace, journal });
  const flush = () => {
    clearTimeout(timer); timer = undefined;
    if (importing || !locked || current.status === "blocked" || current.status === "busy") return;
    try {
      const next = parseBackup(bundle(), mode);
      const text = JSON.stringify(next);
      if (text.length > MAX_BACKUP_BYTES) throw new Error("Local account is too large. Export a backup before resetting financial history.");
      if (!safeStorage.setItem(key, text)) throw new Error("Browser storage is unavailable or full. Export a backup now; changes may not survive reload.");
      savedAt = next.savedAt; update({ status: "ready", message: "Saved locally · this browser only" });
    } catch (error) { update({ status: "memory-only", message: error instanceof Error ? error.message : "Local save failed. Export a backup." }); }
  };
  const schedule = () => { if (!timer) timer = setTimeout(flush, 1000); };
  const api = {
    subscribe: (fn: () => void) => { subscribers.add(fn); return () => { subscribers.delete(fn); }; },
    getState: () => current,
    updateWorkspace: (next: Workspace) => { workspace = WorkspaceSchema.parse(next); update(); flush(); },
    exportBackup: () => JSON.stringify(parseBackup(bundle(), mode), null, 2),
    importBackup: (text: string) => {
      if (!locked) throw new Error("Close the other account tab before restoring a backup.");
      if (text.length > MAX_BACKUP_BYTES) throw new Error("Backup exceeds the 4 MB limit.");
      const next = parseBackup(JSON.parse(text) as unknown, mode);
      if (!safeStorage.setItem(key, JSON.stringify(next))) throw new Error("Not enough browser storage. Existing account was not replaced.");
      // Do not let pagehide overwrite the newly imported account with old RAM.
      importing = true; clearTimeout(timer);
    },
    resetAccount: () => {
      if (!locked) throw new Error("This tab does not own the local account.");
      engine.resetPaperAccount();
      update({ status: "ready" }); flush();
    },
    wrapAdapter: (adapter: OpenChartsAdapter): OpenChartsAdapter => ({
      ...adapter,
      name: mode === "live" ? "TradingNinjaPro live paper account" : "TradingNinjaPro historical paper account",
      storage: {
        get: (name) => name === "oc_journal_entries" ? JSON.stringify(journal) : adapter.storage?.get(name) ?? null,
        set: (name, value) => {
          if (name === "oc_journal_entries") {
            const next = JOURNAL_SCHEMA.parse(JSON.parse(value) as unknown);
            if (next.some((e) => e.accountId !== engine.getAccount().id)) throw new Error("Journal account mismatch.");
            journal = next; flush();
          } else return adapter.storage?.set(name, value);
        },
        remove: (name) => {
          if (name === "oc_journal_entries") { journal = []; flush(); }
          else return adapter.storage?.remove(name);
        },
      },
    }),
  };
  const begin = () => {
    const raw = safeStorage.getItem(key);
    if (raw) {
      try {
        if (raw.length > MAX_BACKUP_BYTES) throw new Error("Stored account exceeds the backup limit.");
        const restored = parseBackup(JSON.parse(raw) as unknown, mode);
        engine.restorePaperSnapshot(restored.account);
        workspace = restored.workspace; journal = restored.journal; savedAt = restored.savedAt;
      } catch { update({ status: "blocked", message: "The saved account could not be validated. It has not been overwritten. Restore a valid backup or explicitly reset the account." }); return; }
    }
    update();
    [DEMO_CHANNELS.account, DEMO_CHANNELS.orders, DEMO_CHANNELS.positions].forEach((c) => subscribeChannel(c, schedule));
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });
    flush();
  };
  return new Promise<typeof api>((resolve) => {
    if (!navigator.locks) {
      // Without a cross-tab lock, never promise durable shared account writes.
      update({ status: "memory-only", message: "This browser cannot lock local accounts. Trading is temporary; export backups. Use a current HTTPS browser for automatic saving." });
      resolve(api); return;
    }
    void navigator.locks.request(`TradingNinjaPro:${mode}`, { ifAvailable: true }, async (lock) => {
      if (!lock) { update({ status: "busy", message: "This practice account is open in another tab. Close that tab and reload here to avoid overwriting trades." }); resolve(api); return; }
      locked = true; begin(); resolve(api);
      // The browser releases the lock on navigation/tab close. One writer per mode.
      await new Promise<void>(() => {});
    }).catch(() => { update({ status: "memory-only", message: "Local account locking failed. This session is temporary; export a backup before leaving." }); resolve(api); });
  });
}
