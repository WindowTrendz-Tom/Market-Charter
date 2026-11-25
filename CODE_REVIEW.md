VERDICT: APPROVED

Task P1-T3, round 1.

Checks run: `npm run build`, `npm run lint` and `npm test` all pass (5 files, 27 tests).

Findings:
- Stale rule in `lib/time/market-calendar.ts` matches the PLAN.md "Stale rule" section.
  - The 18:00 cutoff is inclusive and uses minute-level comparison.
  - Weekends step back to Friday, including after 18:00 on Sunday.
  - Offsets come from `Intl.formatToParts`, with no hard-coded -4/-5.
  - `zonedDateTimeToUtc` is two-pass. 18:00 never falls in the 02:00 DST gap, so the Oct/Nov/Mar cutoff cases are correct.
  - `isDailyCacheFresh` implements clauses (a) and (b) as specified.
- Storage stays in UTC (`dateToDailyTs`, `dailyTsToDate` accept `+00:00`). Display is fixed to Pacific/Auckland with en-NZ. This matches the plan.
- `normaliseSymbol` regex matches the plan.
- No scope creep. Only the planned files plus the PROGRESS.md update.

Optional:
- Unlike the other two files, `symbol.test.ts` was not checked case by case against the plan list.
- `nzTickMarkLabel` uses `default` for tick types 3 and 4. This is fine.
