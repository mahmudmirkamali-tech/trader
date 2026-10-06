# Pulse Trend — native cTrader Python cBot
# Automate → New Python cBot. Chart: M15.
# Parameters (add in cBot UI if needed): TelegramToken, TelegramChatId, RiskPercent
# https://help.ctrader.com/ctrader-algo/documentation/python-basics/

import json
import urllib.error
import urllib.request

import clr

clr.AddReference("cAlgo.API")
from cAlgo.API import *


class PulseTrend:
    Label = "PulseTrend"

    def on_start(self):
        self.fast = api.Indicators.ExponentialMovingAverage(api.Bars.ClosePrices, 21)
        self.slow = api.Indicators.ExponentialMovingAverage(api.Bars.ClosePrices, 50)
        self.rsi = api.Indicators.RelativeStrengthIndex(api.Bars.ClosePrices, 14)
        self.atr = api.Indicators.AverageTrueRange(14, MovingAverageType.Exponential)
        api.Print("Pulse Trend started — EMA21/50 + RSI + ATR SL")
        self._tg(
            "Pulse Trend روی cTrader روشن شد\nTF چارت: EMA21/50 + RSI + ATR×1.5 · R:R 1:3"
        )

    def on_bar_closed(self):
        if api.Bars.Count < 60:
            return
        if api.Positions.FindAll(api.Label):
            return

        ema_f0 = self.fast.Result.Last(0)
        ema_f1 = self.fast.Result.Last(1)
        ema_s0 = self.slow.Result.Last(0)
        ema_s1 = self.slow.Result.Last(1)
        rsi0 = self.rsi.Result.Last(0)
        atr0 = self.atr.Result.Last(0)

        pip = api.Symbol.PipSize
        if pip <= 0 or atr0 <= 0:
            return

        sl_pips = max(atr0 * 1.5 / pip, 8)
        tp_pips = sl_pips * 3
        volume = self._risk_volume(sl_pips)

        if ema_f1 <= ema_s1 and ema_f0 > ema_s0 and rsi0 < 68:
            self._enter(TradeType.Buy, volume, sl_pips, tp_pips, rsi0, atr0)
        elif ema_f1 >= ema_s1 and ema_f0 < ema_s0 and rsi0 > 32:
            self._enter(TradeType.Sell, volume, sl_pips, tp_pips, rsi0, atr0)

    def _risk_volume(self, sl_pips):
        risk_pct = getattr(api, "RiskPercent", 3.0)
        risk_money = api.Account.Balance * (float(risk_pct) / 100.0)
        pip_value = api.Symbol.PipValue
        if pip_value <= 0 or sl_pips <= 0:
            return api.Symbol.QuantityToVolumeInUnits(getattr(api, "VolumeInLots", 0.01))
        raw = risk_money / (sl_pips * pip_value)
        vol = api.Symbol.NormalizeVolumeInUnits(raw, RoundingMode.Down)
        if vol < api.Symbol.VolumeInUnitsMin:
            vol = api.Symbol.VolumeInUnitsMin
        if vol > api.Symbol.VolumeInUnitsMax:
            vol = api.Symbol.VolumeInUnitsMax
        return vol

    def _enter(self, trade_type, volume, sl_pips, tp_pips, rsi0, atr0):
        result = api.ExecuteMarketOrder(
            trade_type,
            api.SymbolName,
            volume,
            api.Label,
            sl_pips,
            tp_pips,
        )
        side = "LONG" if trade_type == TradeType.Buy else "SHORT"
        api.Print(
            "opened {0} {1} sl={2:.1f} tp={3:.1f}".format(
                side, api.SymbolName, sl_pips, tp_pips
            )
        )
        self._tg(
            "{0} <b>cTrader Pulse Trend</b>\n"
            "<code>{1}</code> | {2}\n"
            "حجم: {3} · SL {4:.1f} pip · TP {5:.1f} pip\n"
            "RSI {6:.1f} · ATR {7:.5f}".format(
                "🟢" if side == "LONG" else "🔴",
                api.SymbolName,
                side,
                volume,
                sl_pips,
                tp_pips,
                rsi0,
                atr0,
            )
        )
        if result is None or (hasattr(result, "IsSuccessful") and not result.IsSuccessful):
            api.Print("order result: {0}".format(result))

    def _tg(self, text):
        token = getattr(api, "TelegramToken", "")
        chat = getattr(api, "TelegramChatId", "")
        if not token or not chat:
            return
        url = "https://api.telegram.org/bot{0}/sendMessage".format(token)
        body = json.dumps(
            {
                "chat_id": chat,
                "text": text,
                "parse_mode": "HTML",
                "link_preview_options": {"is_disabled": True},
            }
        ).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            urllib.request.urlopen(req, timeout=12)
        except urllib.error.URLError as e:
            api.Print("telegram error: {0}".format(e))
