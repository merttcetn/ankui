import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { render } from "ink-testing-library";

import { SkillViewport } from "../../../src/tui/components/SkillViewport.js";
import {
  createSkillId,
  type Skill,
  type SkillKind,
  type ToolId
} from "../../../src/types.js";

function makeSkill(name: string, kind: SkillKind = "agent_skill", toolId: ToolId = "claude"): Skill {
  const sourcePath = `/home/.${toolId}/${name}`;
  return {
    id: createSkillId({ toolId, kind, name, sourcePath }),
    toolId,
    kind,
    name,
    summary: "",
    scope: "user",
    sourcePath,
    source: "file",
    capabilityCategories: [],
    accessLevel: "moderate"
  };
}

test("SkillViewport limits the visible rows", () => {
  const skills = Array.from({ length: 15 }, (_, index) =>
    makeSkill(`skill-${String(index).padStart(2, "0")}`)
  );
  const inst = render(<SkillViewport skills={skills} cursor={0} visibleCount={5} />);
  const frame = inst.lastFrame() ?? "";

  assert.match(frame, /skill-00/);
  assert.match(frame, /skill-04/);
  assert.doesNotMatch(frame, /skill-05/);
  assert.match(frame, /showing 1-5/);
  inst.unmount();
});

test("SkillViewport scrolls the window around the cursor", () => {
  const skills = Array.from({ length: 15 }, (_, index) =>
    makeSkill(`skill-${String(index).padStart(2, "0")}`)
  );
  const inst = render(<SkillViewport skills={skills} cursor={12} visibleCount={5} />);
  const frame = inst.lastFrame() ?? "";

  assert.doesNotMatch(frame, /skill-00/);
  assert.match(frame, /skill-12/);
  assert.match(frame, /skill-14/);
  assert.match(frame, /13\/15/);
  inst.unmount();
});
