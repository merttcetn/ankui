export interface ParallelMapOptions {
  concurrency: number;
}

export async function parallelMap<T, R>(
  items: readonly T[],
  mapper: (item: T, index: number) => Promise<R>,
  options: ParallelMapOptions
): Promise<R[]> {
  const { concurrency } = options;
  if (!Number.isFinite(concurrency) || concurrency <= 0) {
    throw new RangeError(
      `parallelMap: concurrency must be a positive finite number (got ${concurrency})`
    );
  }

  if (items.length === 0) {
    return [];
  }

  const results: R[] = new Array<R>(items.length);
  let nextIndex = 0;
  let firstError: unknown = undefined;

  async function worker(): Promise<void> {
    while (true) {
      if (firstError !== undefined) return;
      const i = nextIndex;
      nextIndex += 1;
      if (i >= items.length) return;
      try {
        results[i] = await mapper(items[i], i);
      } catch (error) {
        if (firstError === undefined) firstError = error;
        return;
      }
    }
  }

  const workerCount = Math.min(Math.floor(concurrency), items.length);
  const workers: Promise<void>[] = [];
  for (let w = 0; w < workerCount; w += 1) {
    workers.push(worker());
  }
  await Promise.all(workers);

  if (firstError !== undefined) {
    // Re-throw the value caught from mapper() verbatim to preserve the original
    // error; its narrowed type trips only-throw-error.
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    throw firstError;
  }

  return results;
}
