import React from "react";

import type { AITool, MultiProjectScanResult } from "../../types.js";
import { EMPTY_STATE_WHISPERS } from "../../tui/messages.js";
import { relativizeHome } from "../../utils/paths.js";
import { isBundleOrigin } from "../../utils/skill-groups.js";
import { DetailHeader } from "../components/DetailHeader.js";
import { EntityRail, type EntityRailSection } from "../components/EntityRail.js";
import { SectionLabel } from "../components/SectionLabel.js";
import { SkillRow } from "../components/SkillRow.js";
import { StatGrid } from "../components/StatGrid.js";
import { type PillVariant } from "../components/Pill.js";
import { originPill } from "../utils/origin-pill.js";

const KIND_PILL: Record<string, PillVariant> = {
  agent_skill: "muted",
  mcp_server: "info",
  custom_commands: "muted",
  plugins: "muted"
};

export function ToolsView(props: {
  scan: MultiProjectScanResult;
  selectedId: string | null;
  onSelectId: (id: string) => void;
}): { rail: React.ReactNode; detail: React.ReactNode } {
  const detectedTools = props.scan.userScope.tools.filter((t) => t.detected);
  const selectedId = props.selectedId ?? detectedTools[0]?.id ?? null;

  const sections: EntityRailSection[] = [
    {
      heading: "tools",
      items: detectedTools.map((t) => ({
        id: t.id,
        label: t.name,
        count: t.skills.length,
        pip: t.warnings.length > 0 ? "warn" : "ok"
      }))
    },
    {
      heading: "projects",
      items: props.scan.projects.map((p) => ({
        id: `proj:${p.projectPath}`,
        label: p.displayPath,
        count: p.scan.summary.totalSkills
      }))
    }
  ];

  const selectedTool = detectedTools.find((t) => t.id === selectedId);
  const selectedProject = selectedId?.startsWith("proj:")
    ? props.scan.projects.find((p) => `proj:${p.projectPath}` === selectedId)
    : undefined;

  const rail = (
    <EntityRail
      sections={sections}
      selectedId={selectedId}
      onSelect={props.onSelectId}
    />
  );

  if (selectedTool) {
    return { rail, detail: <ToolDetail tool={selectedTool} homeDir={props.scan.homeDir} /> };
  }
  if (selectedProject) {
    return {
      rail,
      detail: <ProjectDetail project={selectedProject} homeDir={props.scan.homeDir} />
    };
  }
  return {
    rail,
    detail: <div className="empty-whisper">{EMPTY_STATE_WHISPERS.noProjectSkills}</div>
  };
}

function ToolDetail({ tool, homeDir }: { tool: AITool; homeDir: string }): React.ReactElement {
  const mcps = tool.skills.filter((s) => s.kind === "mcp_server");
  const agentSkills = tool.skills.filter((s) => s.kind === "agent_skill");
  const commands = tool.skills.filter((s) => s.kind === "custom_commands");
  const others = tool.skills.filter(
    (s) => s.kind !== "mcp_server" && s.kind !== "agent_skill" && s.kind !== "custom_commands"
  );

  const stats = [
    { label: "skills", value: tool.skills.length },
    { label: "mcp servers", value: mcps.length },
    { label: "commands", value: commands.length },
    { label: "findings", value: tool.findings.length }
  ];

  const detected = tool.detectedPaths.length;
  const meta = `DETECTED · ${detected} PATH${detected === 1 ? "" : "S"} · USER SCOPE`;

  return (
    <>
      <DetailHeader
        crumb={`TOOLS / ${tool.name.toUpperCase()}`}
        title={tool.name}
        meta={meta}
      />
      <StatGrid items={stats} />

      {agentSkills.length > 0 && (
        <>
          <SectionLabel count={agentSkills.length}>agent skills</SectionLabel>
          {agentSkills.map((sk) => {
            const origin = originPill(sk);
            const bo = isBundleOrigin(sk.details?.bundleOrigin) ? sk.details?.bundleOrigin : undefined;
            const src = bo?.name
              ? `${bo.name} · ${relativizeHome(sk.sourcePath, homeDir)}`
              : relativizeHome(sk.sourcePath, homeDir);
            return (
              <SkillRow
                key={sk.id}
                pill={origin}
                name={sk.name}
                source={src}
              />
            );
          })}
        </>
      )}

      {mcps.length > 0 && (
        <>
          <SectionLabel count={mcps.length}>mcp servers</SectionLabel>
          {mcps.map((sk) => (
            <SkillRow
              key={sk.id}
              pill={originPill(sk)}
              name={sk.name}
              source={relativizeHome(sk.sourcePath, homeDir)}
            />
          ))}
        </>
      )}

      {commands.length > 0 && (
        <>
          <SectionLabel count={commands.length}>commands</SectionLabel>
          {commands.map((sk) => (
            <SkillRow
              key={sk.id}
              pill={originPill(sk)}
              name={sk.name}
              source={relativizeHome(sk.sourcePath, homeDir)}
            />
          ))}
        </>
      )}

      {others.length > 0 && (
        <>
          <SectionLabel count={others.length}>other</SectionLabel>
          {others.map((sk) => (
            <SkillRow
              key={sk.id}
              pill={{ variant: KIND_PILL[sk.kind] ?? "muted", label: sk.kind.toUpperCase() }}
              name={sk.name}
              source={relativizeHome(sk.sourcePath, homeDir)}
            />
          ))}
        </>
      )}
    </>
  );
}

function ProjectDetail({
  project,
  homeDir
}: {
  project: MultiProjectScanResult["projects"][number];
  homeDir: string;
}): React.ReactElement {
  const totalSkills = project.scan.summary.totalSkills;
  return (
    <>
      <DetailHeader
        crumb={`TOOLS / PROJECTS / ${project.displayPath.toUpperCase()}`}
        title={project.displayPath}
        meta={`${totalSkills} SKILL${totalSkills === 1 ? "" : "S"}`}
      />
      {project.scan.tools.filter((t) => t.detected).map((tool) => (
        <div key={tool.id} style={{ marginBottom: 14 }}>
          <SectionLabel count={tool.skills.length}>{tool.name}</SectionLabel>
          {tool.skills.map((sk) => (
            <SkillRow
              key={sk.id}
              pill={originPill(sk)}
              name={sk.name}
              source={relativizeHome(sk.sourcePath, homeDir)}
            />
          ))}
        </div>
      ))}
    </>
  );
}
