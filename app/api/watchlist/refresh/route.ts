import { jsonNoStore } from "@/lib/http/json";
import type { WatchlistRefreshResponse } from "@/lib/watchlist/api-types";
import { failureJson, invalidBodyJson, readJsonObject, withWatchlistDeps } from "@/lib/watchlist/route-handler";
import { refreshWatchlistSymbol } from "@/lib/watchlist/watchlist-service";

export const dynamic = "force-dynamic";

export function POST(request: Request): Promise<Response> {
  return withWatchlistDeps(async (deps) => {
    const body = await readJsonObject(request);
    if (!body) return invalidBodyJson();
    const result = await refreshWatchlistSymbol(body.symbol, deps);
    if (!result.ok) return failureJson(result);
    return jsonNoStore({
      item: result.item,
      source: result.source,
      notice: result.notice,
    } satisfies WatchlistRefreshResponse);
  });
}
