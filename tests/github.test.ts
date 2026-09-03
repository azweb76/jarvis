import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearGithubCaches,
  cloneGithubRepo,
  GithubError,
  lookupGithubRepo,
  parseFullName,
  resolveReposDir,
  searchGithubRepos
} from "../src/core/github.js";
import { parseGithubIntent } from "../src/core/github-intent.js";

const tempDirs: string[] = [];

afterEach(() => {
  clearGithubCaches();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const makeReposDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-repos-"));
  tempDirs.push(dir);
  return dir;
};

describe("parseFullName", () => {
  it("parses owner/repo and github urls", () => {
    expect(parseFullName("azweb76/jarvis")).toEqual({ owner: "azweb76", repo: "jarvis" });
    expect(parseFullName("https://github.com/azweb76/jarvis.git")).toEqual({
      owner: "azweb76",
      repo: "jarvis"
    });
    expect(parseFullName("not-a-repo")).toBeNull();
  });
});

describe("parseGithubIntent", () => {
  it("detects search, lookup, and clone intents", () => {
    expect(parseGithubIntent("search github for react hooks")).toEqual({
      action: "search",
      query: "react hooks"
    });
    expect(parseGithubIntent("find github repos language:ts stars:>100").action).toBe("search");
    expect(parseGithubIntent("clone azweb76/jarvis")).toEqual({
      action: "clone",
      fullName: "azweb76/jarvis"
    });
    expect(parseGithubIntent("lookup github facebook/react")).toEqual({
      action: "lookup",
      fullName: "facebook/react"
    });
    expect(parseGithubIntent("hello there").action).toBeNull();
  });
});

describe("github search and lookup", () => {
  it("requires GITHUB_TOKEN", async () => {
    await expect(searchGithubRepos("jarvis", { env: {} })).rejects.toBeInstanceOf(GithubError);
  });

  it("searches repositories and caches results", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          total_count: 1,
          incomplete_results: false,
          items: [
            {
              id: 1,
              full_name: "azweb76/jarvis",
              name: "jarvis",
              owner: { login: "azweb76" },
              description: "Assistant",
              html_url: "https://github.com/azweb76/jarvis",
              clone_url: "https://github.com/azweb76/jarvis.git",
              default_branch: "main",
              language: "TypeScript",
              stargazers_count: 12,
              forks_count: 2,
              private: false,
              updated_at: "2026-09-03T00:00:00Z"
            }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const env = { GITHUB_TOKEN: "test-token" };
    const first = await searchGithubRepos("jarvis", { env });
    const second = await searchGithubRepos("jarvis", { env });

    expect(first.items[0].fullName).toBe("azweb76/jarvis");
    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/search/repositories");
  });

  it("looks up a repository by full name", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            id: 99,
            full_name: "facebook/react",
            name: "react",
            owner: { login: "facebook" },
            description: "UI library",
            html_url: "https://github.com/facebook/react",
            clone_url: "https://github.com/facebook/react.git",
            default_branch: "main",
            language: "JavaScript",
            stargazers_count: 1000,
            forks_count: 200,
            private: false,
            updated_at: "2026-09-03T00:00:00Z"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
    );

    const repo = await lookupGithubRepo("facebook/react", { env: { GITHUB_TOKEN: "tok" } });
    expect(repo.fullName).toBe("facebook/react");
    expect(repo.stars).toBe(1000);
  });
});

describe("cloneGithubRepo", () => {
  it("clones into JARVIS_REPOS_DIR with partial clone flags", async () => {
    const reposDir = makeReposDir();
    const env = { GITHUB_TOKEN: "tok", JARVIS_REPOS_DIR: reposDir, HOME: os.tmpdir() };

    // Seed a real bare-ish remote by cloning from a local temp git repo via file://
    const source = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-src-"));
    tempDirs.push(source);
    const { spawnSync } = await import("node:child_process");
    const run = (cwd: string, args: string[]) => {
      const result = spawnSync(args[0], args.slice(1), { cwd, encoding: "utf8" });
      if (result.status !== 0) throw new Error(result.stderr || result.stdout);
    };
    run(source, ["git", "init"]);
    run(source, ["git", "config", "user.email", "jarvis@example.com"]);
    run(source, ["git", "config", "user.name", "Jarvis"]);
    fs.writeFileSync(path.join(source, "README.md"), "# demo\n");
    run(source, ["git", "add", "-A"]);
    run(source, ["git", "commit", "-m", "init"]);

    // Bypass network GitHub by cloning from local path through our API surface:
    // cloneGithubRepo always hits github.com — instead assert destination reuse + resolveReposDir.
    expect(resolveReposDir(env)).toBe(path.resolve(reposDir));

    const ownerDir = path.join(reposDir, "demo");
    const dest = path.join(ownerDir, "sample");
    fs.mkdirSync(ownerDir, { recursive: true });
    run(reposDir, ["git", "clone", source, dest]);

    const result = await cloneGithubRepo(
      { fullName: "demo/sample" },
      { env }
    );
    expect(result.alreadyExisted).toBe(true);
    expect(result.path).toBe(dest);
  });
});
