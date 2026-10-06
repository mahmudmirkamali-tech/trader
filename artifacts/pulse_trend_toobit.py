# Pulse Trend — Toobit USDT-M Futures
# Telegram Bot API 10.x (HTML + link_preview_options)
# Strategy: EMA21/50 cross + RSI(14) + ATR(14)*1.5 SL, R:R 1:3, TF 15m

import os
import time
from datetime import datetime, timezone

import ccxt
import httpx
import pandas as pd

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

RISK_PERCENT = 3.0
RR_RATIO = 3.0
LEVERAGE = 10
ATR_MULT = 1.5
TIMEFRAME = "15m"
CHECK_INTERVAL = 60

exchange = ccxt.toobit(
    {
        "apiKey": TOOBIT_API_KEY,
        "secret": TOOBIT_SECRET,
        "enableRateLimit": True,
        "options": {"defaultType": "swap"},
    }
)
markets = exchange.load_markets()


def send_telegram(text: str) -> None:
    url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage"
    payload = {
        "chat_id": CHAT_ID,
        "text": text,
        "parse_mode": "HTML",
        "link_preview_options": {"is_disabled": True},
    }
    try:
        r = httpx.post(url, json=payload, timeout=15)
        r.raise_for_status()
        print("telegram ok")
    except Exception as e:
        print("telegram error:", e)


def set_leverage(symbol: str) -> None:
    try:
        exchange.set_leverage(LEVERAGE, symbol)
    except Exception:
        pass


def has_open_position(symbol: str) -> bool:
    try:
        positions = exchange.fetch_positions([symbol])
        return any(abs(float(p.get("contracts") or 0)) > 0 for p in positions)
    except Exception:
        return False


def ohlcv(symbol: str, limit: int = 120) -> pd.DataFrame:
    try:
        raw = exchange.fetch_ohlcv(symbol, TIMEFRAME, limit=limit)
        df = pd.DataFrame(raw, columns=["ts", "open", "high", "low", "close", "volume"])
        for col in ("open", "high", "low", "close", "volume"):
            df[col] = pd.to_numeric(df[col], errors="coerce")
        return df.dropna()
    except Exception as e:
        print(f"data error {symbol}: {e}")
        return pd.DataFrame()


def rsi_series(close: pd.Series, period: int = 14) -> pd.Series:
    delta = close.diff()
    gain = delta.clip(lower=0).ewm(alpha=1 / period, adjust=False).mean()
    loss = (-delta.clip(upper=0)).ewm(alpha=1 / period, adjust=False).mean()
    rs = gain / loss.replace(0, pd.NA)
    return 100 - (100 / (1 + rs))


def atr_series(df: pd.DataFrame, period: int = 14) -> pd.Series:
    prev = df["close"].shift(1)
    tr = pd.concat(
        [
            df["high"] - df["low"],
            (df["high"] - prev).abs(),
            (df["low"] - prev).abs(),
        ],
        axis=1,
    ).max(axis=1)
    return tr.ewm(alpha=1 / period, adjust=False).mean()


def get_signal(df: pd.DataFrame) -> str | None:
    if len(df) < 60:
        return None
    d = df.copy()
    d["ema21"] = d["close"].ewm(span=21, adjust=False).mean()
    d["ema50"] = d["close"].ewm(span=50, adjust=False).mean()
    d["rsi"] = rsi_series(d["close"], 14)
    last = d.iloc[-1]
    prev = d.iloc[-2]
    rsi = float(last["rsi"])
    if prev["ema21"] <= prev["ema50"] and last["ema21"] > last["ema50"] and rsi < 68:
        return "LONG"
    if prev["ema21"] >= prev["ema50"] and last["ema21"] < last["ema50"] and rsi > 32:
        return "SHORT"
    return None


def place_order(symbol: str, side: str, df: pd.DataFrame) -> None:
    try:
        set_leverage(symbol)
        balance = float(exchange.fetch_balance()["USDT"]["free"])
        ticker = exchange.fetch_ticker(symbol)
        price = float(ticker["last"])
        atr = float(atr_series(df).iloc[-1])
        sl_dist = max(atr * ATR_MULT, price * 0.003)
        tp_dist = sl_dist * RR_RATIO
        risk_amount = balance * (RISK_PERCENT / 100)
        raw_size = (risk_amount * LEVERAGE) / price
        market = markets[symbol]
        min_amount = float(market["limits"]["amount"]["min"] or 0)
        size = max(raw_size, min_amount)
        contract_size = exchange.amount_to_precision(symbol, size)
        if float(contract_size) < min_amount:
            contract_size = exchange.amount_to_precision(symbol, min_amount)
        order_side = "buy" if side == "LONG" else "sell"
        exchange.create_market_order(symbol, order_side, contract_size)
        sl = price - sl_dist if side == "LONG" else price + sl_dist
        tp = price + tp_dist if side == "LONG" else price - tp_dist
        now = datetime.now(timezone.utc).strftime("%H:%M:%S UTC")
        send_telegram(
            f"{'🟢' if side == 'LONG' else '🔴'} <b>Pulse Trend — معامله باز شد</b>\n"
            f"<code>{symbol}</code> | {side}\n"
            f"ورود: {price:.4f}\n"
            f"حجم: {contract_size} · لوریج {LEVERAGE}x · ریسک {RISK_PERCENT}%\n"
            f"SL {sl:.4f}  TP {tp:.4f}  (ATR×{ATR_MULT} · 1:{int(RR_RATIO)})\n"
            f"{now}"
        )
        print(f"opened {side} {symbol}")
    except Exception as e:
        send_telegram(f"خطا در {symbol}: {e}")
        print(e)


send_telegram(
    "Pulse Trend روشن شد (Toobit)\n"
    f"TF {TIMEFRAME} · EMA21/50 + RSI + ATR SL\n"
    f"ریسک {RISK_PERCENT}% · لوریج {LEVERAGE}x · R:R 1:{int(RR_RATIO)}"
)

while True:
    print(f"--- {datetime.now().strftime('%H:%M:%S')} ---")
    for symbol in SYMBOLS:
        if has_open_position(symbol):
            print(f"{symbol}: open — skip")
            continue
        df = ohlcv(symbol)
        sig = get_signal(df)
        if sig:
            place_order(symbol, sig, df)
        else:
            print(f"{symbol}: no signal")
    time.sleep(CHECK_INTERVAL)
