import { safeNextPath } from "@/lib/auth/next-path";
import { LoginForm } from "./login-form";

export const metadata = { title: "Log in – Market Charter" };

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const { next: rawNext } = await searchParams;
  const next = safeNextPath(Array.isArray(rawNext) ? rawNext[0] : rawNext);
  return (
    <>
      <h1>Log in</h1>
      <p>Single-user app. Accounts are created by the owner.</p>
      <LoginForm next={next} />
    </>
  );
}
