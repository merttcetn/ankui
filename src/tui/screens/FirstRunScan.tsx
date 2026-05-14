import React, { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Box, Text, useInput } from "ink";

import {
  crawlForProjects as defaultCrawl,
  type CrawlOptions,
  type CrawlResult,
  type FoundProject
} from "../../scanner/filesystem-crawler.js";
import {
  groupProjectsByParent,
  type DevRootCandidate
} from "../../scanner/project-discovery.js";
import { relativizeHome } from "../../utils/paths.js";
import { Spinner } from "../components/Spinner.js";
import { ProgressBar } from "../components/ProgressBar.js";
import { SectionHeader } from "../components/SectionHeader.js";
import { DotLeaderRow } from "../components/DotLeaderRow.js";
import { useKeys } from "../input/use-keys.js";
import { SPLASH_DOT, STATUS_DOT, ACTIVE_PREFIX } from "../theme/icons.js";
import { ACCENT } from "../theme/colors.js";

export interface FirstRunScanProps {
  mode: "firstRun" | "rescan";
  homeDir: string;
  onConfirm: (devRoots: string[]) => void;
  onCancel: () => void;
  /** Injected crawler for tests. Defaults to the production `crawlForProjects`. */
  crawlImpl?: (options: CrawlOptions) => Promise<CrawlResult>;
}

type Phase = "crawling" | "selecting" | "empty";

interface SelectableCandidate extends DevRootCandidate {
  selected: boolean;
}

type SelectionAction =
  | { type: "seed"; candidates: SelectableCandidate[] }
  | { type: "moveCursor"; direction: "up" | "down" }
  | { type: "toggleCursor" };

interface SelectionState {
  cursor: number;
  candidates: SelectableCandidate[];
}

function selectionReducer(state: SelectionState, action: SelectionAction): SelectionState {
  switch (action.type) {
    case "seed":
      return { cursor: 0, candidates: action.candidates };
    case "moveCursor": {
      if (state.candidates.length === 0) return state;
      const max = state.candidates.length - 1;
      const step = action.direction === "down" ? 1 : -1;
      const next = Math.max(0, Math.min(max, state.cursor + step));
      return { ...state, cursor: next };
    }
    case "toggleCursor": {
      const list = state.candidates.map((c, idx) =>
        idx === state.cursor ? { ...c, selected: !c.selected } : c
      );
      return { ...state, candidates: list };
    }
    default:
      return state;
  }
}

export function FirstRunScan({
  homeDir,
  onConfirm,
  onCancel,
  crawlImpl
}: FirstRunScanProps): React.ReactElement {
  const [phase, setPhase] = useState<Phase>("crawling");
  const [livePathsVisited, setLivePathsVisited] = useState(0);
  const [liveProjectCount, setLiveProjectCount] = useState(0);
  const [spinnerFrame, setSpinnerFrame] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const [selection, dispatch] = useReducer(selectionReducer, {
    cursor: 0,
    candidates: []
  });

  const crawl = crawlImpl ?? defaultCrawl;

  // Spinner timer.
  useEffect(() => {
    if (phase !== "crawling") return;
    const t = setInterval(() => setSpinnerFrame((f) => f + 1), 100);
    return () => clearInterval(t);
  }, [phase]);

  // Crawl effect — exactly once on mount.
  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    let cancelled = false;

    let projectCount = 0;
    crawl({
      rootDir: homeDir,
      signal: controller.signal,
      onProject: (project: FoundProject) => {
        projectCount += 1;
        if (!cancelled) setLiveProjectCount(projectCount);
        void project;
      }
    })
      .then((result) => {
        if (cancelled) return;
        setLivePathsVisited(result.stats.pathsVisited);
        const grouped = groupProjectsByParent(result.projects);
        if (grouped.length === 0) {
          setPhase("empty");
          return;
        }
        const seeded: SelectableCandidate[] = grouped.map((c) => ({
          ...c,
          selected: c.defaultOn
        }));
        dispatch({ type: "seed", candidates: seeded });
        setPhase("selecting");
      })
      .catch(() => {
        // Crawler tolerates internal failures via warnings; an actual rejection
        // is a programmer bug. Surface as empty so the user can still cancel.
        if (!cancelled) setPhase("empty");
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useKeys({
    onArrowUp: () => dispatch({ type: "moveCursor", direction: "up" }),
    onArrowDown: () => dispatch({ type: "moveCursor", direction: "down" }),
    onEnter: () => {
      if (phase === "selecting") {
        const picked = selection.candidates.filter((c) => c.selected).map((c) => c.parentPath);
        onConfirm(picked);
      } else if (phase === "empty") {
        onConfirm([]);
      }
    },
    onEscape: () => {
      abortRef.current?.abort();
      onCancel();
    }
  });

  // Space toggles current selection.
  useInput((input, key) => {
    if (input === " " && !key.ctrl && !key.meta && phase === "selecting") {
      dispatch({ type: "toggleCursor" });
    }
  });

  const totalSelected = useMemo(
    () => selection.candidates.filter((c) => c.selected).length,
    [selection.candidates]
  );

  return (
    <Box flexDirection="column" paddingX={2}>
      <Box flexDirection="column" marginTop={1}>
        <Text>{`${SPLASH_DOT}  ankui`}</Text>
        <Text dimColor>{"   anghkooey"}</Text>
        <Box marginTop={1}>
          <Text dimColor>{"─".repeat(42)}</Text>
        </Box>
        <Text>{"remember what your agents can access"}</Text>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Spinner
          frame={spinnerFrame}
          label={phase === "crawling" ? "Remembering..." : "Remembered."}
        />
        <Box marginTop={1}>
          <ProgressBar value={phase === "crawling" ? 0.4 : 1} width={28} />
          <Text>{`  ${phase === "crawling" ? "" : "100%"}`}</Text>
        </Box>
        <Text dimColor>
          {`${livePathsVisited.toLocaleString("en-US")} paths visited · ${liveProjectCount} projects found`}
        </Text>
      </Box>

      {phase === "empty" && (
        <Box marginTop={1}>
          <Text dimColor>
            No projects found. Press Enter to continue with an empty config, or Esc to cancel.
          </Text>
        </Box>
      )}

      {phase === "selecting" && (
        <Box flexDirection="column" marginTop={1}>
          <SectionHeader label="FOUND DEV ROOTS" />
          {selection.candidates.map((candidate, idx) => {
            const isActive = idx === selection.cursor;
            const glyph = candidate.selected ? STATUS_DOT : "○";
            const display = relativizeHome(candidate.parentPath, homeDir);
            const meta = `${candidate.projectCount} ${candidate.projectCount === 1 ? "project" : "projects"}`;
            return (
              <Box key={candidate.parentPath}>
                <Text color={isActive ? ACCENT : undefined}>
                  {isActive ? `${ACTIVE_PREFIX} ` : "  "}
                </Text>
                <Text color={candidate.selected ? ACCENT : undefined}>{`${glyph} `}</Text>
                <Box width={60}>
                  <DotLeaderRow label={display} metadata={meta} width={60} />
                </Box>
              </Box>
            );
          })}
          <Box marginTop={1}>
            <Text dimColor>
              {`space toggle · enter accept ${totalSelected} root${totalSelected === 1 ? "" : "s"} · esc cancel`}
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}
