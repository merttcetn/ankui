import assert from "node:assert/strict";
import test from "node:test";

import { formatLastScan } from "../../../src/tui/util/scan-history.js";

test("formatLastScan returns 'YYYY-MM-DD HH:MM · N skills' for a valid ISO string", () => {
  const result = formatLastScan({
    scannedAt: "2026-05-14T00:42:13.000Z",
    totalSkills: 273,
    timeZone: "UTC"
  });
  assert.equal(result, "2026-05-14 00:42 · 273 skills");
});

test("formatLastScan uses singular 'skill' when totalSkills is 1", () => {
  const result = formatLastScan({
    scannedAt: "2026-05-14T00:00:00.000Z",
    totalSkills: 1,
    timeZone: "UTC"
  });
  assert.equal(result, "2026-05-14 00:00 · 1 skill");
});

test("formatLastScan returns 'never' for an empty scannedAt", () => {
  const result = formatLastScan({
    scannedAt: "",
    totalSkills: 0,
    timeZone: "UTC"
  });
  assert.equal(result, "never");
});

test("formatLastScan returns 'never' for a malformed ISO string", () => {
  const result = formatLastScan({
    scannedAt: "not-a-date",
    totalSkills: 0,
    timeZone: "UTC"
  });
  assert.equal(result, "never");
});

test("formatLastScan respects an explicit timeZone parameter", () => {
  // 2026-05-14T00:42:13Z is 2026-05-13 17:42 in America/Los_Angeles.
  const result = formatLastScan({
    scannedAt: "2026-05-14T00:42:13.000Z",
    totalSkills: 5,
    timeZone: "America/Los_Angeles"
  });
  assert.equal(result, "2026-05-13 17:42 · 5 skills");
});
