export interface CanonicalMcpName {
  canonical: string;
  mcpId?: string;
}

const KNOWN_MCP_ALIASES: ReadonlyArray<{
  mcpId: string;
  canonical: string;
  keys: readonly string[];
}> = [
  { mcpId: "github", canonical: "GitHub", keys: ["github", "githubmcp", "octocat"] },
  { mcpId: "gitlab", canonical: "GitLab", keys: ["gitlab"] },
  { mcpId: "postgres", canonical: "Postgres", keys: ["postgres", "postgresql", "pg"] },
  { mcpId: "mysql", canonical: "MySQL", keys: ["mysql", "mariadb"] },
  { mcpId: "sqlite", canonical: "SQLite", keys: ["sqlite"] },
  { mcpId: "filesystem", canonical: "Filesystem", keys: ["filesystem", "fs", "localfiles"] },
  { mcpId: "shell", canonical: "Shell", keys: ["shell", "bash", "terminal"] },
  { mcpId: "slack", canonical: "Slack", keys: ["slack"] },
  { mcpId: "discord", canonical: "Discord", keys: ["discord"] },
  { mcpId: "linear", canonical: "Linear", keys: ["linear"] },
  { mcpId: "jira", canonical: "Jira", keys: ["jira", "atlassianjira"] },
  { mcpId: "notion", canonical: "Notion", keys: ["notion"] },
  { mcpId: "puppeteer", canonical: "Puppeteer", keys: ["puppeteer"] },
  { mcpId: "playwright", canonical: "Playwright", keys: ["playwright"] },
  { mcpId: "browser", canonical: "Browser MCP", keys: ["browser", "browsermcp"] },
  { mcpId: "sentry", canonical: "Sentry", keys: ["sentry"] },
  { mcpId: "context7", canonical: "Context7", keys: ["context7"] },
  { mcpId: "shadcn", canonical: "shadcn", keys: ["shadcn"] },
  { mcpId: "reddit", canonical: "Reddit", keys: ["reddit"] },
  { mcpId: "vercel", canonical: "Vercel", keys: ["vercel"] },
  { mcpId: "supabase", canonical: "Supabase", keys: ["supabase"] },
  { mcpId: "gemini-swarm", canonical: "Gemini Swarm", keys: ["geminiswarm"] },
  { mcpId: "stitch", canonical: "Stitch", keys: ["stitch", "googlestitch"] },
  { mcpId: "expo", canonical: "Expo", keys: ["expo"] }
];

const KEY_TO_ALIAS = (() => {
  const map = new Map<string, { mcpId: string; canonical: string }>();
  for (const alias of KNOWN_MCP_ALIASES) {
    for (const key of alias.keys) {
      map.set(key, { mcpId: alias.mcpId, canonical: alias.canonical });
    }
  }
  return map;
})();

function normalizeMatchKey(rawName: string): string {
  return rawName.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function canonicalMcpName(rawName: string): CanonicalMcpName {
  const matchKey = normalizeMatchKey(rawName);
  const hit = KEY_TO_ALIAS.get(matchKey);

  if (hit) {
    return { canonical: hit.canonical, mcpId: hit.mcpId };
  }

  for (const suffix of ["mcp", "server", "mcpserver"]) {
    if (matchKey.endsWith(suffix) && matchKey.length > suffix.length) {
      const stripped = matchKey.slice(0, -suffix.length);
      const stripHit = KEY_TO_ALIAS.get(stripped);
      if (stripHit) {
        return { canonical: stripHit.canonical, mcpId: stripHit.mcpId };
      }
    }
  }

  return { canonical: rawName };
}
