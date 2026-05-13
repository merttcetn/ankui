import path from "node:path";

import { countTextLines, createSanitizedPreview } from "../preview.js";
import { readJsonFile, readMarkdownFile } from "../parsing.js";
import { safeReadDirectory } from "../safety.js";
import {
  addSkillToState,
  addWarningsToState,
  buildLinkDetails,
  buildSkill,
  createAdapterState,
  createMcpDetails,
  extractFirstHeading,
  extractMcpEntries,
  firstString,
  isDiscovered,
  parseMarkdownFrontmatter,
  safeReadOptions,
  type AdapterState
} from "./shared.js";
import type { AdapterContext, AdapterResult, ScannerAdapter } from "./index.js";

export const cursorAdapter: ScannerAdapter = {
  toolId: "cursor",
  async scan(context: AdapterContext): Promise<AdapterResult> {
    const state = createAdapterState();
    const userCursorDir = path.join(context.homeDir, ".cursor");
    const projectCursorDir = path.join(context.cwd, ".cursor");

    await scanMcpJson(state, context, path.join(userCursorDir, "mcp.json"), "user", userCursorDir);
    await scanMcpJson(state, context, path.join(projectCursorDir, "mcp.json"), "project", projectCursorDir);
    await scanMcpJson(state, context, path.join(context.cwd, ".mcp.json"), "project", path.join(context.cwd, ".mcp.json"));
    await scanRulesDirectory(state, context, path.join(userCursorDir, "rules"), "user", userCursorDir);
    await scanRulesDirectory(state, context, path.join(projectCursorDir, "rules"), "project", projectCursorDir);
    await scanCursorRulesFile(state, context);

    return { skills: state.skills, warnings: state.warnings };
  }
};

async function scanMcpJson(
  state: AdapterState,
  context: AdapterContext,
  mcpPath: string,
  scope: "user" | "project",
  requiredPath: string
): Promise<void> {
  if (!isDiscovered(context, requiredPath)) {
    return;
  }

  const result = await readJsonFile(mcpPath, safeReadOptions(mcpPath, context));
  addWarningsToState(state, result.warnings);

  if (!result.ok) {
    return;
  }

  for (const entry of extractMcpEntries(result.value)) {
    addSkillToState(
      state,
      buildSkill({
        toolId: "cursor",
        kind: "mcp_server",
        name: entry.name,
        summary: `Cursor MCP server from ${path.basename(mcpPath)}.`,
        scope,
        sourcePath: mcpPath,
        source: "config",
        details: createMcpDetails(entry)
      })
    );
  }
}

async function scanRulesDirectory(
  state: AdapterState,
  context: AdapterContext,
  dirPath: string,
  scope: "user" | "project",
  requiredPath: string
): Promise<void> {
  if (!isDiscovered(context, requiredPath)) {
    return;
  }

  const entries = await safeReadDirectory(dirPath, safeReadOptions(dirPath, context));
  addWarningsToState(state, entries.warnings);

  if (!entries.ok) {
    return;
  }

  for (const entry of entries.value) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".mdc")) {
      continue;
    }

    const filePath = path.join(dirPath, entry.name);
    const fallbackName = entry.name.replace(/\.mdc$/i, "");

    const result = await readMarkdownFile(filePath, safeReadOptions(filePath, context));
    addWarningsToState(state, result.warnings);

    if (!result.ok) {
      continue;
    }

    const frontmatter = parseMarkdownFrontmatter(result.value, filePath);
    addWarningsToState(state, frontmatter.warnings);

    const name =
      firstString(frontmatter.metadata.name, frontmatter.metadata.title) ?? fallbackName;
    const summary =
      firstString(frontmatter.metadata.description) ??
      extractFirstHeading(result.value) ??
      "Cursor rule.";

    const linkDetails = await buildLinkDetails(filePath, context);

    addSkillToState(
      state,
      buildSkill({
        toolId: "cursor",
        kind: "rules",
        name,
        summary,
        scope,
        sourcePath: filePath,
        source: "directory",
        details: {
          preview: createSanitizedPreview(result.value, filePath),
          lineCount: countTextLines(result.value),
          globs: firstString(frontmatter.metadata.globs),
          alwaysApply: frontmatter.metadata.alwaysApply === true,
          ...linkDetails
        }
      })
    );
  }
}

async function scanCursorRulesFile(
  state: AdapterState,
  context: AdapterContext
): Promise<void> {
  const filePath = path.join(context.cwd, ".cursorrules");

  if (!isDiscovered(context, filePath)) {
    return;
  }

  const result = await readMarkdownFile(filePath, safeReadOptions(filePath, context));
  addWarningsToState(state, result.warnings);

  if (!result.ok) {
    return;
  }

  const linkDetails = await buildLinkDetails(filePath, context);

  addSkillToState(
    state,
    buildSkill({
      toolId: "cursor",
      kind: "memory_file",
      name: ".cursorrules",
      summary: extractFirstHeading(result.value) ?? "Cursor project rules.",
      scope: "project",
      sourcePath: filePath,
      source: "directory",
      details: {
        preview: createSanitizedPreview(result.value, filePath),
        lineCount: countTextLines(result.value),
        ...linkDetails
      }
    })
  );
}
