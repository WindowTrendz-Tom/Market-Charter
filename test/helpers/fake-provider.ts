import type { Candle, DataProvider, Interval } from "@/lib/data-provider/types";

export interface FakeProviderCall {
  symbol: string;
  interval: Interval;
  from: string | undefined;
}

/** Test-only DataProvider: records calls and returns queued results or errors. Never touches the network. */
export class FakeProvider implements DataProvider {
  readonly name = "fake";
  readonly calls: FakeProviderCall[] = [];
  private queue: (Candle[] | Error)[] = [];

  constructor(private readonly delayMs = 0) {}

  /** Queue the result of the next call: candles to return, or an error to throw. */
  enqueue(result: Candle[] | Error): this {
    this.queue.push(result);
    return this;
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
