import { describe, it, expect } from "vitest";
import { defaultWorkspace, PriceAlertSchema, WorkspaceSchema, type PriceAlert } from "./ninja-workspace.ts";
import { triggerAlerts } from "./ninja-alerts.ts";
const alert = (): PriceAlert => ({ id:"a", asset:"BTCUSD", direction:"above", threshold:100, createdAt:"2025-01-01T00:00:00.000Z", firedAt:null, firedPrice:null });
describe("in-session price alerts", () => {
  it("triggers once on a fresh matching midpoint and preserves the result", () => {
    const initial=[alert()]; const now=1700000000000;
    const fired=triggerAlerts(initial,"BTCUSD",99,101,now,now);
    expect(fired[0]?.firedPrice).toBe(100); expect(fired[0]?.firedAt).toBe(new Date(now).toISOString());
    expect(triggerAlerts(fired,"BTCUSD",101,102,now,now)).toBe(fired);
  });
  it("does not trigger on stale, future, wrong-symbol, invalid or unmet quotes", () => {
    const initial=[alert()]; const now=1700000000000;
    for(const args of [["BTCUSD",100,101,now-20000],["BTCUSD",100,101,now+1],["ETHUSD",100,101,now],["BTCUSD",101,100,now],["BTCUSD",90,92,now]] as const) expect(triggerAlerts(initial,args[0],args[1],args[2],args[3],now)).toBe(initial);
  });
  it("supports below thresholds and migrates workspaces without alerts", () => {
    const now=1700000000000, a={...alert(),direction:"below" as const};
    expect(triggerAlerts([a],"BTCUSD",99,101,now,now)[0]?.firedPrice).toBe(100);
    expect(WorkspaceSchema.parse({...defaultWorkspace(),alerts:undefined}).alerts).toEqual([]);
    expect(PriceAlertSchema.safeParse({...alert(),firedAt:"2025-01-01T00:00:00.000Z"}).success).toBe(false);
  });
});
