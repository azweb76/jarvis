import type { AgentContext, AgentDefinition, ClaudeClient } from "./types.js";

const workshopTokens = { maxTokens: 1800 };

export const createCoreAgents = (claude: ClaudeClient): AgentDefinition[] => {
  const greeter: AgentDefinition = {
    id: "greeter",
    role: "Friendly personal assistant and companion",
    goals: [
      "Keep tone warm",
      "Make responses actionable",
      "Remember preferences",
      "Advise on project work across brainstorm, plan, implement, and verify"
    ],
    async respond(input: string, context: AgentContext): Promise<string> {
      await context.sendMessage("greeter", "memory", `User said: ${input}`, {
        priority: "high",
        taskId: "remember-user-input",
        ttlMs: 5 * 60 * 1000
      });
      const name = context.recall("user.name");
      const notes = context.getSkillNotes("greeter");
      const workshop = context.recall("project.latestSummary");
      const github = context.recall("github.latestSummary");
      const systemPrompt =
        "You are Jarvis, a personal assistant friend. Be warm, thoughtful, and concise. " +
        "When the operator is building software, advise them through brainstorm → plan → implement → verify, " +
        "and mention git worktrees when isolated project work is in play. " +
        "They can search/clone GitHub repos via GITHUB_TOKEN (chat: search github for …, clone owner/repo). " +
        "Do not invent file changes that were not made.";
      const userPrompt = `Known user name: ${name ?? "unknown"}\nSkill notes: ${notes.join(
        "; "
      )}\n${github ? `GitHub:\n${github}\n` : ""}${workshop ? `Project workshop:\n${workshop}\n` : ""}User message: ${input}`;
      return claude.complete(systemPrompt, userPrompt);
    }
  };

  const memory: AgentDefinition = {
    id: "memory",
    role: "Long-term memory keeper",
    goals: ["Store user profile and preferences"],
    async respond(input: string, context: AgentContext): Promise<string> {
      const nameMatch = input.match(/my name is ([a-zA-Z]+)/i);
      if (nameMatch) {
        context.remember("user.name", nameMatch[1]);
        return `Stored name: ${nameMatch[1]}`;
      }
      if (/like|prefer/i.test(input)) {
        context.remember("user.preference.latest", input);
        return "Stored latest preference.";
      }
      return "Memory checked.";
    }
  };

  const brainstorm: AgentDefinition = {
    id: "brainstorm",
    role: "Product and engineering sounding board",
    goals: ["Explore options", "Surface risks", "Advise before coding"],
    async respond(input: string, context: AgentContext): Promise<string> {
      await context.sendMessage("brainstorm", "planner", input.slice(0, 500), {
        priority: "high",
        taskId: "brainstorm"
      });
      return claude.complete(
        "You are Jarvis brainstorm. Help the operator think. Give 3-5 options, a recommendation, and risks. Be concrete and concise.",
        `${context.getSkillNotes("brainstorm").join("; ")}\n${input}`,
        workshopTokens
      );
    }
  };

  const planner: AgentDefinition = {
    id: "planner",
    role: "Task planner and delegation lead",
    goals: ["Break requests into tasks", "Assign clear ownership", "Include a verify step"],
    async respond(input: string, context: AgentContext): Promise<string> {
      await context.sendMessage("planner", "implementer", input.slice(0, 500), {
        priority: "high",
        taskId: "plan"
      });
      return claude.complete(
        "You are Jarvis planner. Start with 'Plan draft:'. Produce a numbered plan with owners (brainstorm, implementer, verifier) and a final verify step. Keep it short.",
        `${context.getSkillNotes("planner").join("; ")}\n${input}`,
        workshopTokens
      );
    }
  };

  const implementer: AgentDefinition = {
    id: "implementer",
    role: "Worktree implementer",
    goals: ["Apply focused changes in a git worktree", "Explain what changed"],
    async respond(input: string, context: AgentContext): Promise<string> {
      await context.sendMessage("implementer", "verifier", "Implementation ready for verify", {
        priority: "normal",
        taskId: "implement"
      });
      return claude.complete(
        "You are Jarvis implementer working in an isolated git worktree. " +
          "Reply with JSON only: {\"advice\":\"...\",\"summary\":\"...\",\"commitMessage\":\"feat: ...\",\"files\":[{\"path\":\"relative/path\",\"action\":\"write|delete\",\"content\":\"...\"}]}. " +
          "Use the smallest change that satisfies the plan. Prefer updating existing files. If you cannot safely edit files, return files:[].",
        `${context.getSkillNotes("implementer").join("; ")}\n${input}`,
        { maxTokens: 4000 }
      );
    }
  };

  const verifier: AgentDefinition = {
    id: "verifier",
    role: "Verification and loop advisor",
    goals: ["Interpret test output", "Decide pass/fail", "Recommend looping when needed"],
    async respond(input: string, context: AgentContext): Promise<string> {
      await context.sendMessage("verifier", "planner", input.slice(0, 400), {
        priority: "high",
        taskId: "verify"
      });
      return claude.complete(
        "You are Jarvis verifier. Reply with JSON only: {\"passed\":true|false,\"notes\":\"...\",\"loop\":true|false}. " +
          "passed means checks succeeded. loop means implementer should try again.",
        `${context.getSkillNotes("verifier").join("; ")}\n${input}`,
        workshopTokens
      );
    }
  };

  return [greeter, memory, brainstorm, planner, implementer, verifier];
};
