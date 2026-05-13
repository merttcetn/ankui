import assert from "node:assert/strict";
import test from "node:test";

import { parallelMap } from "../../src/scanner/parallel.js";

test("parallelMap preserves input order even when later items resolve first", async () => {
  const input = [100, 10, 50, 5, 80];
  const result = await parallelMap(
    input,
    async (n) => {
      await new Promise((resolve) => setTimeout(resolve, n));
      return n * 2;
    },
    { concurrency: 5 }
  );
  assert.deepEqual(result, [200, 20, 100, 10, 160]);
});

test("parallelMap respects concurrency limit", async () => {
  let active = 0;
  let maxActive = 0;

  await parallelMap(
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 20));
      active -= 1;
    },
    { concurrency: 3 }
  );

  assert.ok(maxActive <= 3, `expected maxActive <= 3, got ${maxActive}`);
  assert.ok(maxActive >= 1, "mappers should have actually run");
});

test("parallelMap rejects when mapper throws", async () => {
  await assert.rejects(
    () =>
      parallelMap(
        [1, 2, 3],
        async (n) => {
          if (n === 2) throw new Error("boom");
          return n;
        },
        { concurrency: 2 }
      ),
    /boom/
  );
});

test("parallelMap throws RangeError when concurrency is zero or negative", async () => {
  await assert.rejects(
    () => parallelMap([1, 2], async (n) => n, { concurrency: 0 }),
    RangeError
  );
  await assert.rejects(
    () => parallelMap([1, 2], async (n) => n, { concurrency: -1 }),
    RangeError
  );
});

test("parallelMap returns empty array for empty input regardless of concurrency", async () => {
  const result = await parallelMap([], async (n: number) => n, { concurrency: 10 });
  assert.deepEqual(result, []);
});

test("parallelMap handles concurrency greater than item count", async () => {
  const result = await parallelMap([1, 2, 3], async (n) => n * 10, { concurrency: 100 });
  assert.deepEqual(result, [10, 20, 30]);
});
