import {
  cloneGithubRepo,
  getGithubStatus,
  listClonedRepos,
  lookupGithubRepo,
  searchGithubRepos,
  type CloneRepoInput,
  type CloneRepoResult,
  type GithubRepoSummary,
  type GithubSearchResult,
  type GithubStatus
} from "./github.js";
import { parseGithubIntent } from "./github-intent.js";

export class GithubService {
  status(env: NodeJS.ProcessEnv = process.env): GithubStatus {
    return getGithubStatus(env);
  }

  search(
    query: string,
    options?: { perPage?: number; signal?: AbortSignal; env?: NodeJS.ProcessEnv }
  ): Promise<GithubSearchResult> {
    return searchGithubRepos(query, options);
  }

  lookup(
    fullName: string,
    options?: { signal?: AbortSignal; env?: NodeJS.ProcessEnv }
  ): Promise<GithubRepoSummary> {
    return lookupGithubRepo(fullName, options);
  }

  clone(input: CloneRepoInput, options?: { env?: NodeJS.ProcessEnv; timeoutMs?: number }): Promise<CloneRepoResult> {
    return cloneGithubRepo(input, options);
  }

  listCloned(env: NodeJS.ProcessEnv = process.env) {
    return listClonedRepos(env);
  }

  async handleChatIntent(input: string): Promise<string | null> {
    const intent = parseGithubIntent(input);
    if (!intent.action) return null;

    if (intent.action === "search" && intent.query) {
      const result = await this.search(intent.query, { perPage: 5 });
      if (result.items.length === 0) {
        return `No GitHub repos matched “${result.query}”.`;
      }
      const lines = result.items.map(
        (item, index) =>
          `${index + 1}. ${item.fullName} ★${item.stars}` +
          (item.description ? ` — ${item.description.slice(0, 100)}` : "")
      );
      return `GitHub search for “${result.query}” (${result.totalCount} hits):\n${lines.join(
        "\n"
      )}\n\nClone with: clone ${result.items[0].fullName}`;
    }

    if (intent.action === "lookup" && intent.fullName) {
      const repo = await this.lookup(intent.fullName);
      return [
        `${repo.fullName}`,
        repo.description ?? "(no description)",
        `★ ${repo.stars} · forks ${repo.forks} · ${repo.language ?? "n/a"} · default ${repo.defaultBranch}`,
        repo.htmlUrl,
        `Clone with: clone ${repo.fullName}`
      ].join("\n");
    }

    if (intent.action === "clone" && intent.fullName) {
      const cloned = await this.clone({ fullName: intent.fullName });
      return cloned.alreadyExisted
        ? `Already cloned: ${cloned.fullName}\nPath: ${cloned.path}`
        : `Cloned ${cloned.fullName}\nPath: ${cloned.path}`;
    }

    return null;
  }
}
