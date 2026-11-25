"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WatchlistItem } from "@/lib/watchlist/api-types";
import { createWatchlistClient, toRefreshOutcome } from "@/lib/watchlist/client";
import { CANDLES_UPDATED_EVENT } from "@/lib/watchlist/events";
import { changeClass, formatChangePct, formatPrice } from "@/lib/watchlist/format";
import { runRefreshQueue } from "@/lib/watchlist/refresh-queue";
import { formatNzDate } from "@/lib/time/display";

type LoadState = "loading" | "ready" | "error";
type Message = { kind: "error" | "status"; text: string; login?: boolean };
type QueueStatus = { running: boolean; done: number; total: number; paused: string | null };

const needsRefresh = (item: WatchlistItem) => item.quote === null || item.quote.stale;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function mergeItem(items: WatchlistItem[], item: WatchlistItem): WatchlistItem[] {
  return items.map((it) => (it.symbol === item.symbol ? item : it));
}

export function WatchlistSidebar() {
  const pathname = usePathname();
  const client = useMemo(() => createWatchlistClient(), []);
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [message, setMessage] = useState<Message | null>(null);
  const [queueStatus, setQueueStatus] = useState<QueueStatus>({
    running: false,
    done: 0,
    total: 0,
    paused: null,
  });
  const [input, setInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);

  const queueRef = useRef<string[]>([]);
  const runningRef = useRef(false);
  const cancelledRef = useRef(false);

  const enqueue = useCallback(
    (symbols: string[]) => {
      if (runningRef.current) {
        for (const s of symbols) if (!queueRef.current.includes(s)) queueRef.current.push(s);
        return;
      }
      const fresh = [...new Set(symbols)];
      if (fresh.length === 0) return;
      queueRef.current = fresh;
      runningRef.current = true;
      setQueueStatus({ running: true, done: 0, total: fresh.length, paused: null });
      void runRefreshQueue(queueRef.current, {
        refresh: async (symbol) => toRefreshOutcome(await client.refresh(symbol)),
        sleep,
        isCancelled: () => cancelledRef.current,
        onItem: (item) => {
          if (!cancelledRef.current) setItems((prev) => mergeItem(prev, item));
        },
        onProgress: (done, total) => {
          if (!cancelledRef.current) setQueueStatus((q) => ({ ...q, done, total }));
        },
      }).then((end) => {
        runningRef.current = false;
        if (cancelledRef.current) return;
        setQueueStatus((q) => ({
          ...q,
          running: false,
          paused: end.status === "limited" ? end.message : null,
        }));
        if (end.status === "unauthorized") {
          setMessage({ kind: "error", text: "Your session has expired.", login: true });
        }
      });
    },
    [client],
  );

  useEffect(() => {
    cancelledRef.current = false;
    let cancelled = false;
    async function load() {
      const r = await client.list();
      if (cancelled) return;
      if (!r.ok) {
        setLoadState("error");
        setMessage({ kind: "error", text: r.message, login: r.status === 401 });
        return;
      }
      setItems(r.data.items);
      setLoadState("ready");
      enqueue(r.data.items.filter(needsRefresh).map((i) => i.symbol));
    }
    void load();
    return () => {
      cancelled = true;
      cancelledRef.current = true;
    };
  }, [client, enqueue]);

  useEffect(() => {
    let cancelled = false;
    async function onUpdated() {
      const r = await client.list();
      if (cancelled || !r.ok) return;
      const quotes = new Map(r.data.items.map((i) => [i.symbol, i]));
      setItems((prev) => prev.map((it) => quotes.get(it.symbol) ?? it));
    }
    const handler = () => void onUpdated();
    window.addEventListener(CANDLES_UPDATED_EVENT, handler);
    return () => {
      cancelled = true;
      window.removeEventListener(CANDLES_UPDATED_EVENT, handler);
    };
  }, [client]);

  async function onAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const symbol = input.trim();
    if (!symbol || adding) return;
    setAdding(true);
    const r = await client.add(symbol);
    setAdding(false);
    if (!r.ok) {
      setMessage({ kind: "error", text: r.message, login: r.status === 401 });
      return;
    }
    const { item } = r.data;
    setItems((prev) => (prev.some((i) => i.symbol === item.symbol) ? mergeItem(prev, item) : [...prev, item]));
    setInput("");
    setMessage({ kind: "status", text: `${item.symbol} added.` });
    if (needsRefresh(item)) enqueue([item.symbol]);
  }

  async function onMove(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (saving || target < 0 || target >= items.length) return;
    const previous = items;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    setItems(next);
    setSaving(true);
    const r = await client.saveOrder(next.map((i) => i.symbol));
    if (r.ok) {
      const serverOrder = r.data.items;
      setItems((prev) => {
        const local = new Map(prev.map((i) => [i.symbol, i]));
        return serverOrder.map((i) => local.get(i.symbol) ?? i);
      });
    } else if (r.status === 409) {
      const fresh = await client.list();
      if (fresh.ok) setItems(fresh.data.items);
      setMessage({ kind: "error", text: r.message });
    } else {
      setItems(previous);
      setMessage({ kind: "error", text: r.message, login: r.status === 401 });
    }
    setSaving(false);
  }

  async function onRemove(symbol: string) {
    if (saving) return;
    const previous = items;
    setItems(items.filter((i) => i.symbol !== symbol));
    setSaving(true);
    const r = await client.remove(symbol);
    if (!r.ok) {
      setItems(previous);
      setMessage({ kind: "error", text: r.message, login: r.status === 401 });
    }
    setSaving(false);
  }

  function onRetry() {
    setQueueStatus((q) => ({ ...q, paused: null }));
    enqueue(items.filter(needsRefresh).map((i) => i.symbol));
  }

  const loginHref = `/login?next=${encodeURIComponent(pathname ?? "/")}`;

  return (
    <>
      <h2>Watchlist</h2>
      <div role="status">
        {queueStatus.running && (
          <p className="muted">
            Updating prices… ({queueStatus.done} of {queueStatus.total})
          </p>
        )}
        {!queueStatus.running && queueStatus.paused && (
          <p className="muted">
            Paused: {queueStatus.paused}{" "}
            <button type="button" onClick={onRetry}>
              Retry
            </button>
          </p>
        )}
      </div>
      <form onSubmit={onAdd} className="watchlist-add">
        <label htmlFor="watchlist-symbol">Add ticker</label>
        <input
          id="watchlist-symbol"
          name="symbol"
          maxLength={10}
          autoComplete="off"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button type="submit" disabled={adding}>
          {adding ? "Checking…" : "Add"}
        </button>
      </form>
      {message && (
        <p
          className={message.kind === "error" ? "error" : "muted"}
          role={message.kind === "error" ? "alert" : "status"}
        >
          {message.text}
          {message.login && (
            <>
              {" "}
              <a href={loginHref}>Log in</a>
            </>
          )}
        </p>
      )}
      <p className="muted">Last close (USD) · day change</p>
      {loadState === "loading" && <p className="muted">Loading…</p>}
      {loadState === "ready" && items.length === 0 && (
        <p className="muted">No tickers yet. Add one above, e.g. AAPL.</p>
      )}
      <ol className="watchlist">
        {items.map((item, index) => {
          const { symbol, quote } = item;
          return (
            <li key={symbol} aria-current={pathname === `/chart/${symbol}` ? "page" : undefined}>
              <Link href={`/chart/${symbol}`}>{symbol}</Link>
              {quote ? (
                <>
                  <span className="price">{formatPrice(quote.lastClose)}</span>
                  <span className={`change ${changeClass(quote.changePct)}`}>
                    {formatChangePct(quote.changePct)}
                  </span>
                  <span className="muted">
                    {formatNzDate(quote.asOf)}
                    {quote.stale ? " · updating…" : ""}
                  </span>
                </>
              ) : (
                <span className="muted">Not loaded yet</span>
              )}
              <span className="actions">
                <button
                  type="button"
                  aria-label={`Move ${symbol} up`}
                  disabled={index === 0 || saving}
                  onClick={() => void onMove(index, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={`Move ${symbol} down`}
                  disabled={index === items.length - 1 || saving}
                  onClick={() => void onMove(index, 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${symbol}`}
                  disabled={saving}
                  onClick={() => void onRemove(symbol)}
                >
                  ✕
                </button>
              </span>
            </li>
          );
        })}
      </ol>
    </>
  );
}
