import type { ErrorCode, ErrorResponse } from "@/lib/candles/api-types";

export function jsonNoStore(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export function errorJson(
  status: number,
  code: ErrorCode,
  message: string,
  retryAfterSeconds: number | null = null,
): Response {
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if (retryAfterSeconds !== null) headers["Retry-After"] = String(retryAfterSeconds);
  const body: ErrorResponse = { error: { code, message } };
  return Response.json(body, { status, headers });
}
