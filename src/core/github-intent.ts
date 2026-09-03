export type GithubIntentAction = "search" | "lookup" | "clone" | null;

export interface GithubIntent {
  action: GithubIntentAction;
  query?: string;
  fullName?: string;
}

const SEARCH_RE =
  /\b(?:search|find|look\s*up)\s+(?:github\s+)?(?:repos?(?:itories)?|projects?)\b|\bgithub\s+search\b/i;
const CLONE_RE = /\b(?:clone|download)\s+(?:github\s+)?(?:repo(?:sitory)?\s+)?/i;
const LOOKUP_RE = /\b(?:lookup|look\s*up|inspect)\s+(?:github\s+)?(?:repo(?:sitory)?\s+)?/i;
const FULL_NAME_RE = /\b([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\b/;

export const parseGithubIntent = (input: string): GithubIntent => {
  const trimmed = input.trim();
  if (!trimmed) return { action: null };

  if (CLONE_RE.test(trimmed)) {
    const fullName = extractFullName(trimmed);
    if (fullName) return { action: "clone", fullName };
  }

  if (LOOKUP_RE.test(trimmed)) {
    const fullName = extractFullName(trimmed);
    if (fullName) return { action: "lookup", fullName };
  }

  if (SEARCH_RE.test(trimmed) || /\bsearch github(?:\s+for)?\b/i.test(trimmed)) {
    const query = extractSearchQuery(trimmed);
    if (query) return { action: "search", query };
  }

  // Bare "github owner/repo" → lookup
  if (/^github\s+[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/i.test(trimmed)) {
    const fullName = extractFullName(trimmed);
    if (fullName) return { action: "lookup", fullName };
  }

  return { action: null };
};

const extractFullName = (input: string): string | undefined => {
  const urlMatch = input.match(/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/i);
  if (urlMatch) return urlMatch[1].replace(/\.git$/i, "");
  const match = input.match(FULL_NAME_RE);
  return match?.[1]?.replace(/\.git$/i, "");
};

const extractSearchQuery = (input: string): string | undefined => {
  let query = input
    .replace(SEARCH_RE, " ")
    .replace(/\bsearch github(?:\s+for)?\b/i, " ")
    .replace(/\bgithub\b/i, " ")
    .replace(/\bfor\b/i, " ")
    .replace(/[?:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return query || undefined;
};
