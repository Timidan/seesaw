import { useEffect, useState } from "react";
import { Home } from "./ui/Home";
import { SpreadPage } from "./ui/SpreadPage";
import { Mark } from "./ui/bits";

type Route = { page: "home" } | { page: "spread"; short: string; long: string };

function parse(hash: string): Route {
  const m = hash.match(/^#\/spread\/([A-Z0-9]+-USD)\/([A-Z0-9]+-USD)$/);
  return m ? { page: "spread", short: m[1], long: m[2] } : { page: "home" };
}

export default function App() {
  const [route, setRoute] = useState<Route>(() => parse(location.hash));
  useEffect(() => {
    const on = () => {
      const r = parse(location.hash);
      setRoute(r);
      if (r.page === "spread") window.scrollTo({ top: 0 });
      else if (location.hash.length > 2 && !location.hash.startsWith("#/")) document.getElementById(location.hash.slice(1))?.scrollIntoView();
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);

  return (
    <>
      <a className="skip" href="#content">Skip to content</a>
      <header className="topbar">
        <a className="brand" href="#/" aria-label="Seesaw home"><Mark /><span className="brand-word">Seesaw</span></a>
        <nav className="topnav" aria-label="Main">
          <a href="#board">Spreads</a>
          <a href="https://docs.strikefinance.org/perpetuals/funding-rates" target="_blank" rel="noreferrer">How Strike funding works</a>
        </nav>
        <div className="topbar-right">
          <span className="net-chip" title="Orders go to Strike testnet. Rankings use Strike mainnet data."><i aria-hidden /> <span className="long">Orders: Strike testnet</span><span className="short">Testnet</span></span>
        </div>
      </header>
      <div id="content" tabIndex={-1} style={{ outline: "none" }}>{route.page === "home" ? <Home /> : <SpreadPage short={route.short} long={route.long} />}</div>
      <footer className="foot">
        <div className="wrap foot-grid">
          <div>
            <p>Seesaw ranks Strike market pairs by the funding each leg paid over the last 30 days (Strike mainnet public data, hourly), and opens both legs through Strike's builder codes. Past funding is not a forecast. Two orders are sent together but fill separately.</p>
            <p>Built for the Strike Hackathon, October 2026. Storm footage: Mixkit free licence. Charts: <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">TradingView Lightweight Charts™</a>.</p>
          </div>
          <div>
            <p><a href="https://strikefinance.org" target="_blank" rel="noreferrer">Strike Finance</a> · <a href="https://docs.strikefinance.org/api/builder-codes" target="_blank" rel="noreferrer">Builder codes</a> · <a href="https://testnet.strikefinance.org" target="_blank" rel="noreferrer">Strike testnet app</a></p>
          </div>
        </div>
      </footer>
    </>
  );
}
