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
  onSlash?: () => void;
  /** Receives any printable character not otherwise handled. */
  onTextInput?: (ch: string) => void;
  /** Receives a backspace event. */
  onBackspace?: () => void;
}

export function useKeys(handlers: KeyHandlers): void {
  useInput((input, key) => {
    if (key.tab && !key.shift) return handlers.onTabNext?.();
    if (key.tab && key.shift) return handlers.onTabPrev?.();
    if (key.upArrow) return handlers.onArrowUp?.();
    if (key.downArrow) return handlers.onArrowDown?.();
    if (key.return) return handlers.onEnter?.();
    if (key.escape) return handlers.onEscape?.();
    if (key.backspace || key.delete) return handlers.onBackspace?.();
    if (input === "/") return handlers.onSlash?.();
    if (input === "q") return handlers.onQuit?.();
    if (input === "r") return handlers.onRefresh?.();
    if (input && input.length === 1 && input >= " " && input !== "/") {
      handlers.onTextInput?.(input);
    }
  });
}
