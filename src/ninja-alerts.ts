import { useEffect } from "react";
import { quoteIsFresh, validQuote } from "./ninja-live.ts";
import type { PriceAlert } from "./ninja-workspace.ts";
import type { OpenChartsAdapter } from "./adapter/types.ts";
import type { LocalSession } from "./ninja-session.ts";

export function triggerAlerts(alerts: PriceAlert[], symbol: string, bid: number, ask: number, time: number, now: number): PriceAlert[] {
  if (!validQuote(bid, ask) || !quoteIsFresh(time, now)) return alerts;
  const price = bid / 2 + ask / 2;
  let changed = false;
  const next = alerts.map((alert) => {
    if (alert.firedAt || alert.asset !== symbol || !(alert.direction === "above" ? price >= alert.threshold : price <= alert.threshold)) return alert;
    changed = true; return { ...alert, firedAt: new Date(now).toISOString(), firedPrice: price };
  });
  return changed ? next : alerts;
}

/** Subscribe for the whole app session, including while the dashboard is hidden. */
export function usePriceAlerts(session: LocalSession, adapter: OpenChartsAdapter) {
  useEffect(() => adapter.marketData.subscribe((event) => {
    if (event.type !== "tick") return;
    const state = session.getState(); if (state.status === "busy" || state.status === "blocked") return;
    const now = Date.now();
    const alerts = triggerAlerts(state.workspace.alerts, event.symbol, event.bid, event.ask, event.timestamp ?? 0, now);
    if (alerts !== state.workspace.alerts) {
      try { session.updateWorkspace({ ...state.workspace, alerts }); } catch { /* preserve existing state; status is shown in the app */ }
    }
  }), [session, adapter]);
}

