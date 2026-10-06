import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  SYMBOLS,
  atrFromCandles,
  contractSize,
  levels,
  signalFromCandles,
  type SymbolName,
} from "@/lib/engine";

const TelegramIn = z.object({
  telegramToken: z.string().trim().min(20),
  chatId: z.string().trim().min(3),
});

const ToobitIn = z.object({
  toobitKey: z.string().trim().min(8),
  toobitSecret: z.string().trim().min(8),
});

const ScanIn = TelegramIn.extend({
  toobitKey: z.string().trim().optional().default(""),
  toobitSecret: z.string().trim().optional().default(""),
  live: z.boolean(),
  riskPercent: z.number().min(0.1).max(10),
  leverage: z.number().min(1).max(50),
  rr: z.number().min(1).max(8),
  atrMult: z.number().min(0.5).max(4),
  balanceHint: z.number().min(1).optional(),
});

export const testTelegramFn = createServerFn({ method: "POST" })
  .validator(TelegramIn)
  .handler(async ({ data }) => {
    const { sendTelegram } = await import("./toobit.server");
    await sendTelegram(
      data.telegramToken,
      data.chatId,
      "<b>Pulse Trend</b>\nاتصال تلگرام موفق بود. از همین‌جا سیگنال می‌آید.",
    );
    return { ok: true as const };
  });

export const testToobitFn = createServerFn({ method: "POST" })
  .validator(ToobitIn)
  .handler(async ({ data }) => {
    const { fetchUsdtBalance } = await import("./toobit.server");
    const usdt = await fetchUsdtBalance(data.toobitKey, data.toobitSecret);
    return { ok: true as const, usdt };
  });

export type ScanRow = {
  symbol: SymbolName;
  price: number;
  signal: "LONG" | "SHORT" | null;
  sl?: number;
  tp?: number;
  size?: number;
  note: string;
  traded: boolean;
};

export const scanTickFn = createServerFn({ method: "POST" })
  .validator(ScanIn)
  .handler(async ({ data }) => {
    const {
      fetchHasPosition,
      fetchKlines,
      fetchUsdtBalance,
      placeMarket,
      sendTelegram,
    } = await import("./toobit.server");

    let balance = data.balanceHint ?? 10_000;
    if (data.live) {
      if (!data.toobitKey || !data.toobitSecret) {
        throw new Error("برای معامله واقعی کلید Toobit لازم است");
      }
      balance = await fetchUsdtBalance(data.toobitKey, data.toobitSecret);
    }

    const rows: ScanRow[] = [];

    for (const symbol of SYMBOLS) {
      try {
        const candles = await fetchKlines(symbol);
        const last = candles.at(-1);
        if (!last) {
          rows.push({ symbol, price: 0, signal: null, note: "کندلی نیامد", traded: false });
          continue;
        }
        const signal = signalFromCandles(candles);
        if (!signal) {
          rows.push({
            symbol,
            price: last.c,
            signal: null,
            note: "بدون سیگنال",
            traded: false,
          });
          continue;
        }

        const slDist = atrFromCandles(candles) * data.atrMult;
        const lv = levels(last.c, signal, slDist, data.rr);
        const size = contractSize({
          symbol,
          balance,
          riskPercent: data.riskPercent,
          leverage: data.leverage,
          price: last.c,
        });

        if (data.live) {
          const open = await fetchHasPosition(data.toobitKey, data.toobitSecret, symbol);
          if (open) {
            rows.push({
              symbol,
              price: last.c,
              signal,
              sl: lv.sl,
              tp: lv.tp,
              size,
              note: "پوزیشن باز — رد شد",
              traded: false,
            });
            continue;
          }
          await placeMarket({
            key: data.toobitKey,
            secret: data.toobitSecret,
            pair: symbol,
            side: signal,
            quantity: String(size),
            leverage: data.leverage,
          });
        }

        const mark = data.live ? "معامله واقعی" : "کاغذی";
        await sendTelegram(
          data.telegramToken,
          data.chatId,
          `${signal === "LONG" ? "🟢" : "🔴"} <b>Pulse Trend · ${mark}</b>\n` +
            `<code>${symbol}</code> | ${signal}\n` +
            `ورود ${last.c.toFixed(4)}\nحجم ${size}\n` +
            `SL ${lv.sl.toFixed(4)}  TP ${lv.tp.toFixed(4)}`,
        );

        rows.push({
          symbol,
          price: last.c,
          signal,
          sl: lv.sl,
          tp: lv.tp,
          size,
          note: data.live ? "سفارش ارسال شد" : "سیگنال کاغذی",
          traded: true,
        });
      } catch (e) {
        rows.push({
          symbol,
          price: 0,
          signal: null,
          note: e instanceof Error ? e.message : String(e),
          traded: false,
        });
      }
    }

    return { ok: true as const, balance, rows };
  });
