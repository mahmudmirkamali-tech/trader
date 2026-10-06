import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Activity,
  Bot,
  Copy,
  Play,
  Square,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  DEFAULT_CONFIG,
  MIN_QTY,
  SYMBOLS,
  type BotConfig,
  type Candle,
  type LogItem,
  type Position,
  type SymbolName,
  atrFromCandles,
  contractSize,
  hitSlTp,
  levels,
  nextCandle,
  seedCandles,
  signalFromCandles,
  uid,
  unrealized,
} from "@/lib/engine";
import { CTRADER_BOT, TOOBIT_BOT } from "@/lib/python-export";

const START_EQ = 10_000;

function fmt(n: number, d = 2) {
  return n.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: 0 });
}

export function Desk() {
  const [hydrated, setHydrated] = useState(false);
  const [running, setRunning] = useState(false);
  const [tab, setTab] = useState<"desk" | "code">("desk");
  const [codeKind, setCodeKind] = useState<"ctrader" | "toobit">("ctrader");
  const [cfg] = useState<BotConfig>(DEFAULT_CONFIG);
  const [equity, setEquity] = useState(START_EQ);
  const [selected, setSelected] = useState<SymbolName>("BTC/USDT");
  const [books, setBooks] = useState<Record<SymbolName, Candle[]>>(() => {
    const init = {} as Record<SymbolName, Candle[]>;
    for (const s of SYMBOLS) init[s] = [];
    return init;
  });
  const [positions, setPositions] = useState<Position[]>([]);
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [copied, setCopied] = useState(false);
  const booksRef = useRef(books);
  const posRef = useRef(positions);
  const eqRef = useRef(equity);
  booksRef.current = books;
  posRef.current = positions;
  eqRef.current = equity;

  const pushLog = (kind: LogItem["kind"], text: string) => {
    setLogs((prev) => [{ id: uid("log"), at: Date.now(), kind, text }, ...prev].slice(0, 80));
  };

  useEffect(() => {
    const init = {} as Record<SymbolName, Candle[]>;
    for (const s of SYMBOLS) init[s] = seedCandles(s);
    setBooks(init);
    setLogs([
      {
        id: uid("log"),
        at: Date.now(),
        kind: "info",
        text: "نسخه ۲۰۲۶: EMA۲۱/۵۰ + RSI + استاپ ATR · سازگار با cTrader Python و Toobit. کلید واقعی اینجا ذخیره نمی‌شود.",
      },
    ]);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      const nextBooks = { ...booksRef.current };
      let nextPos = [...posRef.current];
      let nextEq = eqRef.current;

      for (const symbol of SYMBOLS) {
        const series = [...nextBooks[symbol]];
        const candle = nextCandle(series[series.length - 1]!);
        series.push(candle);
        if (series.length > 140) series.shift();
        nextBooks[symbol] = series;

        const open = nextPos.find((p) => p.symbol === symbol);
        if (open) {
          const hit = hitSlTp(open, candle);
          if (hit) {
            const exit = hit === "sl" ? open.sl : open.tp;
            const pnl = unrealized(open, exit);
            nextEq += pnl;
            nextPos = nextPos.filter((p) => p.id !== open.id);
            pushLog(
              "close",
              `${symbol} ${open.side} بسته شد (${hit === "tp" ? "تیک پروفیت" : "استاپ"}) · PnL ${pnl >= 0 ? "+" : ""}${fmt(pnl, 2)} USDT`,
            );
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
          price,
        });
        const lv = levels(price, sig, atrFromCandles(series) * cfg.atrMult, cfg.rr);
        const pos: Position = {
          id: uid("pos"),
          symbol,
          side: sig,
          entry: price,
          size,
          leverage: cfg.leverage,
          sl: lv.sl,
          tp: lv.tp,
          openedAt: Date.now(),
        };
        nextPos.push(pos);
        pushLog(
          sig === "LONG" ? "long" : "short",
          `${symbol} ${sig} · ورود ${fmt(price, 4)} · حجم ${size} (حداقل ${MIN_QTY[symbol]}) · SL ${fmt(lv.sl, 4)} · TP ${fmt(lv.tp, 4)}`,
        );
      }

      setBooks(nextBooks);
      setPositions(nextPos);
      setEquity(nextEq);
    }, cfg.checkEveryMs);
    return () => window.clearInterval(id);
  }, [running, cfg]);

  const prices = useMemo(() => {
    const m = {} as Record<SymbolName, number>;
    for (const s of SYMBOLS) m[s] = books[s].at(-1)?.c ?? 0;
    return m;
  }, [books]);

  const upnl = positions.reduce((a, p) => a + unrealized(p, prices[p.symbol]), 0);
  const equityNow = equity + upnl;
  const pnlPct = ((equityNow - START_EQ) / START_EQ) * 100;
  const chart = books[selected].slice(-48).map((c) => ({
    t: new Date(c.t).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" }),
    c: Number(c.c.toFixed(4)),
  }));

  const toggle = () => {
    if (!running) {
      pushLog("info", "ربات روشن شد · روند EMA۲۱/۵۰ + فیلتر RSI · استاپ ATR · تایم شبیه‌سازی ۱۵ دقیقه");
    } else {
      pushLog("skip", "ربات متوقف شد. پوزیشن‌های باز روی دمو باقی می‌مانند.");
    }
    setRunning((v) => !v);
  };

  const source = codeKind === "ctrader" ? CTRADER_BOT : TOOBIT_BOT;

  const copyCode = async () => {
    await navigator.clipboard.writeText(source);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  if (!hydrated) {
    return <div className="min-h-dvh bg-bg" />;
  }

  return (
    <div className="mx-auto min-h-dvh max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
      <header className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-1 text-xs font-medium tracking-[0.2em] text-primary uppercase">
            cTrader · Toobit · Telegram Bot API 10
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-fg sm:text-4xl">Pulse Trend</h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
            استراتژی به‌روز: کراس EMA ۲۱/۵۰ با فیلتر RSI و استاپ ATR به‌جای اسکالپ نویزی ۱ دقیقه‌ای. کد native برای
            cTrader Automate و اسکریپت جدا برای فیوچرز Toobit، هر دو با نوتیفیکیشن تلگرام.
          </p>
        </div>
        <button
          type="button"
          onClick={toggle}
          className="inline-flex h-12 min-w-44 items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-fg transition hover:opacity-90"
        >
          {running ? <Square className="size-4" /> : <Play className="size-4" />}
          {running ? "توقف ربات" : "روشن کردن ربات"}
        </button>
      </header>

      <div className="mb-5 flex gap-2">
        <TabBtn active={tab === "desk"} onClick={() => setTab("desk")}>
          میز معامله
        </TabBtn>
        <TabBtn active={tab === "code"} onClick={() => setTab("code")}>
          کد پایتون
        </TabBtn>
      </div>

      {tab === "code" ? (
        <section className="rounded-lg border border-border bg-surface p-4 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="mb-2 flex gap-2">
                <TabBtn active={codeKind === "ctrader"} onClick={() => setCodeKind("ctrader")}>
                  cTrader cBot
                </TabBtn>
                <TabBtn active={codeKind === "toobit"} onClick={() => setCodeKind("toobit")}>
                  Toobit Futures
                </TabBtn>
              </div>
              <p className="text-sm text-muted">
                {codeKind === "ctrader"
                  ? "در Automate یک Python cBot بساز، این کد را بچسبان، تایم‌فریم M15، پارامتر TelegramToken و TelegramChatId را پر کن."
                  : "توکن تلگرام و کلید Toobit را در متغیر محیطی بگذار. حداقل حجم صرافی در محاسبه رعایت شده است."}
              </p>
            </div>
            <button
              type="button"
              onClick={copyCode}
              className="inline-flex h-11 items-center gap-2 rounded-md border border-border bg-surface-2 px-4 text-sm font-medium"
            >
              <Copy className="size-4" />
              {copied ? "کپی شد" : "کپی کد"}
            </button>
          </div>
          <pre
            dir="ltr"
            className="max-h-[70vh] overflow-auto rounded-md bg-bg p-4 text-left font-mono text-xs leading-relaxed text-fg"
          >
            {source}
          </pre>
        </section>
      ) : (
        <>
          <section className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat
              icon={<Wallet className="size-4" />}
              label="اکوئیتی دمو"
              value={`${fmt(equityNow, 2)} USDT`}
              sub={`${pnlPct >= 0 ? "+" : ""}${fmt(pnlPct, 2)}٪ از ۱۰٬۰۰۰`}
              good={pnlPct >= 0}
            />
            <Stat
              icon={<Activity className="size-4" />}
              label="سود شناور"
              value={`${upnl >= 0 ? "+" : ""}${fmt(upnl, 2)}`}
              sub={`${positions.length} پوزیشن باز`}
              good={upnl >= 0}
            />
            <Stat
              icon={<Bot className="size-4" />}
              label="تنظیمات"
              value={`${cfg.leverage}x · ریسک ${cfg.riskPercent}٪`}
              sub={`R:R 1:${cfg.rr} · استاپ ATR×${cfg.atrMult}`}
            />
            <Stat
              icon={running ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
              label="وضعیت"
              value={running ? "در حال اسکن" : "خاموش"}
              sub="تایم‌فریم شبیه‌سازی ۱۵ دقیقه"
              good={running}
            />
          </section>

          <div className="grid gap-4 lg:grid-cols-5">
            <section className="rounded-lg border border-border bg-surface p-4 lg:col-span-3">
              <div className="mb-3 flex flex-wrap gap-2">
                {SYMBOLS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSelected(s)}
                    className={`h-10 rounded-md px-3 text-xs font-medium ${
                      selected === s ? "bg-primary text-primary-fg" : "bg-surface-2 text-fg"
                    }`}
                  >
                    {s.replace("/USDT", "")} {fmt(prices[s], s.includes("BTC") ? 0 : 4)}
                  </button>
                ))}
              </div>
              <div className="h-56 sm:h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chart}>
                    <defs>
                      <linearGradient id="px" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#2dd4bf" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#2dd4bf" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="t" hide />
                    <YAxis domain={["auto", "auto"]} hide />
                    <Tooltip
                      contentStyle={{
                        background: "#10202c",
                        border: "1px solid #1e3a4a",
                        borderRadius: 8,
                        color: "#e8f2f4",
                        direction: "ltr",
                      }}
                    />
                    <Area type="monotone" dataKey="c" stroke="#2dd4bf" fill="url(#px)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="rounded-lg border border-border bg-surface p-4 lg:col-span-2">
              <h2 className="mb-3 text-sm font-semibold">گزارش تلگرام‌مانند</h2>
              <div className="flex max-h-72 flex-col gap-2 overflow-auto">
                {logs.map((l) => (
                  <article
                    key={l.id}
                    className="rounded-md border border-border bg-bg-2 px-3 py-2 text-xs leading-relaxed"
                  >
                    <p className="mb-1 text-[10px] text-muted">
                      {new Date(l.at).toLocaleTimeString("fa-IR")} · {l.kind}
                    </p>
                    <p>{l.text}</p>
                  </article>
                ))}
              </div>
            </section>
          </div>

          <section className="mt-4 overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="w-full min-w-[640px] text-right text-sm">
              <thead className="text-xs text-muted">
                <tr className="border-b border-border">
                  <th className="px-4 py-3 font-medium">جفت</th>
                  <th className="px-4 py-3 font-medium">جهت</th>
                  <th className="px-4 py-3 font-medium">ورود</th>
                  <th className="px-4 py-3 font-medium">حجم</th>
                  <th className="px-4 py-3 font-medium">SL / TP</th>
                  <th className="px-4 py-3 font-medium">PnL</th>
                </tr>
              </thead>
              <tbody>
                {positions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted">
                      هنوز پوزیشنی باز نشده. ربات را روشن کن تا روی کراس روند معامله کند.
                    </td>
                  </tr>
                ) : (
                  positions.map((p) => {
                    const pnl = unrealized(p, prices[p.symbol]);
                    return (
                      <tr key={p.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-3 font-medium">{p.symbol}</td>
                        <td className={`px-4 py-3 ${p.side === "LONG" ? "text-accent" : "text-danger"}`}>
                          {p.side}
                        </td>
                        <td className="px-4 py-3 font-mono" dir="ltr">
                          {fmt(p.entry, 4)}
                        </td>
                        <td className="px-4 py-3 font-mono" dir="ltr">
                          {p.size}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs" dir="ltr">
                          {fmt(p.sl, 4)} / {fmt(p.tp, 4)}
                        </td>
                        <td className={`px-4 py-3 font-mono ${pnl >= 0 ? "text-accent" : "text-danger"}`}>
                          {pnl >= 0 ? "+" : ""}
                          {fmt(pnl, 2)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </section>

          <footer className="mt-6 text-xs leading-relaxed text-muted">
            پیش‌نمایش محلی است. معامله واقعی: کد cTrader را در Automate اجرا کن (دمو بروکر) یا اسکریپت Toobit را با
            متغیر محیطی. هیچ تضمین سودی وجود ندارد؛ اسکالپ EMA کوتاه‌مدت نویز زیاد دارد — نسخه فعلی روند میان‌مدت است.
          </footer>
        </>
      )}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-11 rounded-md px-4 text-sm font-medium ${
        active ? "bg-surface text-fg ring-1 ring-border" : "text-muted"
      }`}
    >
      {children}
    </button>
  );
}

function Stat({
  icon,
  label,
  value,
  sub,
  good,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  sub: string;
  good?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-2 flex items-center gap-2 text-muted">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className={`text-lg font-semibold ${good === false ? "text-danger" : "text-fg"}`}>{value}</p>
      <p className="mt-1 text-xs text-muted">{sub}</p>
    </div>
  );
}
