import { i as __toESM } from "../_runtime.mjs";
import { L as require_react, v as require_jsx_runtime } from "../_libs/@tanstack/react-router+[...].mjs";
import { a as Square, c as Bot, i as TrendingDown, l as Activity, o as Play, r as TrendingUp, s as Copy, t as Wallet } from "../_libs/lucide-react.mjs";
import { a as ResponsiveContainer, i as Area, n as YAxis, o as Tooltip, r as XAxis, t as AreaChart } from "../_libs/recharts+[...].mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/routes-C23ySM96.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var SYMBOLS = [
	"BTC/USDT",
	"ETH/USDT",
	"SOL/USDT",
	"XRP/USDT",
	"DOGE/USDT"
];
var DEFAULT_CONFIG = {
	riskPercent: 5,
	rr: 3,
	leverage: 20,
	slPct: 1,
	checkEveryMs: 2500
};
var START_PRICES = {
	"BTC/USDT": 67240,
	"ETH/USDT": 2488,
	"SOL/USDT": 178.4,
	"XRP/USDT": .62,
	"DOGE/USDT": .148
};
var MIN_QTY = {
	"BTC/USDT": .001,
	"ETH/USDT": .01,
	"SOL/USDT": 1,
	"XRP/USDT": 1,
	"DOGE/USDT": 10
};
function ema(values, span) {
	const k = 2 / (span + 1);
	const out = [];
	let prev = values[0] ?? 0;
	for (const v of values) {
		prev = v * k + prev * (1 - k);
		out.push(prev);
	}
	return out;
}
function seedCandles(symbol, n = 80) {
	const candles = [];
	let p = START_PRICES[symbol];
	const t0 = Date.now() - n * 6e4;
	for (let i = 0; i < n; i++) {
		const drift = (Math.random() - .48) * p * .004;
		const o = p;
		const c = Math.max(1e-4, p + drift);
		const h = Math.max(o, c) * (1 + Math.random() * .002);
		const l = Math.min(o, c) * (1 - Math.random() * .002);
		candles.push({
			t: t0 + i * 6e4,
			o,
			h,
			l,
			c
		});
		p = c;
	}
	return candles;
}
function nextCandle(prev) {
	const p = prev.c;
	const drift = (Math.random() - .49) * p * .0035;
	const o = p;
	const c = Math.max(1e-4, p + drift);
	const h = Math.max(o, c) * (1 + Math.random() * .0018);
	const l = Math.min(o, c) * (1 - Math.random() * .0018);
	return {
		t: prev.t + 6e4,
		o,
		h,
		l,
		c
	};
}
function signalFromCandles(candles) {
	if (candles.length < 30) return null;
	const closes = candles.map((x) => x.c);
	const e5 = ema(closes, 5);
	const e13 = ema(closes, 13);
	const i = closes.length - 1;
	const prev5 = e5[i - 1];
	const last5 = e5[i];
	const prev13 = e13[i - 1];
	const last13 = e13[i];
	if (prev5 <= prev13 && last5 > last13) return "LONG";
	if (prev5 >= prev13 && last5 < last13) return "SHORT";
	return null;
}
function contractSize(opts) {
	const raw = opts.balance * (opts.riskPercent / 100) * opts.leverage / opts.price;
	const min = MIN_QTY[opts.symbol];
	const sized = Math.max(raw, min);
	if (opts.symbol === "SOL/USDT" || opts.symbol === "XRP/USDT") return Math.max(1, Math.floor(sized));
	if (opts.symbol === "DOGE/USDT") return Math.max(10, Math.floor(sized));
	if (opts.symbol === "ETH/USDT") return Math.max(.01, Math.round(sized * 100) / 100);
	return Math.max(.001, Math.round(sized * 1e3) / 1e3);
}
function levels(price, side, slPct, rr) {
	const slDist = price * (slPct / 100);
	const tpDist = slDist * rr;
	if (side === "LONG") return {
		sl: price - slDist,
		tp: price + tpDist
	};
	return {
		sl: price + slDist,
		tp: price - tpDist
	};
}
function unrealized(pos, price) {
	const dir = pos.side === "LONG" ? 1 : -1;
	return (price - pos.entry) * dir * pos.size;
}
function hitSlTp(pos, candle) {
	if (pos.side === "LONG") {
		if (candle.l <= pos.sl) return "sl";
		if (candle.h >= pos.tp) return "tp";
	} else {
		if (candle.h >= pos.sl) return "sl";
		if (candle.l <= pos.tp) return "tp";
	}
	return null;
}
function uid(prefix) {
	return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}
var PYTHON_BOT = `# Pulse Scalper — Toobit Futures (نسخه نهایی از گفتگو)
# استراتژی: کراس EMA5/13 روی تایم ۱ دقیقه
# ریسک ۵٪ | لوریج ۲۰x | استاپ ۱٪ | تیک ۳٪ (R:R 1:3)
# کلیدها را در متغیر محیطی بگذار — هرگز در فایل عمومی ننویس.

import os
import time
from datetime import datetime

import ccxt
import pandas as pd
import requests

TELEGRAM_TOKEN = os.environ["TELEGRAM_TOKEN"]
CHAT_ID = os.environ["TELEGRAM_CHAT_ID"]
TOOBIT_API_KEY = os.environ["TOOBIT_API_KEY"]
TOOBIT_SECRET = os.environ["TOOBIT_SECRET"]

SYMBOLS = [
    "BTC/USDT:USDT",
    "ETH/USDT:USDT",
    "SOL/USDT:USDT",
    "XRP/USDT:USDT",
    "DOGE/USDT:USDT",
]

RISK_PERCENT = 5.0
RR_RATIO = 3
LEVERAGE = 20
CHECK_INTERVAL = 300  # ثانیه

exchange = ccxt.toobit(
    {
        "apiKey": TOOBIT_API_KEY,
        "secret": TOOBIT_SECRET,
        "enableRateLimit": True,
        "options": {"defaultType": "swap"},
    }
)
markets = exchange.load_markets()


def send_telegram(message: str) -> None:
    url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage"
    payload = {"chat_id": CHAT_ID, "text": message, "parse_mode": "HTML"}
    try:
        requests.post(url, data=payload, timeout=10)
        print("پیام تلگرام ارسال شد")
    except Exception as e:
        print("خطا در تلگرام:", e)


def set_leverage(symbol: str) -> None:
    try:
        exchange.set_leverage(LEVERAGE, symbol)
    except Exception:
        pass


def has_open_position(symbol: str) -> bool:
    try:
        positions = exchange.fetch_positions([symbol])
        return any(float(pos.get("contracts") or 0) > 0 for pos in positions)
    except Exception:
        return False


def get_1m_data(symbol: str, limit: int = 100) -> pd.DataFrame:
    try:
        ohlcv = exchange.fetch_ohlcv(symbol, "1m", limit=limit)
        df = pd.DataFrame(ohlcv, columns=["ts", "open", "high", "low", "close", "volume"])
        df["close"] = pd.to_numeric(df["close"])
        return df
    except Exception as e:
        print(f"خطا در دریافت داده {symbol}: {e}")
        return pd.DataFrame()


def get_signal(df: pd.DataFrame) -> str | None:
    if len(df) < 30:
        return None
    df = df.copy()
    df["EMA5"] = df["close"].ewm(span=5).mean()
    df["EMA13"] = df["close"].ewm(span=13).mean()
    last = df.iloc[-1]
    prev = df.iloc[-2]
    if prev["EMA5"] <= prev["EMA13"] and last["EMA5"] > last["EMA13"]:
        return "LONG"
    if prev["EMA5"] >= prev["EMA13"] and last["EMA5"] < last["EMA13"]:
        return "SHORT"
    return None


def place_order(symbol: str, side: str) -> None:
    try:
        set_leverage(symbol)
        balance = exchange.fetch_balance()["USDT"]["free"]
        risk_amount = balance * (RISK_PERCENT / 100)
        price = exchange.fetch_ticker(symbol)["last"]
        market = markets[symbol]
        raw_size = (risk_amount * LEVERAGE) / price
        min_amount = float(market["limits"]["amount"]["min"] or 0)
        size = max(raw_size, min_amount)
        contract_size = exchange.amount_to_precision(symbol, size)
        order_side = "buy" if side == "LONG" else "sell"
        exchange.create_market_order(symbol, order_side, contract_size)
        sl_dist = price * 0.01
        tp_dist = sl_dist * RR_RATIO
        sl = price - sl_dist if side == "LONG" else price + sl_dist
        tp = price + tp_dist if side == "LONG" else price - tp_dist
        send_telegram(
            f"{'🟢' if side == 'LONG' else '🔴'} <b>معامله باز شد</b>\\n"
            f"{symbol} | {side}\\n"
            f"ورود: \${price:.4f}\\n"
            f"حجم: {contract_size}\\n"
            f"لوریج: {LEVERAGE}x | ریسک: {RISK_PERCENT}%\\n"
            f"SL: \${sl:.4f} | TP: \${tp:.4f} (1:{RR_RATIO})\\n"
            f"{datetime.now().strftime('%H:%M:%S')}"
        )
        print(f"معامله {symbol} باز شد")
    except Exception as e:
        send_telegram(f"خطا در معامله {symbol}: {e}")
        print(e)


send_telegram(
    "ربات فیوچرز روشن شد\\n"
    f"ریسک {RISK_PERCENT}% | لوریج {LEVERAGE}x | R:R 1:{RR_RATIO}\\n"
    "EMA5/13 روی ۱ دقیقه"
)

while True:
    print(f"--- چک {datetime.now().strftime('%H:%M:%S')} ---")
    for symbol in SYMBOLS:
        if has_open_position(symbol):
            print(f"{symbol}: پوزیشن باز — اسکیپ")
            continue
        df = get_1m_data(symbol)
        signal = get_signal(df)
        if signal:
            place_order(symbol, signal)
        else:
            print(f"{symbol}: بدون سیگنال")
    time.sleep(CHECK_INTERVAL)
`;
var START_EQ = 1e4;
function fmt(n, d = 2) {
	return n.toLocaleString("en-US", {
		maximumFractionDigits: d,
		minimumFractionDigits: 0
	});
}
function Desk() {
	const [running, setRunning] = (0, import_react.useState)(false);
	const [tab, setTab] = (0, import_react.useState)("desk");
	const [cfg] = (0, import_react.useState)(DEFAULT_CONFIG);
	const [equity, setEquity] = (0, import_react.useState)(START_EQ);
	const [selected, setSelected] = (0, import_react.useState)("BTC/USDT");
	const [books, setBooks] = (0, import_react.useState)(() => {
		const init = {};
		for (const s of SYMBOLS) init[s] = seedCandles(s);
		return init;
	});
	const [positions, setPositions] = (0, import_react.useState)([]);
	const [logs, setLogs] = (0, import_react.useState)([{
		id: uid("log"),
		at: Date.now(),
		kind: "info",
		text: "دمو فیوچرز ۱۰٬۰۰۰ USDT آماده است. کلید واقعی صرافی اینجا ذخیره نمی‌شود."
	}]);
	const [copied, setCopied] = (0, import_react.useState)(false);
	const booksRef = (0, import_react.useRef)(books);
	const posRef = (0, import_react.useRef)(positions);
	const eqRef = (0, import_react.useRef)(equity);
	booksRef.current = books;
	posRef.current = positions;
	eqRef.current = equity;
	const pushLog = (kind, text) => {
		setLogs((prev) => [{
			id: uid("log"),
			at: Date.now(),
			kind,
			text
		}, ...prev].slice(0, 80));
	};
	(0, import_react.useEffect)(() => {
		if (!running) return;
		const id = window.setInterval(() => {
			const nextBooks = { ...booksRef.current };
			let nextPos = [...posRef.current];
			let nextEq = eqRef.current;
			for (const symbol of SYMBOLS) {
				const series = [...nextBooks[symbol]];
				const candle = nextCandle(series[series.length - 1]);
				series.push(candle);
				if (series.length > 120) series.shift();
				nextBooks[symbol] = series;
				const open = nextPos.find((p) => p.symbol === symbol);
				if (open) {
					const hit = hitSlTp(open, candle);
					if (hit) {
						const pnl = unrealized(open, hit === "sl" ? open.sl : open.tp);
						nextEq += pnl;
						nextPos = nextPos.filter((p) => p.id !== open.id);
						pushLog("close", `${symbol} ${open.side} بسته شد (${hit === "tp" ? "تیک پروفیت" : "استاپ"}) · PnL ${pnl >= 0 ? "+" : ""}${fmt(pnl, 2)} USDT`);
					}
					continue;
				}
				const sig = signalFromCandles(series);
				if (!sig) continue;
				const price = candle.c;
				const size = contractSize({
					symbol,
					balance: nextEq,
					riskPercent: cfg.riskPercent,
					leverage: cfg.leverage,
					price
				});
				const lv = levels(price, sig, cfg.slPct, cfg.rr);
				const pos = {
					id: uid("pos"),
					symbol,
					side: sig,
					entry: price,
					size,
					leverage: cfg.leverage,
					sl: lv.sl,
					tp: lv.tp,
					openedAt: Date.now()
				};
				nextPos.push(pos);
				pushLog(sig === "LONG" ? "long" : "short", `${symbol} ${sig} باز شد · ورود ${fmt(price, 4)} · حجم ${size} (حداقل ${MIN_QTY[symbol]}) · SL ${fmt(lv.sl, 4)} · TP ${fmt(lv.tp, 4)}`);
			}
			setBooks(nextBooks);
			setPositions(nextPos);
			setEquity(nextEq);
		}, cfg.checkEveryMs);
		return () => window.clearInterval(id);
	}, [running, cfg]);
	const prices = (0, import_react.useMemo)(() => {
		const m = {};
		for (const s of SYMBOLS) m[s] = books[s].at(-1)?.c ?? 0;
		return m;
	}, [books]);
	const upnl = positions.reduce((a, p) => a + unrealized(p, prices[p.symbol]), 0);
	const equityNow = equity + upnl;
	const pnlPct = (equityNow - START_EQ) / START_EQ * 100;
	const chart = books[selected].slice(-48).map((c) => ({
		t: new Date(c.t).toLocaleTimeString("fa-IR", {
			hour: "2-digit",
			minute: "2-digit"
		}),
		c: Number(c.c.toFixed(4))
	}));
	const toggle = () => {
		if (!running) pushLog("info", "ربات روشن شد · EMA5/13 · چک هر کندل شبیه‌سازی‌شده · دمو Toobit");
		else pushLog("skip", "ربات متوقف شد. پوزیشن‌های باز روی دمو باقی می‌مانند.");
		setRunning((v) => !v);
	};
	const copyCode = async () => {
		await navigator.clipboard.writeText(PYTHON_BOT);
		setCopied(true);
		window.setTimeout(() => setCopied(false), 1600);
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "mx-auto min-h-dvh max-w-6xl px-4 py-5 sm:px-6 sm:py-8",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
				className: "mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mb-1 text-xs font-medium tracking-[0.2em] text-primary uppercase",
						children: "Toobit Futures Demo"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
						className: "text-3xl font-semibold tracking-tight text-fg sm:text-4xl",
						children: "Pulse Scalper"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-2 max-w-xl text-sm leading-relaxed text-muted",
						children: "همان رباتی که در گفتگو ساختیم: اسکالپ فیوچرز با کراس EMA ۵/۱۳، ریسک ۵٪، لوریج ۲۰x و نسبت سود به زیان ۱:۳. این پیش‌نمایش روی حساب دمو شبیه‌سازی‌شده کار می‌کند — کلید API اینجا ذخیره نمی‌شود."
					})
				] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					type: "button",
					onClick: toggle,
					className: "inline-flex h-12 min-w-44 items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-fg transition hover:opacity-90",
					children: [running ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Square, { className: "size-4" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Play, { className: "size-4" }), running ? "توقف ربات" : "روشن کردن ربات"]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mb-5 flex gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TabBtn, {
					active: tab === "desk",
					onClick: () => setTab("desk"),
					children: "میز معامله"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TabBtn, {
					active: tab === "code",
					onClick: () => setTab("code"),
					children: "کد پایتون نهایی"
				})]
			}),
			tab === "code" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "rounded-lg border border-border bg-surface p-4 sm:p-6",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mb-4 flex flex-wrap items-center justify-between gap-3",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
						className: "text-lg font-semibold",
						children: "اسکریپت Toobit (حساب واقعی/دمو صرافی)"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-1 text-sm text-muted",
						children: "توکن تلگرام و کلید Toobit را با متغیر محیطی بگذار. حداقل حجم SOL=1 و ETH=0.01 در منطق حجم اعمال شده است."
					})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						type: "button",
						onClick: copyCode,
						className: "inline-flex h-11 items-center gap-2 rounded-md border border-border bg-surface-2 px-4 text-sm font-medium",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Copy, { className: "size-4" }), copied ? "کپی شد" : "کپی کد"]
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("pre", {
					dir: "ltr",
					className: "max-h-[70vh] overflow-auto rounded-md bg-bg p-4 text-left font-mono text-xs leading-relaxed text-fg",
					children: PYTHON_BOT
				})]
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
					className: "mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
							icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Wallet, { className: "size-4" }),
							label: "اکوئیتی دمو",
							value: `${fmt(equityNow, 2)} USDT`,
							sub: `${pnlPct >= 0 ? "+" : ""}${fmt(pnlPct, 2)}٪ از ۱۰٬۰۰۰`,
							good: pnlPct >= 0
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
							icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Activity, { className: "size-4" }),
							label: "سود شناور",
							value: `${upnl >= 0 ? "+" : ""}${fmt(upnl, 2)}`,
							sub: `${positions.length} پوزیشن باز`,
							good: upnl >= 0
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
							icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Bot, { className: "size-4" }),
							label: "تنظیمات",
							value: `${cfg.leverage}x · ریسک ${cfg.riskPercent}٪`,
							sub: `R:R 1:${cfg.rr} · استاپ ${cfg.slPct}٪`
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
							icon: running ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TrendingUp, { className: "size-4" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TrendingDown, { className: "size-4" }),
							label: "وضعیت",
							value: running ? "در حال اسکن" : "خاموش",
							sub: "تایم‌فریم شبیه‌سازی ۱ دقیقه",
							good: running
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "grid gap-4 lg:grid-cols-5",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
						className: "rounded-lg border border-border bg-surface p-4 lg:col-span-3",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "mb-3 flex flex-wrap gap-2",
							children: SYMBOLS.map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								type: "button",
								onClick: () => setSelected(s),
								className: `h-10 rounded-md px-3 text-xs font-medium ${selected === s ? "bg-primary text-primary-fg" : "bg-surface-2 text-fg"}`,
								children: [
									s.replace("/USDT", ""),
									" ",
									fmt(prices[s], s.includes("BTC") ? 0 : 4)
								]
							}, s))
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "h-56 sm:h-72",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ResponsiveContainer, {
								width: "100%",
								height: "100%",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(AreaChart, {
									data: chart,
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("defs", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("linearGradient", {
											id: "px",
											x1: "0",
											y1: "0",
											x2: "0",
											y2: "1",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", {
												offset: "0%",
												stopColor: "#2dd4bf",
												stopOpacity: .35
											}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", {
												offset: "100%",
												stopColor: "#2dd4bf",
												stopOpacity: 0
											})]
										}) }),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(XAxis, {
											dataKey: "t",
											hide: true
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(YAxis, {
											domain: ["auto", "auto"],
											hide: true
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Tooltip, { contentStyle: {
											background: "#10202c",
											border: "1px solid #1e3a4a",
											borderRadius: 8,
											color: "#e8f2f4",
											direction: "ltr"
										} }),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Area, {
											type: "monotone",
											dataKey: "c",
											stroke: "#2dd4bf",
											fill: "url(#px)",
											strokeWidth: 2
										})
									]
								})
							})
						})]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
						className: "rounded-lg border border-border bg-surface p-4 lg:col-span-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
							className: "mb-3 text-sm font-semibold",
							children: "گزارش تلگرام‌مانند"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "flex max-h-72 flex-col gap-2 overflow-auto",
							children: logs.map((l) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", {
								className: "rounded-md border border-border bg-bg-2 px-3 py-2 text-xs leading-relaxed",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
									className: "mb-1 text-[10px] text-muted",
									children: [
										new Date(l.at).toLocaleTimeString("fa-IR"),
										" · ",
										l.kind
									]
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: l.text })]
							}, l.id))
						})]
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("section", {
					className: "mt-4 overflow-x-auto rounded-lg border border-border bg-surface",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", {
						className: "w-full min-w-[640px] text-right text-sm",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", {
							className: "text-xs text-muted",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", {
								className: "border-b border-border",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
										className: "px-4 py-3 font-medium",
										children: "جفت"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
										className: "px-4 py-3 font-medium",
										children: "جهت"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
										className: "px-4 py-3 font-medium",
										children: "ورود"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
										className: "px-4 py-3 font-medium",
										children: "حجم"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
										className: "px-4 py-3 font-medium",
										children: "SL / TP"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
										className: "px-4 py-3 font-medium",
										children: "PnL"
									})
								]
							})
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { children: positions.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tr", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
							colSpan: 6,
							className: "px-4 py-8 text-center text-muted",
							children: "هنوز پوزیشنی باز نشده. ربات را روشن کن تا روی کراس EMA معامله کند."
						}) }) : positions.map((p) => {
							const pnl = unrealized(p, prices[p.symbol]);
							return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", {
								className: "border-b border-border last:border-0",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
										className: "px-4 py-3 font-medium",
										children: p.symbol
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
										className: `px-4 py-3 ${p.side === "LONG" ? "text-accent" : "text-danger"}`,
										children: p.side
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
										className: "px-4 py-3 font-mono",
										dir: "ltr",
										children: fmt(p.entry, 4)
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
										className: "px-4 py-3 font-mono",
										dir: "ltr",
										children: p.size
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", {
										className: "px-4 py-3 font-mono text-xs",
										dir: "ltr",
										children: [
											fmt(p.sl, 4),
											" / ",
											fmt(p.tp, 4)
										]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", {
										className: `px-4 py-3 font-mono ${pnl >= 0 ? "text-accent" : "text-danger"}`,
										children: [pnl >= 0 ? "+" : "", fmt(pnl, 2)]
									})
								]
							}, p.id);
						}) })]
					})
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("footer", {
					className: "mt-6 text-xs leading-relaxed text-muted",
					children: "این محصول تحویل گفتگو است: اتصال تلگرام، فیوچرز Toobit، حداقل حجم (SOL=1, ETH=0.01, BTC=0.001)، جلوگیری از پوزیشن تکراری، و نوتیفیکیشن معامله. معامله واقعی فقط با اسکریپت پایتون روی حساب خودت انجام می‌شود."
				})
			] })
		]
	});
}
function TabBtn({ active, onClick, children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
		type: "button",
		onClick,
		className: `h-11 rounded-md px-4 text-sm font-medium ${active ? "bg-surface text-fg ring-1 ring-border" : "text-muted"}`,
		children
	});
}
function Stat({ icon, label, value, sub, good }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "rounded-lg border border-border bg-surface p-4",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mb-2 flex items-center gap-2 text-muted",
				children: [icon, /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "text-xs",
					children: label
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: `text-lg font-semibold ${good === false ? "text-danger" : "text-fg"}`,
				children: value
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-1 text-xs text-muted",
				children: sub
			})
		]
	});
}
function Home() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Desk, {});
}
//#endregion
export { Home as component };
