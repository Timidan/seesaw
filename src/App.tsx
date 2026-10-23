import { useEffect, useState } from "react";
import { AppHome, Home } from "./ui/Home";
import { SpreadPage } from "./ui/SpreadPage";
import { Mark } from "./ui/bits";
import { StrikeMark } from "./ui/Coin";
import { WalletButton } from "./ui/WalletButton";
import { base } from "./ui/format";

type Route = { page: "home" } | { page: "app" } | { page: "spread"; short: string; long: string };

const homeTitle = document.title;

function parse(hash: string): Route {
  if (hash === "#/app" || hash === "#board") return { page: "app" };
  const m = hash.match(/^#\/spread\/([A-Z0-9]+-USD)\/([A-Z0-9]+-USD)$/);
  return m ? { page: "spread", short: m[1], long: m[2] } : { page: "home" };
}

export default function App() {
  const [route, setRoute] = useState<Route>(() => parse(location.hash));
  useEffect(() => {
    const on = () => setRoute(parse(location.hash));
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  useEffect(() => {
    // after the page renders: an in-page anchor (#how) scrolls to its section, a new page starts at the top
    const id = route.page === "home" && location.hash.length > 2 && !location.hash.startsWith("#/") ? location.hash.slice(1) : "";
    window.scrollTo({ top: 0 });
    let tries = 0, timer = 0;
    const toAnchor = () => { const el = id && document.getElementById(id); if (el) el.scrollIntoView(); else if (id && tries++ < 20) timer = window.setTimeout(toAnchor, 100); };
    toAnchor(); // sections that wait for data appear a moment after the page
    document.title = route.page === "spread" ? `short ${base(route.short)} / long ${base(route.long)} · Seesaw` : route.page === "app" ? "Spreads · Seesaw" : homeTitle;
    return () => window.clearTimeout(timer);
  }, [route]);

  return (
    <>
      <a className="skip" href="#content">Skip to content</a>
      <header className="topbar">
        <a className="brand" href="#/" aria-label="Seesaw home"><Mark /><span className="brand-word">Seesaw</span></a>
        <nav className="topnav" aria-label="Main">
          <a href="#/app">Spreads</a>
          <a href="#how">How it works</a>
        </nav>
        <div className="topbar-right">
          <a className="built-on" href="https://strikefinance.org" target="_blank" rel="noreferrer"><span>Built on</span> <StrikeMark height={14} /></a>
          <WalletButton />
        </div>
      </header>
      <div id="content" tabIndex={-1} style={{ outline: "none" }}>{route.page === "home" ? <Home /> : route.page === "app" ? <AppHome /> : <SpreadPage short={route.short} long={route.long} />}</div>
      <footer className="foot">
        <div className="wrap foot-grid">
          <div>
            <p>Seesaw ranks Strike market pairs by the funding each leg paid over the last 30 days (Strike mainnet public data, hourly), and opens both legs through Strike's builder codes. Past funding is not a forecast. Two orders are sent together but fill separately.</p>
            <p>Seesaw has no backend and no analytics. The trading key it creates stays in this browser tab, and orders go straight from your browser to Strike.</p>
            <p>Built for the Strike Hackathon, October 2026. Storm footage: Mixkit free licence. Charts: <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">TradingView Lightweight Charts™</a>.</p>
          </div>
          <div>
            <p className="foot-strike"><a href="https://strikefinance.org" target="_blank" rel="noreferrer"><StrikeMark height={18} /></a></p>
            <p><a href="https://strikefinance.org" target="_blank" rel="noreferrer">Strike Finance</a> · <a href="https://docs.strikefinance.org/perpetuals/funding-rates" target="_blank" rel="noreferrer">Funding rates</a> · <a href="https://docs.strikefinance.org/api/builder-codes" target="_blank" rel="noreferrer">Builder codes</a> · <a href="https://testnet.strikefinance.org" target="_blank" rel="noreferrer">Strike testnet app</a></p>
          </div>
        </div>
      </footer>
    </>
  );
}
