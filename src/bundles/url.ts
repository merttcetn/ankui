export interface ParsedUrl {
  url: string;     // canonicalized (no trailing .git)
  owner: string;
  repo: string;
  name: string;    // "<owner>/<repo>"
}

export function parseGitHubUrl(input: string): ParsedUrl {
  if (!input.startsWith("https://")) {
    throw new Error("ankui add: URL must be HTTPS (got: " + safeHead(input) + ")");
  }
  let u: URL;
  try {
    u = new URL(input);
  } catch {
    throw new Error("ankui add: not a valid URL");
  }
  if (u.host !== "github.com") {
    throw new Error("ankui add: only GitHub URLs are supported in v1 (got host: " + u.host + ")");
  }
  const segments = u.pathname.replace(/^\/+/, "").replace(/\/+$/, "").split("/");
  if (segments.length !== 2 || !segments[0] || !segments[1]) {
    throw new Error("ankui add: URL path must be /owner/repo");
  }
  const owner = segments[0];
  const repo = segments[1].replace(/\.git$/, "");
  return {
    url: `https://github.com/${owner}/${repo}`,
    owner,
    repo,
    name: `${owner}/${repo}`
  };
}

function safeHead(input: string): string {
  return input.length > 80 ? input.slice(0, 80) + "…" : input;
}
