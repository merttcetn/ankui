import React from "react";
import { render } from "ink";

import type { MultiProjectScanResult } from "../types.js";
import { App, type DataSource } from "./App.js";

export async function renderTui(
  resultOrDataSource: MultiProjectScanResult | DataSource
): Promise<void> {
  const props =
    "initial" in resultOrDataSource
      ? { dataSource: resultOrDataSource }
      : { result: resultOrDataSource };
  const instance = render(React.createElement(App, props as never));
  await instance.waitUntilExit();
}
