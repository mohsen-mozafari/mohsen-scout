/** Runs bounded reviews sequentially while isolating a failed item from later items. */
export async function runSequentiallyWithIsolatedFailures<T, R>(
  items: readonly T[],
  limit: number,
  review: (item: T) => Promise<R>,
  onFailure: (item: T, error: unknown) => void,
): Promise<R[]> {
  const maximum = Number.isFinite(limit)
    ? Math.max(0, Math.min(items.length, Math.floor(limit)))
    : items.length;
  const results: R[] = [];
  for (const item of items.slice(0, maximum)) {
    try {
      results.push(await review(item));
    } catch (error) {
      onFailure(item, error);
    }
  }
  return results;
}
