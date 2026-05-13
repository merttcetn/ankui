import { useInput } from "ink";

export interface KeyHandlers {
  onTabNext?: () => void;
  onTabPrev?: () => void;
  onArrowUp?: () => void;
  onArrowDown?: () => void;
  onEnter?: () => void;
  onEscape?: () => void;
  onQuit?: () => void;
  onRefresh?: () => void;
}

export function useKeys(handlers: KeyHandlers): void {
  useInput((input, key) => {
    if (key.tab && !key.shift) handlers.onTabNext?.();
    else if (key.tab && key.shift) handlers.onTabPrev?.();
    else if (key.upArrow) handlers.onArrowUp?.();
    else if (key.downArrow) handlers.onArrowDown?.();
    else if (key.return) handlers.onEnter?.();
    else if (key.escape) handlers.onEscape?.();
    else if (input === "q") handlers.onQuit?.();
    else if (input === "r") handlers.onRefresh?.();
  });
}
