import { useEffect, useRef } from "react";
import { ColorType, CrosshairMode, LineStyle, createChart, type IChartApi, type UTCTimestamp } from "lightweight-charts";

const base = {
  // Attribution is in the page footer (TradingView link), as the library's licence asks.
  layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#878d94", fontFamily: "Geist, ui-sans-serif, sans-serif", fontSize: 12, attributionLogo: false },
  grid: { vertLines: { visible: false }, horzLines: { color: "#1b1e23" } },
  rightPriceScale: { borderVisible: false },
  timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
  crosshair: { mode: CrosshairMode.Magnet, vertLine: { color: "#3a3f47", labelBackgroundColor: "#1b1e23" }, horzLine: { color: "#3a3f47", labelBackgroundColor: "#1b1e23" } },
  handleScroll: false,
  handleScale: false,
  autoSize: true,
} as const;

const ts = (ms: number) => Math.floor(ms / 1000) as UTCTimestamp;

function useChart(build: (chart: IChartApi) => void, deps: unknown[]) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const chart = createChart(ref.current, base);
    build(chart);
    chart.timeScale().fitContent();
    return () => chart.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}

/** One series: the price ratio of the two legs, with its 30-day mean and ±2σ band as reference lines. */
export function RatioChart({ points, mean, upper, lower, label }: { points: { time: number; value: number }[]; mean: number; upper: number; lower: number; label: string }) {
  const ref = useChart((chart) => {
    const s = chart.addLineSeries({ color: "#ebeff4", lineWidth: 2, priceLineVisible: false, lastValueVisible: true, priceFormat: { type: "price", precision: 5, minMove: 0.00001 } });
    s.setData(points.map((p) => ({ time: ts(p.time), value: p.value })));
    s.createPriceLine({ price: mean, color: "#878d94", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "30-day mean" });
    s.createPriceLine({ price: upper, color: "#3a3f47", lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: "+2σ" });
    s.createPriceLine({ price: lower, color: "#3a3f47", lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: "−2σ" });
  }, [points, mean, upper, lower]);
  return <div ref={ref} className="chart" role="img" aria-label={label} />;
}

/** Cumulative funding received per $1,000 in each leg. Total in the signal color; legs in gray with labels. */
export function FundingChart({ short, long, total, label }: { short: { time: number; value: number }[]; long: { time: number; value: number }[]; total: { time: number; value: number }[]; label: string }) {
  const ref = useChart((chart) => {
    const fmt = { type: "price" as const, precision: 2, minMove: 0.01 };
    const a = chart.addLineSeries({ color: "#b2b8bf", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, priceFormat: fmt });
    const b = chart.addLineSeries({ color: "#878d94", lineWidth: 1, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false, priceFormat: fmt });
    const t = chart.addLineSeries({ color: "#fde819", lineWidth: 2, priceLineVisible: false, lastValueVisible: true, priceFormat: fmt });
    a.setData(short.map((p) => ({ time: ts(p.time), value: p.value })));
    b.setData(long.map((p) => ({ time: ts(p.time), value: p.value })));
    t.setData(total.map((p) => ({ time: ts(p.time), value: p.value })));
    t.createPriceLine({ price: 0, color: "#3a3f47", lineWidth: 1, lineStyle: LineStyle.Solid, axisLabelVisible: false, title: "" });
  }, [short, long, total]);
  return <div ref={ref} className="chart" role="img" aria-label={label} />;
}
