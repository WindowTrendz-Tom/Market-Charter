export type AccessDecision = { action: "next" } | { action: "redirect"; location: string };

export function decideAccess(args: { pathname: string; search: string; hasUser: boolean }): AccessDecision {
  const { pathname, search, hasUser } = args;
  if (pathname.startsWith("/api/")) return { action: "next" };
  if (pathname === "/login") return hasUser ? { action: "redirect", location: "/" } : { action: "next" };
  if (!hasUser) {
    if (pathname === "/" && search === "") return { action: "redirect", location: "/login" };
    return { action: "redirect", location: `/login?next=${encodeURIComponent(pathname + search)}` };
  }
  return { action: "next" };
}
