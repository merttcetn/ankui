import test from "node:test";
import assert from "node:assert/strict";

import { browserOpenCommand } from "../../src/web/open-browser.js";

test("browserOpenCommand uses `open` on macOS", () => {
  const cmd = browserOpenCommand("darwin", "http://127.0.0.1:7373");
  assert.deepEqual(cmd, { command: "open", args: ["http://127.0.0.1:7373"] });
});

test("browserOpenCommand uses `cmd /c start` on Windows", () => {
  const cmd = browserOpenCommand("win32", "http://127.0.0.1:7373");
  assert.deepEqual(cmd, {
    command: "cmd",
    args: ["/c", "start", "", "http://127.0.0.1:7373"]
  });
});

test("browserOpenCommand uses `xdg-open` on Linux", () => {
  const cmd = browserOpenCommand("linux", "http://127.0.0.1:7373");
  assert.deepEqual(cmd, {
    command: "xdg-open",
    args: ["http://127.0.0.1:7373"]
  });
});
