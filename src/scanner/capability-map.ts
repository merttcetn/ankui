import type { AccessLevel, CapabilityCategory, Skill } from "../types.js";
import { canonicalMcpName } from "./skill-naming.js";

export interface CapabilityClassification {
  capabilityCategories: CapabilityCategory[];
  accessLevel: AccessLevel;
}

const MCP_CAPABILITY_MAP: Record<string, CapabilityClassification> = {
  github: { capabilityCategories: ["code_hosting"], accessLevel: "moderate" },
  gitlab: { capabilityCategories: ["code_hosting"], accessLevel: "moderate" },
  postgres: { capabilityCategories: ["database"], accessLevel: "broad" },
  mysql: { capabilityCategories: ["database"], accessLevel: "broad" },
  sqlite: { capabilityCategories: ["database"], accessLevel: "broad" },
  filesystem: { capabilityCategories: ["filesystem"], accessLevel: "broad" },
  shell: { capabilityCategories: ["shell"], accessLevel: "broad" },
  slack: { capabilityCategories: ["communication"], accessLevel: "moderate" },
  discord: { capabilityCategories: ["communication"], accessLevel: "moderate" },
  reddit: { capabilityCategories: ["communication"], accessLevel: "moderate" },
  linear: { capabilityCategories: ["automation"], accessLevel: "moderate" },
  jira: { capabilityCategories: ["automation"], accessLevel: "moderate" },
  notion: { capabilityCategories: ["automation"], accessLevel: "moderate" },
  puppeteer: { capabilityCategories: ["browser"], accessLevel: "broad" },
  playwright: { capabilityCategories: ["browser"], accessLevel: "broad" },
  browser: { capabilityCategories: ["browser"], accessLevel: "broad" },
  sentry: { capabilityCategories: ["network"], accessLevel: "limited" },
  context7: { capabilityCategories: ["network"], accessLevel: "limited" },
  shadcn: { capabilityCategories: ["network"], accessLevel: "limited" },
  vercel: { capabilityCategories: ["network", "automation"], accessLevel: "moderate" },
  supabase: { capabilityCategories: ["database", "network"], accessLevel: "moderate" }
};

const UNKNOWN_CLASSIFICATION: CapabilityClassification = {
  capabilityCategories: ["unknown"],
  accessLevel: "unknown"
};

export function mapMcpById(mcpId: string | undefined): CapabilityClassification {
  if (!mcpId) {
    return UNKNOWN_CLASSIFICATION;
  }
  return MCP_CAPABILITY_MAP[mcpId] ?? UNKNOWN_CLASSIFICATION;
}

const OPENCODE_TOOL_KEY_MAP: Record<string, CapabilityClassification> = {
  bash: { capabilityCategories: ["shell"], accessLevel: "broad" },
  edit: { capabilityCategories: ["filesystem"], accessLevel: "broad" },
  write: { capabilityCategories: ["filesystem"], accessLevel: "broad" },
  read: { capabilityCategories: ["filesystem"], accessLevel: "moderate" },
  webfetch: { capabilityCategories: ["network"], accessLevel: "moderate" },
  websearch: { capabilityCategories: ["network"], accessLevel: "limited" },
  skill: { capabilityCategories: ["automation"], accessLevel: "limited" }
};

export function mapOpenCodeToolKey(key: string): CapabilityClassification {
  return OPENCODE_TOOL_KEY_MAP[key.toLowerCase()] ?? UNKNOWN_CLASSIFICATION;
}

export function enrichSkill(skill: Skill): void {
  if (skill.kind !== "mcp_server") {
    return;
  }

  const naming = canonicalMcpName(skill.name);
  const classification = mapMcpById(naming.mcpId);

  skill.name = naming.canonical;
  skill.capabilityCategories = classification.capabilityCategories;
  skill.accessLevel = classification.accessLevel;
}
