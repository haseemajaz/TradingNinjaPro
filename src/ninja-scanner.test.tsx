import { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within, cleanup } from "@testing-library/react";
import { createDemoAdapter } from "./adapter/demo.ts";
import { CryptoScanner } from "./NinjaDashboard.tsx";
import { defaultScannerSettings, defaultWorkspace, WorkspaceSchema } from "./ninja-workspace.ts";

describe("crypto scanner", () => {
  it("migrates old workspaces and validates saved settings", () => {
    const old = { ...defaultWorkspace(), scanner: undefined };
    expect(WorkspaceSchema.parse(old).scanner).toEqual(defaultScannerSettings());
    expect(WorkspaceSchema.safeParse({ ...old, scanner: { ...defaultScannerSettings(), rsiThreshold: 200 } }).success).toBe(false);
  });
  it("scans completed candles, keeps provider errors visible, and labels old results after timeframe change", async () => {
    const adapter = createDemoAdapter();
    const now = Math.floor(Date.now() / 1000);
    const candles = Array.from({ length: 100 }, (_, i) => ({ time: now - (101 - i) * 3600, open: 100 + i, high: 101 + i, low: 99 + i, close: 100 + i, volume: 1 }));
    const getCandles = vi.fn(async ({ symbol }: { symbol: string }) => { if (symbol === "ADAUSD") throw new Error("offline"); return candles; });
    adapter.marketData.getCandles = getCandles;
    function Harness() { const [settings, setSettings] = useState(defaultScannerSettings()); return <CryptoScanner adapter={adapter} demo={false} onOpen={() => {}} settings={settings} onSettings={setSettings} />; }
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Scan 6 pairs" }));
    await waitFor(() => expect(getCandles).toHaveBeenCalledTimes(6));
    await screen.findByText(/Last scan:/);
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(7);
    fireEvent.change(screen.getByLabelText("Filter"), { target: { value: "low-rsi" } });
    expect(within(table).getAllByRole("row")).toHaveLength(2);
    expect(within(table).getByText(/Unavailable — provider/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Timeframe"), { target: { value: "4h" } });
    expect(screen.getByText(/timeframe changed; scan again/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Scan 6 pairs" }));
    expect(screen.getByText(/Wait at least one minute/)).toBeInTheDocument();
    cleanup();
  });
});
