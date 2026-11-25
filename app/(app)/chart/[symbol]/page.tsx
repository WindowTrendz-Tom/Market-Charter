import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChartView } from "@/components/chart-view";
import { normaliseSymbol } from "@/lib/symbol";

export async function generateMetadata({ params }: { params: Promise<{ symbol: string }> }): Promise<Metadata> {
  const symbol = normaliseSymbol((await params).symbol);
  return { title: symbol ? `${symbol} – Market Charter` : "Chart – Market Charter" };
}

export default async function Page({ params }: { params: Promise<{ symbol: string }> }) {
  const symbol = normaliseSymbol((await params).symbol);
  if (!symbol) notFound();
  return (
    <>
      <h1>{symbol}</h1>
      <p>Daily candles</p>
      <ChartView key={symbol} symbol={symbol} />
    </>
  );
}
