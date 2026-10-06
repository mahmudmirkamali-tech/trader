export const SYMBOLS = ["BTC/USDT", "ETH/USDT", "SOL/USDT", "XRP/USDT", "DOGE/USDT"] as const;
export type SymbolName = (typeof SYMBOLS)[number];
export type Side = "LONG" | "SHORT";

export type Candle = {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
};

export type Position = {
  id: string;
  symbol: SymbolName;
  side: Side;
  entry: number;
  size: number;
  leverage: number;
  sl: number;
  tp: number;
  openedAt: number;
};

export type LogItem = {
  id: string;
  at: number;
  kind: "info" | "long" | "short" | "close" | "skip" | "error";
  text: string;
};

export type BotConfig = {
  riskPercent: number;
  rr: number;
  leverage: number;
  atrMult: number;
  checkEveryMs: number;
};

export const DEFAULT_CONFIG: BotConfig = {
  riskPercent: 3,
  rr: 3,
  leverage: 10,
  atrMult: 1.5,
  checkEveryMs: 2500,
};

export const START_PRICES: Record<SymbolName, number> = {
  "BTC/USDT": 67240,
  "ETH/USDT": 2488,
  "SOL/USDT": 178.4,
  "XRP/USDT": 0.62,
  "DOGE/USDT": 0.148,
};

export const MIN_QTY: Record<SymbolName, number> = {
  "BTC/USDT": 0.001,
  "ETH/USDT": 0.01,
  "SOL/USDT": 1,
  "XRP/USDT": 1,
  "DOGE/USDT": 10,
};

function ema(values: number[], span: number): number[] {
  const k = 2 / (span + 1);
  const out: number[] = [];
  let prev = values[0] ?? 0;
  for (const v of values) {
    prev = v * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

function rsi(values: number[], period = 14): number[] {
  const out: number[] = new Array(values.length).fill(50);
  if (values.length < period + 1) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = (values[i] ?? 0) - (values[i - 1] ?? 0);
    if (d >= 0) gain += d;
    else loss -= d;
  }
  gain /= period;
  loss /= period;
  out[period] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  for (let i = period + 1; i < values.length; i++) {
    const d = (values[i] ?? 0) - (values[i - 1] ?? 0);
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

export function atrFromCandles(candles: Candle[], period = 14): number {
  if (candles.length < period + 1) {
    const last = candles.at(-1);
    return last ? last.c * 0.008 : 0;
  }
  let sum = 0;
  for (let i = candles.length - period; i < candles.length; i++) {
    const c = candles[i]!;
    const prev = candles[i - 1]!;
    sum += Math.max(c.h - c.l, Math.abs(c.h - prev.c), Math.abs(c.l - prev.c));
  }
  return sum / period;
}

export function seedCandles(symbol: SymbolName, n = 90): Candle[] {
  const candles: Candle[] = [];
  let p = START_PRICES[symbol];
  const t0 = Date.now() - n * 15 * 60_000;
  for (let i = 0; i < n; i++) {
    const drift = (Math.random() - 0.48) * p * 0.006;
    const o = p;
    const c = Math.max(0.0001, p + drift);
    const h = Math.max(o, c) * (1 + Math.random() * 0.0025);
    const l = Math.min(o, c) * (1 - Math.random() * 0.0025);
    candles.push({ t: t0 + i * 15 * 60_000, o, h, l, c });
    p = c;
  }
  return candles;
}

export function nextCandle(prev: Candle): Candle {
  const p = prev.c;
  const drift = (Math.random() - 0.49) * p * 0.0045;
  const o = p;
  const c = Math.max(0.0001, p + drift);
  const h = Math.max(o, c) * (1 + Math.random() * 0.0022);
  const l = Math.min(o, c) * (1 - Math.random() * 0.0022);
  return { t: prev.t + 15 * 60_000, o, h, l, c };
}

/** Trend follow: EMA21/50 cross + RSI not extreme. M15-style. */
export function signalFromCandles(candles: Candle[]): Side | null {
  if (candles.length < 55) return null;
  const closes = candles.map((x) => x.c);
  const e21 = ema(closes, 21);
  const e50 = ema(closes, 50);
  const r = rsi(closes, 14);
  const i = closes.length - 1;
  const lastRsi = r[i] ?? 50;
  if (e21[i - 1]! <= e50[i - 1]! && e21[i]! > e50[i]! && lastRsi < 68) return "LONG";
  if (e21[i - 1]! >= e50[i - 1]! && e21[i]! < e50[i]! && lastRsi > 32) return "SHORT";
  return null;
}

export function contractSize(opts: {
  symbol: SymbolName;
  balance: number;
  riskPercent: number;
  leverage: number;
  price: number;
}): number {
  const raw = (opts.balance * (opts.riskPercent / 100) * opts.leverage) / opts.price;
  const min = MIN_QTY[opts.symbol];
  const sized = Math.max(raw, min);
  if (opts.symbol === "SOL/USDT" || opts.symbol === "XRP/USDT") return Math.max(1, Math.floor(sized));
  if (opts.symbol === "DOGE/USDT") return Math.max(10, Math.floor(sized));
  if (opts.symbol === "ETH/USDT") return Math.max(0.01, Math.round(sized * 100) / 100);
  return Math.max(0.001, Math.round(sized * 1000) / 1000);
}

export function levels(price: number, side: Side, slDist: number, rr: number) {
  const dist = Math.max(slDist, price * 0.003);
  const tpDist = dist * rr;
  if (side === "LONG") {
    return { sl: price - dist, tp: price + tpDist };
  }
  return { sl: price + dist, tp: price - tpDist };
}

export function unrealized(pos: Position, price: number): number {
  const dir = pos.side === "LONG" ? 1 : -1;
  return (price - pos.entry) * dir * pos.size;
}

export function hitSlTp(pos: Position, candle: Candle): "sl" | "tp" | null {
  if (pos.side === "LONG") {
    if (candle.l <= pos.sl) return "sl";
    if (candle.h >= pos.tp) return "tp";
  } else {
    if (candle.h >= pos.sl) return "sl";
    if (candle.l <= pos.tp) return "tp";
  }
  return null;
}

export function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}
