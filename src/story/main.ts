import "./story.css";
import { mountScrollWorld } from "./scrub-engine.js";
import { mountDither } from "./dither";
import type { Snapshot } from "../carry/snapshot";
import { base, coinIcon, corr, pct, pickHero } from "../ui/format";

// "How Seesaw works" for someone who has never traded: one camera flight through six scenes.
// Every number is read from the same snapshot the app uses; the footage itself carries no text.
const clip = (id: string) => ({
  still: `/story/${id}.webp`, stillMobile: `/story/${id}-m.webp`,
  clip: `/story/vid/${id}.mp4`, clipMobile: `/story/vid/${id}-m.mp4`,
});
const conns = (suffix: string) => [1, 2, 3, 4, 5].map((i) => `/story/vid/conn${i}${suffix}.mp4`);

async function start(root: HTMLElement) {
  const snap: Snapshot = await fetch("/snapshot.json").then((r) => r.json());
  const hero = pickHero(snap.pairs);
  if (!hero) throw new Error("no spread in the snapshot");
  const s = base(hero.short), l = base(hero.long);
  const sym = snap.symbols[hero.short];
  const hours = sym.hours, paid = Math.round(sym.pctPositive * hours);
  const total = snap.pairs.filter((p) => p.carryApr > 0).length;
  const leg = (symbol: string, side: "short" | "long", note: string) =>
    `<span class="st-leg ${side}"><img src="${coinIcon(symbol)}" alt="" width="28" height="28">${base(symbol)}<small>${note}</small></span>`;

  mountScrollWorld(root, {
    brand: { name: "Seesaw", href: "/" },
    cta: { label: "Open Seesaw", href: "/" },
    nav: false,
    atmosphere: false,
    hint: "Scroll to fly in",
    diveScroll: 1.3,
    connScroll: 0.9,
    sections: [
      { id: "crowd", label: "The crowd", ...clip("crowd"), scroll: 1.5, linger: 0.3,
        html: leg(hero.short, "long", "on Strike"),
        title: "Everyone sits on one side.",
        body: `Far more traders on Strike bet ${s} goes up than down. Too many on one side tips the seesaw.` },
      { id: "rent", label: "The rent", ...clip("rent"),
        title: "So they pay rent.",
        body: `To keep the price fair, the crowded side pays the other side every hour. Those betting ${s} goes up paid in ${paid} of the last ${hours} hours.`,
        tags: ["Paid every hour", `${paid} of ${hours} hours`] },
      { id: "hedge", label: "The hedge", ...clip("hedge"), scroll: 1.6, linger: 0.4,
        html: leg(hero.short, "short", "collects the rent") + leg(hero.long, "long", "the counterweight"),
        title: "Take the paid seat.",
        body: `Bet against ${s} to collect that rent, and hold ${l}, a coin that tends to move with it, so most price swings cancel out.`,
        tags: [`Hedge 1 : ${hero.beta.toFixed(2)}`] },
      { id: "storm", label: "The storm", ...clip("storm"),
        title: "Storms barely tip it.",
        body: `When the market jumps, ${s} and ${l} usually jump together, and the rent keeps coming. Not risk-free: they never move in perfect step.`,
        tags: [`Move together ${corr(hero.corr)}`, "Not risk-free"] },
      { id: "board", label: "The board", ...clip("board"),
        title: "Seesaw checks every pair.",
        body: `It ranks ${total} Strike pairs by the rent they paid over 30 days and how steady the ride was, so you don't have to.`,
        tags: ["30 days of Strike data", "Rent per unit of risk"] },
      { id: "launch", label: "One click", ...clip("launch"), scroll: 1.6, linger: 0.45,
        html: `<span class="st-big">${pct(hero.betaCarryApr)}</span><span class="st-big-label">a year in rent at the last 30 days' rate, ${s} / ${l}, hedged. Past rent is no promise.</span>`,
        title: "One click. Both orders.",
        body: "Pick a spread and Seesaw sends both orders to Strike together, then tracks your rent and price moves as one number. Strike testnet for now.",
        cta: { primary: { label: "Open the board", href: "/#board" }, secondary: { label: `See ${s} / ${l}`, href: `/#/spread/${hero.short}/${hero.long}` } } },
    ],
    connectors: conns(""),
    connectorsMobile: conns("-m"),
  });
  mountDither(root);
}

const root = document.getElementById("world")!;
start(root).catch(() => {
  root.insertAdjacentHTML("beforeend", `<p class="st-error">Strike's market data did not load. <a href="/story.html">Reload</a> or <a href="/">open Seesaw</a>.</p>`);
});
