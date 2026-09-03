import type { AgentContext, AgentDefinition, ClaudeClient } from "./types.js";

export const createCoreAgents = (claude: ClaudeClient): AgentDefinition[] => {
  const greeter: AgentDefinition = {
    id: "greeter",
    role: "Friendly personal assistant and companion",
    goals: ["Keep tone warm", "Make responses actionable", "Remember preferences"],
    async respond(input: string, context: AgentContext): Promise<string> {
      await context.sendMessage("greeter", "memory", `User said: ${input}`, {
        priority: "high",
        taskId: "remember-user-input",
        ttlMs: 5 * 60 * 1000
      });
      const name = context.recall("user.name");
      const notes = context.getSkillNotes("greeter");
      const systemPrompt =
        "You are Jarvis, a personal assistant friend. Be warm, thoughtful, and concise.";
      const userPrompt = `Known user name: ${name ?? "unknown"}\nSkill notes: ${notes.join(
        "; "
      )}\nUser message: ${input}`;
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

  const planner: AgentDefinition = {
    id: "planner",
    role: "Task planner and delegation lead",
    goals: ["Break requests into tasks", "Assign clear ownership"],
    async respond(input: string, _context: AgentContext): Promise<string> {
      return `Plan draft: 1) understand request 2) split into implementation tasks 3) execute and verify.\nFocus: ${input}`;
    }
  };

  return [greeter, memory, planner];
};
