import { useEffect, useState } from "react";
import { rsi, type CandleData } from "./lib/indicators.ts";
import type { OpenChartsAdapter } from "./adapter/types.ts";
import type { LocalSession } from "./ninja-session.ts";
import type { IndicatorAlert } from "./ninja-workspace.ts";

const PERIOD_SECONDS = { "15m": 900, "1h": 3600, "4h": 14400, "1d": 86400 } as const;
export type IndicatorStatus = { checkedAt: number; value?: number; bar?: number; error?: string };
export type IndicatorStatuses = Record<string, IndicatorStatus>;
export const indicatorKey = (asset: string, timeframe: IndicatorAlert["timeframe"]) => `${asset}:${timeframe}`;

/** RSI is calculated from up to 100 completed bars. Never fire on stale or malformed history. */
export function completedRsi(data: CandleData[], timeframe: IndicatorAlert["timeframe"], now: number): { value: number; bar: number } {
  if (!Array.isArray(data) || data.length > 1000 || !Number.isFinite(now)) throw new Error("Invalid candle history.");
  const seconds = PERIOD_SECONDS[timeframe];
  for (let i = 0; i < data.length; i++) {
    const c = data[i]!;
    if (!Number.isInteger(c.time) || c.time <= 0 || !Number.isFinite(c.close) || c.close <= 0 || (c.time * 1000 > now) || (i > 0 && c.time - data[i - 1]!.time !== seconds)) throw new Error("Invalid, gapped or unordered candle history.");
  }
  const bars = data.filter((c) => (c.time + seconds) * 1000 <= now).slice(-100);
  if (bars.length < 30) throw new Error("Not enough completed candles.");
  const last = bars.at(-1)!;
  if (now - (last.time + seconds) * 1000 >= seconds * 1000) throw new Error("Completed candle history is stale.");
  const value = rsi(bars, 14).at(-1)?.value;
  if (value == null || !Number.isFinite(value) || value < 0 || value > 100) throw new Error("RSI unavailable.");
  return { value, bar: last.time };
}

export function fireIndicatorAlerts(alerts: IndicatorAlert[], eligibleIds: Set<string>, asset: string, timeframe: IndicatorAlert["timeframe"], reading: { value: number; bar: number }, now: number): IndicatorAlert[] {
  let changed = false;
  const next = alerts.map((alert) => {
    if (alert.firedAt || !eligibleIds.has(alert.id) || alert.asset !== asset || alert.timeframe !== timeframe || !(alert.direction === "above" ? reading.value >= alert.threshold : reading.value <= alert.threshold)) return alert;
    changed = true; return { ...alert, firedAt: new Date(now).toISOString(), firedValue: reading.value, firedBar: reading.bar };
  });
  return changed ? next : alerts;
}

/** One request at a time, at least 5 seconds apart, and no pair/timeframe more than once per minute. */
export function useIndicatorAlerts(session: LocalSession, adapter: OpenChartsAdapter): IndicatorStatuses {
  const [statuses, setStatuses] = useState<IndicatorStatuses>({});
  useEffect(() => {
    let stopped = false; let timer: ReturnType<typeof setTimeout> | undefined;
    const lastRequested = new Map<string, number>();
    const run = async () => {
      if (stopped) return;
      const state = session.getState();
      if (!document.hidden && state.status !== "busy" && state.status !== "blocked") {
        const now = Date.now();
        const groups = new Map<string, IndicatorAlert[]>();
        for (const alert of state.workspace.indicatorAlerts) {
          if (alert.firedAt) continue;
          const key = indicatorKey(alert.asset, alert.timeframe);
          groups.set(key, [...(groups.get(key) ?? []), alert]);
        }
        const due = [...groups.entries()].filter(([key]) => now - (lastRequested.get(key) ?? 0) >= 60_000).sort((a, b) => (lastRequested.get(a[0]) ?? 0) - (lastRequested.get(b[0]) ?? 0));
        const group = due[0];
        if (group) {
          const [key, alerts] = group; const { asset, timeframe } = alerts[0]!;
          lastRequested.set(key, now);
          try {
            const data = await adapter.marketData.getCandles({ symbol: asset, timeframe, limit: 100 });
            const at = Date.now(); const reading = completedRsi(data, timeframe, at);
            if (!stopped) {
              setStatuses((prev) => ({ ...prev, [key]: { checkedAt: at, ...reading } }));
              const latest = session.getState();
              if (!document.hidden && latest.status !== "busy" && latest.status !== "blocked") {
                const eligible = new Set(alerts.map((a) => a.id));
                const next = fireIndicatorAlerts(latest.workspace.indicatorAlerts, eligible, asset, timeframe, reading, at);
                if (next !== latest.workspace.indicatorAlerts) session.updateWorkspace({ ...latest.workspace, indicatorAlerts: next });
              }
            }
          } catch (error) {
            if (!stopped) setStatuses((prev) => ({ ...prev, [key]: { checkedAt: Date.now(), error: error instanceof Error ? error.message : "History unavailable." } }));
          }
        }
      }
      if (!stopped) timer = setTimeout(() => { void run(); }, 5000);
    };
    void run();
    return () => { stopped = true; clearTimeout(timer); };
  }, [session, adapter]);
  return statuses;
}
