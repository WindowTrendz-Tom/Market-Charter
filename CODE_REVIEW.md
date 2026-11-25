VERDICT: APPROVED

# Code review – P2-T6 Watchlist store (RLS-scoped) + watchlist service (round 1)

## Checks run by the reviewer
- `npx tsc --noEmit`: clean.
- `npm run lint`: clean.
- `npm test`: 27 files passed, 1 skipped; 257 passed, 11 skipped (matches PROGRESS.md).
- `npm run build`: passes; routes unchanged from T5 (no new routes, as expected for this task).
- `grep -rn "createSupabaseAdminClient" lib/watchlist`: no output.
- Twelve Data calls made during review: 0. `.env.local` not read.

## "Done when"
| Check | Result |
|---|---|
| All new tests pass | Yes: 10 store tests (fake fetch) + 38 service tests, covering plan cases 1–15 plus extras |
| build / lint / test / tsc | All pass |
| No admin client in `lib/watchlist` | Confirmed |

## Constraints and the specific points asked about
- **User-scoped client only.** `createSupabaseWatchlistStore` takes a `SupabaseClient<Database>` and is documented as user-scoped; nothing under `lib/watchlist` imports the admin client or any secret. RLS policy `watchlist_owner_all` (using + with check on `auth.uid() = user_id`) and the table grants in the migration back this up.
- **`user_id` never from input.** `insert` sends `{ symbol, sort_order }` only (asserted in `supabase-watchlist-store.test.ts:50-57`); the column default `auth.uid()` fills it. No `user_id` anywhere in the service or store.
- **Validate before saving.** `addToWatchlist` order is parse → `list()` → duplicate (409) → full (409) → `checkUsSymbol` → insert. The guarded check runs before `insert`, and a failure (404 / 422 / 429 / 502 / 503 busy) is returned as is with nothing inserted (tests 6, 7, 8).
- **Duplicates.** Pre-check gives 409 with 0 search calls (test 4); the insert race (`23505` → `"duplicate"`) also gives 409 (test 9).
- **Reorder conflict detection.** Length check plus every symbol present plus no duplicates in the request means the request set must equal the stored set; otherwise 409 `order_mismatch` with no update (test 12: extra, missing, different symbol). Only changed rows are written; an unchanged order writes nothing.
- **Refresh.** Not-in-list → 404 with 0 provider calls; otherwise goes through `getChartCandles`, which applies `checkCreditBudget`, the fetch lease and `fetch_log`. No `/quote` call exists anywhere in `lib/watchlist` or `lib/data-provider`. The quote is computed locally from the returned candles. Budget-full passthrough is tested (14d: 429, retry 60, 0 provider calls).
- **StoreError → 503.** `guardStore` wraps every exported function, logs, and returns 503 `cache_unavailable` with `CACHE_UNAVAILABLE_MESSAGE`; non-StoreErrors are rethrown. Tested for list, candle-cache read, and insert failures.
- **Robustness.** Invalid symbols (non-string, too long, bad characters, null, empty) → 400 with no calls; cold ticker → `quote: null`; 429 and provider failures come back as structured failures, never thrown.
- **Scope.** Only the files listed in the plan were created; `limits.ts` constants (incl. refresh pacing) are as specified. Nothing beyond the task.

## Executor's concerns (PROGRESS.md / handover)
1. **Reorder strictness (`normaliseSymbol(s) === s`).** Accepted. This is a fair reading of "passing `normaliseSymbol` to the same value", and it is the safer one: the reorder body is meant to be the exact list the client received from `GET /api/watchlist`, which is already normalised and upper-case (the DB `check (symbol = upper(symbol))` guarantees it). A lower-case symbol in a reorder body signals a client bug, and a 400 is the right answer. Not blocking.
2. **Case 11 seeding (A=1, B=2, C=5).** Accepted. The plain 0,1,2 case cannot prove "only changed rows", so splitting it into 11 and 11b is the right way to cover both behaviours.
3. **No opt-in Supabase integration test for the store.** Accepted. The plan doesn't require one, and it needs a real user session (P2-T9). The fake-fetch tests pin the REST shape (URL ordering, body, filters, PATCH per row).
4. **503 after a successful insert** (`readQuote` throws after `insert` succeeded). Not blocking. It is a real but minor UX inconsistency: the row is saved but the client is told 503. It follows the plan literally (step 6 + "every function catches StoreError → 503"), the window is tiny (the user-scoped insert has just succeeded against the same database), and it self-heals: the client reloads on error per the plan's risk note, and the ticker then appears. A retry would get a clear 409 "already in your watchlist" rather than a double insert. See Optional 1 for a cheap improvement.

## Optional (non-blocking)
1. `lib/watchlist/watchlist-service.ts:113` – consider treating a `StoreError` from `readQuote` *after* a successful insert as `quote: null` (log it) rather than a 503, so the response matches what was saved. The sidebar refresh will fill the quote in later anyway. If adopted, note it in PROGRESS.md as a small deviation from the plan.
2. `lib/watchlist/watchlist-service.ts:138` – `symbols as string[]` is safe after the checks above, but a small `isSymbolOrder(x): x is string[]` type guard would remove the cast.
3. `lib/watchlist/watchlist-service.ts:88-90` – one candle-cache failure turns the whole list into a 503. That is per plan and fine for one user; if it becomes noisy, per-row `quote: null` on error would degrade more gently.
