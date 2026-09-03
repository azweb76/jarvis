import type { MessagePriority, SendMessageOptions } from "./types.js";

export const MAX_MESSAGE_CONTENT_LENGTH = 4_000;
export const MAX_MESSAGE_ID_LENGTH = 64;
export const MAX_MESSAGE_REF_LENGTH = 128;
export const MAX_MESSAGE_TTL_MS = 24 * 60 * 60 * 1000;

const AGENT_ID_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/;
const REF_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;
const PRIORITIES: readonly MessagePriority[] = ["low", "normal", "high"];

export class MessagePolicyError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "MessagePolicyError";
    this.code = code;
  }
}

export interface GuardedAgentMessage {
  fromAgentId: string;
  toAgentId: string;
  content: string;
  options: SendMessageOptions;
}

export const assertValidAgentMessage = (
  fromAgentId: string,
  toAgentId: string,
  content: string,
  knownAgentIds: readonly string[],
  options?: SendMessageOptions
): GuardedAgentMessage => {
  const from = assertAgentId(fromAgentId, "fromAgentId", knownAgentIds);
  const to = assertAgentId(toAgentId, "toAgentId", knownAgentIds);
  const sanitized = sanitizeContent(content);
  const guardedOptions = assertOptions(options);

  return {
    fromAgentId: from,
    toAgentId: to,
    content: sanitized,
    options: guardedOptions
  };
};

const assertAgentId = (
  value: string,
  field: "fromAgentId" | "toAgentId",
  knownAgentIds: readonly string[]
): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new MessagePolicyError("missing_agent", `${field} is required`);
  }
  if (trimmed.length > MAX_MESSAGE_ID_LENGTH || !AGENT_ID_PATTERN.test(trimmed)) {
    throw new MessagePolicyError("invalid_agent", `${field} has an invalid format`);
  }
  if (!knownAgentIds.includes(trimmed)) {
    throw new MessagePolicyError("unknown_agent", `Unknown agent: ${trimmed}`);
  }
  return trimmed;
};

const sanitizeContent = (content: string): string => {
  if (typeof content !== "string") {
    throw new MessagePolicyError("invalid_content", "content must be a string");
  }
  const sanitized = content.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
  if (!sanitized) {
    throw new MessagePolicyError("empty_content", "content is required");
  }
  if (sanitized.length > MAX_MESSAGE_CONTENT_LENGTH) {
    throw new MessagePolicyError(
      "content_too_long",
      `content exceeds ${MAX_MESSAGE_CONTENT_LENGTH} characters`
    );
  }
  return sanitized;
};

const assertOptions = (options?: SendMessageOptions): SendMessageOptions => {
  if (!options) {
    return {};
  }

  const priority = options.priority;
  if (priority !== undefined && !PRIORITIES.includes(priority)) {
    throw new MessagePolicyError("invalid_priority", "priority must be low, normal, or high");
  }

  const ttlMs = options.ttlMs;
  if (ttlMs !== undefined) {
    if (!Number.isFinite(ttlMs) || ttlMs <= 0 || ttlMs > MAX_MESSAGE_TTL_MS) {
      throw new MessagePolicyError("invalid_ttl", "ttlMs must be a positive duration of at most 24 hours");
    }
  }

  return {
    priority,
    correlationId: assertOptionalRef(options.correlationId, "correlationId"),
    taskId: assertOptionalRef(options.taskId, "taskId"),
    ttlMs
  };
};

const assertOptionalRef = (value: string | undefined, field: string): string | undefined => {
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new MessagePolicyError("invalid_ref", `${field} cannot be empty`);
  }
  if (trimmed.length > MAX_MESSAGE_REF_LENGTH || !REF_ID_PATTERN.test(trimmed)) {
    throw new MessagePolicyError("invalid_ref", `${field} has an invalid format`);
  }
  return trimmed;
};
