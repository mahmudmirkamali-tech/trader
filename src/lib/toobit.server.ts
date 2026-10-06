import { createHmac } from "node:crypto";
import type { Candle } from "@/lib/engine";

const BASE = "https://api.toobit.com";

export const SWAP: Record<string, string> = {
  "BTC/USDT": "BTC-SWAP-USDT",
  "ETH/USDT": "ETH-SWAP-USDT",
  "SOL/USDT": "SOL-SWAP-USDT",
  "XRP/USDT": "XRP-SWAP-USDT",
  "DOGE/USDT": "DOGE-SWAP-USDT",
};

function qs(params: Record<string, string | number>) {
  return Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&");
}

function sign(secret: string, payload: string) {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export async function sendTelegram(token: string, chatId: string, text: string) {
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    }),
  });
  const json = (await r.json()) as { ok?: boolean; description?: string };
  if (!json.ok) throw new Error(json.description || "تلگرام رد کرد");
  return json;
}

export async function fetchKlines(pair: string, interval = "15m", limit = 120): Promise<Candle[]> {
  const symbol = SWAP[pair] ?? pair.replace("/", "") + "-SWAP-USDT";
  const url = `${BASE}/quote/v1/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=${limit}`;
  const r = await fetch(url, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`داده بازار ${pair}: HTTP ${r.status}`);
  const raw = (await r.json()) as unknown;
  if (!Array.isArray(raw)) throw new Error(`فرمت کندل نامعتبر برای ${pair}`);
  return raw.map((row) => {
    const a = row as (string | number)[];
    return {
      t: Number(a[0]),
      o: Number(a[1]),
      h: Number(a[2]),
      l: Number(a[3]),
      c: Number(a[4]),
    };
  });
}

async function signed(
  key: string,
  secret: string,
  method: "GET" | "POST",
  path: string,
  params: Record<string, string | number> = {},
) {
  const body: Record<string, string | number> = {
    ...params,
    timestamp: Date.now(),
    recvWindow: 20000,
  };
  const query = qs(body);
  const signature = sign(secret, query);
  const url =
    method === "GET"
      ? `${BASE}${path}?${query}&signature=${signature}`
      : `${BASE}${path}`;
  const r = await fetch(url, {
    method,
    headers: {
      "X-BB-APIKEY": key,
      ...(method === "POST" ? { "content-type": "application/x-www-form-urlencoded" } : {}),
    },
    body: method === "POST" ? `${query}&signature=${signature}` : undefined,
  });
  const text = await r.text();
  let json: unknown = text;
  try {
    json = JSON.parse(text);
  } catch {
    /* keep text */
  }
  if (!r.ok) {
    const msg =
      typeof json === "object" && json && "msg" in json
        ? String((json as { msg: string }).msg)
        : text.slice(0, 240);
    throw new Error(msg || `HTTP ${r.status}`);
  }
  return json;
}

function pickUsdt(json: unknown): number | null {
  const walk = (node: unknown): number | null => {
    if (Array.isArray(node)) {
      for (const row of node) {
        const n = walk(row);
        if (n != null) return n;
      }
    }
    if (node && typeof node === "object") {
      const o = node as Record<string, unknown>;
      const asset = String(o.asset ?? o.currency ?? o.coin ?? "").toUpperCase();
      if (asset === "USDT") {
        const v = o.availableBalance ?? o.available ?? o.free ?? o.walletBalance ?? o.balance;
        if (v != null && v !== "") return Number(v);
      }
      for (const v of Object.values(o)) {
        const n = walk(v);
        if (n != null) return n;
      }
    }
    return null;
  };
  return walk(json);
}

export async function fetchUsdtBalance(key: string, secret: string): Promise<number> {
  const paths = ["/api/v1/futures/balance", "/api/v1/account", "/fapi/v1/account"];
  let last = "موجودی خوانده نشد";
  for (const path of paths) {
    try {
      const json = await signed(key, secret, "GET", path);
      const n = pickUsdt(json);
      if (n != null && Number.isFinite(n)) return n;
      last = "USDT در پاسخ حساب پیدا نشد";
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
    }
  }
  throw new Error(last);
}

export async function fetchHasPosition(key: string, secret: string, pair: string): Promise<boolean> {
  const symbol = SWAP[pair] ?? pair;
  const paths = ["/api/v1/futures/positions", "/fapi/v2/positionRisk"];
  for (const path of paths) {
    try {
      const json = await signed(key, secret, "GET", path, { symbol });
      const rows = Array.isArray(json)
        ? json
        : json && typeof json === "object" && "data" in json && Array.isArray((json as { data: unknown }).data)
          ? (json as { data: unknown[] }).data
          : [];
      return rows.some((row) => {
        if (!row || typeof row !== "object") return false;
        const o = row as Record<string, unknown>;
        const amt = Number(o.positionAmt ?? o.contracts ?? o.size ?? 0);
        return Math.abs(amt) > 0;
      });
    } catch {
      /* try next */
    }
  }
  return false;
}

export async function placeMarket(opts: {
  key: string;
  secret: string;
  pair: string;
  side: "LONG" | "SHORT";
  quantity: string;
  leverage: number;
}) {
  const symbol = SWAP[opts.pair] ?? opts.pair;
  try {
    await signed(opts.key, opts.secret, "POST", "/api/v1/futures/leverage", {
      symbol,
      leverage: opts.leverage,
    });
  } catch {
    /* leverage may already be set */
  }
  return signed(opts.key, opts.secret, "POST", "/api/v1/futures/order", {
    symbol,
    side: opts.side === "LONG" ? "BUY" : "SELL",
    type: "MARKET",
    quantity: opts.quantity,
  });
}
