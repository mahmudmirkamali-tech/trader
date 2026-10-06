# Pulse Scalper — final Toobit futures bot from the conversation.
# Put secrets in environment variables. Do not commit keys.

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
CHECK_INTERVAL = 300

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
        print(f"data error {symbol}: {e}")
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
            f"{'LONG' if side == 'LONG' else 'SHORT'} {symbol}\n"
            f"entry {price}\nsize {contract_size}\nSL {sl} TP {tp}"
        )
        print("opened", symbol, side)
    except Exception as e:
        send_telegram(f"order error {symbol}: {e}")
        print(e)


send_telegram("Pulse Scalper started")

while True:
    print("---", datetime.now().strftime("%H:%M:%S"), "---")
    for symbol in SYMBOLS:
        if has_open_position(symbol):
            print(symbol, "open — skip")
            continue
        df = get_1m_data(symbol)
        signal = get_signal(df)
        if signal:
            place_order(symbol, signal)
        else:
            print(symbol, "no signal")
    time.sleep(CHECK_INTERVAL)
