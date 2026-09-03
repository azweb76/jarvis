import fs from "node:fs";
import path from "node:path";
import { expandHome } from "./git.js";
import { runProcess } from "./process.js";

const GITHUB_API = "https://api.github.com";
const SEARCH_CACHE_TTL_MS = 20_000;
const LOOKUP_CACHE_TTL_MS = 60_000;
const DEFAULT_PER_PAGE = 8;
const MAX_PER_PAGE = 20;

export interface GithubRepoSummary {
  id: number;
  fullName: string;
  name: string;
  owner: string;
  description: string | null;
  htmlUrl: string;
  cloneUrl: string;
  defaultBranch: string;
  language: string | null;
  stars: number;
  forks: number;
  private: boolean;
  updatedAt: string;
}

export interface GithubSearchResult {
  query: string;
  totalCount: number;
  incompleteResults: boolean;
  items: GithubRepoSummary[];
  cached: boolean;
}

export interface GithubStatus {
  configured: boolean;
  reposDir: string;
  apiBase: string;
}

export interface CloneRepoInput {
  fullName?: string;
  cloneUrl?: string;
  destination?: string;
}

export interface CloneRepoResult {
  fullName: string;
  path: string;
  alreadyExisted: boolean;
}

export class GithubError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: string
  ) {
    super(message);
    this.name = "GithubError";
  }
}

interface CacheEntry<T> {
  at: number;
  value: T;
}

const searchCache = new Map<string, CacheEntry<GithubSearchResult>>();
const lookupCache = new Map<string, CacheEntry<GithubRepoSummary>>();

export const clearGithubCaches = (): void => {
  searchCache.clear();
  lookupCache.clear();
};

export const resolveGithubToken = (env: NodeJS.ProcessEnv = process.env): string | undefined => {
  const token = env.GITHUB_TOKEN?.trim();
  return token || undefined;
};

export const resolveReposDir = (env: NodeJS.ProcessEnv = process.env): string => {
  const configured = env.JARVIS_REPOS_DIR?.trim();
  if (configured) return path.resolve(expandHome(configured));
  return path.resolve(process.cwd(), "data", "repos");
};

export const getGithubStatus = (env: NodeJS.ProcessEnv = process.env): GithubStatus => ({
  configured: Boolean(resolveGithubToken(env)),
  reposDir: resolveReposDir(env),
  apiBase: GITHUB_API
});

export const requireGithubToken = (env: NodeJS.ProcessEnv = process.env): string => {
  const token = resolveGithubToken(env);
  if (!token) {
    throw new GithubError(
      "GITHUB_TOKEN is not set. Export a GitHub personal access token to search and clone repos.",
      401,
      "missing_token"
    );
  }
  return token;
};

export const parseFullName = (value: string): { owner: string; repo: string } | null => {
  const trimmed = value.trim().replace(/\.git$/i, "");
  const match = trimmed.match(
    /^(?:https?:\/\/github\.com\/|git@github\.com:)?([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/?$/
  );
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
};

export const searchGithubRepos = async (
  query: string,
  options: { perPage?: number; signal?: AbortSignal; env?: NodeJS.ProcessEnv } = {}
): Promise<GithubSearchResult> => {
  const q = query.trim();
  if (!q) {
    throw new GithubError("Search query is required", 400, "missing_query");
  }

  const perPage = Math.min(
    Math.max(1, options.perPage ?? DEFAULT_PER_PAGE),
    MAX_PER_PAGE
  );
  const cacheKey = `${q.toLowerCase()}::${perPage}`;
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.at < SEARCH_CACHE_TTL_MS) {
    return { ...cached.value, cached: true };
  }

  const token = requireGithubToken(options.env);
  const url = new URL(`${GITHUB_API}/search/repositories`);
  url.searchParams.set("q", q);
  url.searchParams.set("per_page", String(perPage));
  url.searchParams.set("sort", "stars");
  url.searchParams.set("order", "desc");

  const payload = await githubJson<{
    total_count: number;
    incomplete_results: boolean;
    items: GithubApiRepo[];
  }>(url, token, options.signal);

  const result: GithubSearchResult = {
    query: q,
    totalCount: payload.total_count,
    incompleteResults: payload.incomplete_results,
    items: payload.items.map(toSummary),
    cached: false
  };
  searchCache.set(cacheKey, { at: Date.now(), value: result });
  return result;
};

export const lookupGithubRepo = async (
  fullName: string,
  options: { signal?: AbortSignal; env?: NodeJS.ProcessEnv } = {}
): Promise<GithubRepoSummary> => {
  const parsed = parseFullName(fullName);
  if (!parsed) {
    throw new GithubError(
      `Invalid repository name: ${fullName}. Use owner/repo.`,
      400,
      "invalid_full_name"
    );
  }

  const key = `${parsed.owner}/${parsed.repo}`.toLowerCase();
  const cached = lookupCache.get(key);
  if (cached && Date.now() - cached.at < LOOKUP_CACHE_TTL_MS) {
    return cached.value;
  }

  const token = requireGithubToken(options.env);
  const payload = await githubJson<GithubApiRepo>(
    `${GITHUB_API}/repos/${parsed.owner}/${parsed.repo}`,
    token,
    options.signal
  );
  const summary = toSummary(payload);
  lookupCache.set(key, { at: Date.now(), value: summary });
  return summary;
};

export const cloneGithubRepo = async (
  input: CloneRepoInput,
  options: { env?: NodeJS.ProcessEnv; timeoutMs?: number } = {}
): Promise<CloneRepoResult> => {
  const env = options.env ?? process.env;
  const token = requireGithubToken(env);
  const parsed = parseFullName(input.fullName?.trim() || input.cloneUrl?.trim() || "");
  if (!parsed) {
    throw new GithubError(
      "fullName or cloneUrl is required (owner/repo)",
      400,
      "invalid_full_name"
    );
  }

  const name = `${parsed.owner}/${parsed.repo}`;
  const reposDir = resolveReposDir(env);
  const destination = input.destination?.trim()
    ? path.resolve(expandHome(input.destination.trim()))
    : path.join(reposDir, parsed.owner, parsed.repo);

  if (fs.existsSync(destination)) {
    const gitDir = path.join(destination, ".git");
    if (fs.existsSync(gitDir)) {
      return { fullName: name, path: destination, alreadyExisted: true };
    }
    throw new GithubError(
      `Destination exists and is not a git repo: ${destination}`,
      409,
      "destination_exists"
    );
  }

  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const publicCloneUrl = `https://github.com/${parsed.owner}/${parsed.repo}.git`;
  // Prefer tokenized HTTPS URL — works for classic PATs, fine-grained tokens,
  // and GitHub App installation tokens (bearer extraHeader alone often fails for ghs_*).
  const authedCloneUrl = `https://x-access-token:${token}@github.com/${parsed.owner}/${parsed.repo}.git`;
  const result = await runProcess("git", {
    cwd: path.dirname(destination),
    args: [
      "clone",
      "--filter=blob:none",
      "--single-branch",
      authedCloneUrl,
      destination
    ],
    timeoutMs: options.timeoutMs ?? 120_000,
    env: { ...env, GIT_TERMINAL_PROMPT: "0" }
  });

  if (result.code !== 0) {
    throw new GithubError(
      result.stderr.trim() || result.stdout.trim() || `Failed to clone ${name}`,
      502,
      "clone_failed"
    );
  }

  // Scrub the token from the stored remote URL.
  await runProcess("git", {
    cwd: destination,
    args: ["remote", "set-url", "origin", publicCloneUrl],
    timeoutMs: 10_000,
    env: { ...env, GIT_TERMINAL_PROMPT: "0" }
  }).catch(() => undefined);

  return { fullName: name, path: destination, alreadyExisted: false };
};

export const listClonedRepos = (env: NodeJS.ProcessEnv = process.env): Array<{
  fullName: string;
  path: string;
}> => {
  const reposDir = resolveReposDir(env);
  if (!fs.existsSync(reposDir)) return [];

  const found: Array<{ fullName: string; path: string }> = [];
  for (const owner of safeReadDirs(reposDir)) {
    const ownerPath = path.join(reposDir, owner);
    for (const repo of safeReadDirs(ownerPath)) {
      const repoPath = path.join(ownerPath, repo);
      if (fs.existsSync(path.join(repoPath, ".git"))) {
        found.push({ fullName: `${owner}/${repo}`, path: repoPath });
      }
    }
  }
  return found.sort((a, b) => a.fullName.localeCompare(b.fullName));
};

interface GithubApiRepo {
  id: number;
  full_name: string;
  name: string;
  owner: { login: string };
  description: string | null;
  html_url: string;
  clone_url: string;
  default_branch: string;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  private: boolean;
  updated_at: string;
}

const toSummary = (repo: GithubApiRepo): GithubRepoSummary => ({
  id: repo.id,
  fullName: repo.full_name,
  name: repo.name,
  owner: repo.owner.login,
  description: repo.description,
  htmlUrl: repo.html_url,
  cloneUrl: repo.clone_url,
  defaultBranch: repo.default_branch,
  language: repo.language,
  stars: repo.stargazers_count,
  forks: repo.forks_count,
  private: repo.private,
  updatedAt: repo.updated_at
});

const githubJson = async <T>(
  url: string | URL,
  token: string,
  signal?: AbortSignal
): Promise<T> => {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "jarvis-github-client",
        "X-GitHub-Api-Version": "2022-11-28"
      },
      signal
    });
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    throw new GithubError(`GitHub request failed: ${(error as Error).message}`, 502, "network");
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const detail = body.slice(0, 240).trim();
    throw new GithubError(
      detail || `GitHub API error (${response.status})`,
      response.status,
      "api_error"
    );
  }

  return (await response.json()) as T;
};

const safeReadDirs = (dir: string): string[] => {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map((entry) => entry.name);
  } catch {
    return [];
  }
};
