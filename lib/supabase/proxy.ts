import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { ConfigError } from "@/lib/config-error";
import { decideAccess } from "@/lib/auth/route-access";
import { getSupabasePublicConfig } from "@/lib/supabase/public-config";

const CACHE_HEADERS = ["Cache-Control", "Expires", "Pragma"];

function configErrorResponse(request: NextRequest): NextResponse {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: { code: "config", message: "Server configuration is incomplete." } },
      { status: 500 },
    );
  }
  return new NextResponse("Server configuration is incomplete.", { status: 500 });
}

/** Refreshes the Supabase session cookies and applies the route-access rules. */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let config: ReturnType<typeof getSupabasePublicConfig>;
  try {
    config = getSupabasePublicConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error("Missing env:", err.missing);
      return configErrorResponse(request);
    }
    throw err;
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      },
    },
  });
  // Nothing may sit between createServerClient and getClaims (Supabase: random logouts otherwise).
  const { data } = await supabase.auth.getClaims();

  const decision = decideAccess({
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
    hasUser: Boolean(data?.claims?.sub),
  });
  if (decision.action === "redirect") {
    const redirect = NextResponse.redirect(new URL(decision.location, request.url));
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    for (const name of CACHE_HEADERS) {
      const value = response.headers.get(name);
      if (value !== null) redirect.headers.set(name, value);
    }
    return redirect;
  }
  return response;
}
