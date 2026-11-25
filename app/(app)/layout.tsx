import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/session";
import { signOut } from "./actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await getAuthContext();
  if (!user) redirect("/login");

  return (
    <div className="app-shell">
      <header className="app-header">
        <Link href="/">Market Charter</Link>
        <span className="muted">{user.email}</span>
        <form action={signOut}>
          <button type="submit">Log out</button>
        </form>
      </header>
      <aside className="sidebar" aria-label="Watchlist">
        <h2>Watchlist</h2>
        <p className="muted">Coming in P2-T8.</p>
      </aside>
      <section className="content">{children}</section>
    </div>
  );
}
