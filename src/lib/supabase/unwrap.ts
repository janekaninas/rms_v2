// A silently-empty result set (from a masked query error, e.g. an ambiguous
// PostgREST embed) is worse than a crash here — it renders as "no data yet"
// indistinguishably from a genuinely empty table. Throwing surfaces the
// real error via the route's error boundary instead (CLAUDE.md rule 11:
// no black-box totals — a failed query should never look like an empty one).
export function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data as T;
}
