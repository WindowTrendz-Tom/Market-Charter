import Link from "next/link";

export default function Home() {
  return (
    <>
      <h1>Market Charter</h1>
      <p>Pick a ticker from your watchlist, or open the AAPL chart.</p>
      <Link href="/chart/AAPL">Open AAPL chart</Link>
    </>
  );
}
