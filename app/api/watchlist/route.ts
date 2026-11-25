import { jsonNoStore } from "@/lib/http/json";
import type { WatchlistItemResponse, WatchlistResponse } from "@/lib/watchlist/api-types";
import { failureJson, invalidBodyJson, readJsonObject, withWatchlistDeps } from "@/lib/watchlist/route-handler";
import {
  addToWatchlist,
  listWatchlist,
  removeFromWatchlist,
  reorderWatchlist,
} from "@/lib/watchlist/watchlist-service";

export const dynamic = "force-dynamic";

export function GET(): Promise<Response> {
  return withWatchlistDeps(async (deps) => {
    const result = await listWatchlist(deps);
    if (!result.ok) return failureJson(result);
    return jsonNoStore({ items: result.items } satisfies WatchlistResponse);
  });
}

export function POST(request: Request): Promise<Response> {
  return withWatchlistDeps(async (deps) => {
    const body = await readJsonObject(request);
    if (!body) return invalidBodyJson();
    const result = await addToWatchlist(body.symbol, deps);
    if (!result.ok) return failureJson(result);
    return jsonNoStore({ item: result.item } satisfies WatchlistItemResponse, 201);
  });
}

export function DELETE(request: Request): Promise<Response> {
  return withWatchlistDeps(async (deps) => {
    const result = await removeFromWatchlist(new URL(request.url).searchParams.get("symbol"), deps);
    if (!result.ok) return failureJson(result);
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  });
}

export function PATCH(request: Request): Promise<Response> {
  return withWatchlistDeps(async (deps) => {
    const body = await readJsonObject(request);
    if (!body) return invalidBodyJson();
    const saved = await reorderWatchlist(body.symbols, deps);
    if (!saved.ok) return failureJson(saved);
    const result = await listWatchlist(deps);
    if (!result.ok) return failureJson(result);
    return jsonNoStore({ items: result.items } satisfies WatchlistResponse);
  });
}
