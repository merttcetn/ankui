import React from "react";
import { render } from "ink";

import type { MultiProjectScanResult } from "../types.js";
import { App } from "./App.js";

export async function renderTui(result: MultiProjectScanResult): Promise<void> {
  const instance = render(React.createElement(App, { result }));
  await instance.waitUntilExit();
}
