# Seesaw

**Seesaw finds the Strike spreads that funding pays you to hold, then opens both legs in one click.**

Live: <https://seesaw.timidan.xyz> · New to trading? Start with the one-minute tour at `/story.html`.
Built for the Strike Hackathon, October 2026.

## What it does

On Strike, the crowd usually leans one way. To keep the perpetual price near the spot price, the crowded side pays the other side **funding** every hour. Over the 30 days in the current snapshot, ADA longs paid ADA shorts in 711 of 720 hours.

Collecting that funding by shorting ADA alone means carrying ADA's price risk. A **spread** fixes most of that: short the crowded coin, and go long a coin that moves with it, sized by the hedge ratio. When the market jumps, both legs move together, and the funding keeps arriving.

Seesaw:

1. **Ranks every Strike pair** as "short A / long B" by the funding it paid over 30 days, per unit of hedged risk (the board on the home page).
2. **Explains each spread** on its own page: funding history for both legs, the price ratio, a carry calculator, the hedge ratio, how often the spread flipped, how fast it mean-reverts, and the odds of a leg being liquidated.
3. **Opens both legs in one click** on Strike through a builder code, with isolated margin and leverage set per leg.
4. **Tracks the spread** as one card: price P&L, funding earned, and close both legs together.

Three pictures do the explaining, so a newcomer doesn't need to read the maths:
- **The funding tape** in the hero: one tick per real hour of the hero spread's funding, printed on load.
- **The carry machine**: an interactive 108-part isometric figure. Press the beam to send a price shock; lift the hedge to see why it matters.
- **The story page** (`/story.html`): a scroll-driven flight through six scenes: the crowd, the rent, the hedge, the storm, the board, and one click. The camera is computed in the browser: it eases in toward each scene, then flies through the hero's real storm footage to the next one.

## Innovation and creativity

- A funding-carry screener for a perps order book, ranked by **carry per unit of risk** after a beta hedge, not by raw funding. Raw funding favours the most volatile pairs; per-risk ranking favours the spreads you can actually hold.
- "Paying now" (a 72-hour EWMA) next to the 30-day number, so a spread that has stopped paying is visible before you open it.
- The interface is built from the product's own data: the hero tape, the board's 30-day mini tapes, and the machine's numbers all come from Strike's funding history. Nothing on the page is an invented figure.

## Integration with Strike

| Strike feature | What Seesaw uses it for | Code |
|---|---|---|
| Price API: `exchangeInfo`, `klines` (mark, 1 h, 720), `premiumIndex`, `depth` | Market list, hourly returns for beta and volatility, live funding and marks, which testnet markets can actually fill | `src/carry/data.ts`, `src/carry/execMarkets.ts`, `src/ui/data.ts` |
| Stats API: 30-day funding history | Carry, hours paid, flips, EWMA | `src/carry/data.ts`, `scripts/snapshot.ts` |
| Builder Connect (request signature → wallet signs → verify) with a client Ed25519 API wallet | One signature to let Seesaw trade for the account; the API wallet cannot withdraw | `src/api/builderConnect.ts`, `src/session/useBuilderConnect.ts` |
| Builder code `Seesaw` (testnet) and `X-Builder-Fee-Bps: 5` on every order | Builder fee on both legs | `.env.production`, `src/api/config.ts` |
| Leverage and margin mode per symbol | Isolated margin and the chosen leverage are set and confirmed on both legs before any order | `src/spread/engine.ts` |
| `/v2/orders/batch` | Both legs in one request | `src/spread/engine.ts` |
| User WebSocket (order and trade updates) | Per-leg fill state, so the card knows when both legs filled | `src/spread/useSpreads.ts`, `src/ws/` |
| Public positions, fills and funding by account | A read-only live spread for visitors without a wallet | `src/spread/publicSpread.ts`, `src/ui/LiveSpread.tsx` |
| Deposits | Funding the account from the ticket when the balance is short | `src/session/useDeposit.ts`, `src/ui/DepositInline.tsx` |
| Strike's market icons and logo | Every coin and stock icon in the app | `src/ui/Coin.tsx` |

## Utility and impact

- **For traders:** a market-neutral way to earn funding, with the risk on the page in plain numbers: the hedge ratio, hedged versus unhedged swing, how often the spread flipped sign, its mean-reversion half-life, and liquidation odds per leg.
- **For Strike:** spreads put size on the uncrowded side of one-sided books, which pulls funding back toward balance, and every order carries a builder fee.

## Technical execution

- **Maths** (`src/carry/math.ts`, checked by `npm test`):
  - hedge beta = cov/var of hourly log returns;
  - hedged volatility and beta-weighted carry APR;
  - carry per unit of risk;
  - 72-hour EWMA of funding;
  - 7-day sign flips;
  - Ornstein–Uhlenbeck half-life of the log spread;
  - first-passage liquidation probability `1 − erf(k / (σ√(2h)))`;
  - fee break-even days.
- **Two legs that are not atomic:** the batch returns per-leg results and the user stream reports fills. If one leg is rejected, the card names the leg and offers *retry this leg* or *close the other leg* (`src/spread/engine.ts`, `src/spread/legs.ts`).
- **Fast first paint without a wallet:** `npm run snapshot` writes `public/snapshot.json` at build time, and the page refreshes live funding on top.
- **One static site, no backend.** Market data comes from Strike mainnet's public endpoints (CORS `*`); orders go to the network in `VITE_API_URL` (testnet by default).

## Future potential

- Mainnet: builder code registration is free on mainnet (confirmed by Strike); the code path is the same.
- A public Strike vault that holds the top-ranked spreads and rebalances when "paying now" turns negative.
- Alerts when a held spread flips sign or its hedge ratio drifts.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173  (story: /story.html)
npm test           # carry maths checks
npm run snapshot   # refresh public/snapshot.json from Strike mainnet
npm run build      # typecheck + production build (app and story page)
```

Configuration is the same as Strike's builder reference app: `VITE_API_URL` and friends choose the network (testnet by default). `.env.production` sets `VITE_BUILDER_CODE=Seesaw` and `VITE_BUILDER_FEE_BPS=5`.

The story page needs no rendered video: its camera moves are computed from the six stills in `public/story/` and the storm clip. With `prefers-reduced-motion`, the scenes are still and simply cross-fade.

## Limits, stated plainly

- Orders go to **Strike testnet**. Testnet lists ADA but its order book is empty, so testnet spreads use BTC, ETH and SOL. At the time of writing those pairs were paying negative carry over the last 72 hours, and the app shows that in red.
- Past funding is not a forecast. A hedge reduces price risk; it does not remove it.
- The API wallet's key lives in the browser, as in Strike's reference app. It can place orders but cannot withdraw without the wallet's own signature.

## Credits

- Started from Strike's builder reference app (first commit, `c4d9ce8`); its API, WebSocket and engine-maths modules are reused.
- Storm footage: Mixkit, free licence (`public/footage/SOURCES.md`). Charts: TradingView Lightweight Charts. Market icons and logo: Strike.
- Fonts: Jersey 15 and Geist (SIL Open Font License). Isometric drawing kit: MIT (`src/iso/LICENSE`). The story page's scroll engine is adapted from the scroll-world skill. The story stills were generated with gpt-image-2.
