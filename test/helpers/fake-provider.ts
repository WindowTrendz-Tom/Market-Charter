import type { Candle, DataProvider, Interval, SymbolMatch } from "@/lib/data-provider/types";

export interface FakeProviderCall {
  symbol: string;
  interval: Interval;
  from: string | undefined;
}

/** Test-only DataProvider: records calls and returns queued results or errors. Never touches the network. */
export class FakeProvider implements DataProvider {
  readonly name = "fake";
  readonly calls: FakeProviderCall[] = [];
  readonly searchCalls: string[] = [];
  private queue: (Candle[] | Error)[] = [];
  private searchQueue: (SymbolMatch[] | Error)[] = [];

  constructor(private readonly delayMs = 0) {}

  /** Queue the result of the next call: candles to return, or an error to throw. */
  enqueue(result: Candle[] | Error): this {
    this.queue.push(result);
    return this;
  }

  /** Queue the result of the next searchSymbols call. */
  enqueueSearch(result: SymbolMatch[] | Error): this {
    this.searchQueue.push(result);
    return this;
  }

  async searchSymbols(query: string): Promise<SymbolMatch[]> {
    this.searchCalls.push(query);
    if (this.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    const next = this.searchQueue.shift();
    if (next === undefined) throw new Error("FakeProvider: no queued search result");
    if (next instanceof Error) throw next;
    return next.map((m) => ({ ...m }));
  }

  async getCandles(symbol: string, interval: Interval, from?: string): Promise<Candle[]> {
    this.calls.push({ symbol, interval, from });
    if (this.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    const next = this.queue.shift();
    if (next === undefined) throw new Error("FakeProvider: no queued result");
    if (next instanceof Error) throw next;
    return next.map((c) => ({ ...c }));
  }
}
