import type { ClosedPosition } from "./services/schemas.ts";

/** Close records are events, including partial closes, not necessarily whole trades. */
export function performance(records: ClosedPosition[], balance: number) {
  const pnl = records.reduce((sum, r) => sum + r.realizedPnl, 0);
  const wins = records.filter((r) => r.realizedPnl > 0);
  const losses = records.filter((r) => r.realizedPnl < 0);
  const symbols = new Map<string, { count: number; pnl: number }>();
  for (const r of records) {
    const item = symbols.get(r.symbolName) ?? { count: 0, pnl: 0 };
    item.count++; item.pnl += r.realizedPnl; symbols.set(r.symbolName, item);
  }
  // A reconstructed realised-balance series: never a mark-to-market equity curve.
  // If timestamps cannot establish order, omit the series and drawdown entirely.
  const validDates = records.every((r) => r.closedAt && Number.isFinite(Date.parse(r.closedAt)));
  const ordered = validDates ? records.map((r, index) => ({ r, index })).sort((a, b) => Date.parse(a.r.closedAt!) - Date.parse(b.r.closedAt!) || b.index - a.index) : [];
  let current = balance - pnl, peak = current, maxDrawdown = 0;
  const points = [current];
  for (const { r } of ordered) { current += r.realizedPnl; points.push(current); peak = Math.max(peak, current); maxDrawdown = Math.max(maxDrawdown, peak - current); }
  return {
    pnl, count: records.length, wins: wins.length, losses: losses.length, flat: records.length - wins.length - losses.length,
    averageWin: wins.length ? wins.reduce((s, r) => s + r.realizedPnl, 0) / wins.length : null,
    averageLoss: losses.length ? losses.reduce((s, r) => s + r.realizedPnl, 0) / losses.length : null,
    winRate: records.length ? wins.length / records.length : null,
    symbols: [...symbols].map(([symbol, v]) => ({ symbol, ...v })).sort((a, b) => a.symbol.localeCompare(b.symbol)),
    points: validDates ? points : [], maxDrawdown: validDates ? maxDrawdown : null,
    ordered: ordered.map(({ r }) => r),
  };
}
