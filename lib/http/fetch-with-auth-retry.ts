export const AUTH_RETRY_DELAY_MS = 1000;

interface Deps {
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
}

const defaultDeps: Deps = {
  fetch: (input, init) => fetch(input, init),
  sleep: (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
};

/** Fetches; on a 401 waits briefly and tries once more (a token refresh may be in flight). Network errors propagate. */
export async function fetchWithAuthRetry(
  input: string,
  init?: RequestInit,
  deps: Deps = defaultDeps,
): Promise<Response> {
  const first = await deps.fetch(input, init);
  if (first.status !== 401) return first;
  await deps.sleep(AUTH_RETRY_DELAY_MS);
  return deps.fetch(input, init);
}
