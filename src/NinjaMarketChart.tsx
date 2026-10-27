import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, CandlestickChart } from "lucide-react";

export function MarketEmbed({ symbol, dark }: { symbol: string; dark: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const [consent, setConsent] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState("Loading external chart…");
  useEffect(() => {
    if (!consent || !host.current) return;
    const node = host.current;
    const container = document.createElement("div");
    container.className = "tradingview-widget-container";
    container.style.height = "100%";
    const widget = document.createElement("div");
    widget.className = "tradingview-widget-container__widget";
    widget.style.height = "100%";
    container.append(widget);
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;
    script.type = "text/javascript";
    script.textContent = JSON.stringify({
      autosize: true, symbol, interval: "60", timezone: "Etc/UTC", theme: dark ? "dark" : "light",
      style: "1", locale: "en", allow_symbol_change: true, hide_side_toolbar: false,
      calendar: false, support_host: "https://www.tradingview.com",
    });
    script.onerror = () => setStatus("Chart could not load. Check your connection or content blocker, then retry.");
    container.append(script); node.append(container);
    const observer = new MutationObserver(() => {
      if (node.querySelector("iframe")) setStatus("Embedded chart · check the provider’s market-data status inside the chart");
    });
    observer.observe(node, { childList: true, subtree: true });
    const timer = setTimeout(() => {
      if (!node.querySelector("iframe")) setStatus("The external chart is taking longer than expected. Retry or open it on TradingView.");
    }, 15_000);
    return () => { clearTimeout(timer); observer.disconnect(); node.replaceChildren(); };
  }, [symbol, dark, consent, attempt]);
  return <>
    <div className="tnp-embed-status"><span role="status">{consent ? status : "External chart not loaded"}</span>
      {consent && <button onClick={() => { setStatus("Reloading external chart…"); setAttempt((n) => n + 1); }}>Retry chart</button>}
    </div>
    <div className="tnp-embed-body">
      {!consent && <div className="tnp-consent"><CandlestickChart size={40} aria-hidden="true" /><h2>Your next market. One workspace.</h2>
        <p>Load a TradingView chart for forex, precious metals or stocks. This contacts TradingView, which may use cookies or similar technology. Feed availability and delays vary by symbol.</p>
        <button className="tnp-primary" onClick={() => { setStatus("Loading external chart…"); setConsent(true); }}>Load market chart <ArrowUpRight size={18} /></button>
        <a href="https://www.tradingview.com/privacy-policy/" target="_blank" rel="noreferrer">TradingView privacy policy</a>
      </div>}
      <div className="tnp-embed-host" ref={host} hidden={!consent} />
    </div>
    <div className="tnp-widget-credit"><a href={`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(symbol)}`} target="_blank" rel="noreferrer">Charts by TradingView ↗</a><span>Display only · not connected to our paper-trading engine</span></div>
  </>;
}

