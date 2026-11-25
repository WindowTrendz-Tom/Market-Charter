import Link from "next/link";

export default function Home() {
  return (
    <>
      <h1>Market Charter</h1>
      <p>Daily candlestick charts for US tickers, cached in Supabase.</p>
      <Link href="/chart/AAPL">Open AAPL chart</Link>
    </>
  );
}
