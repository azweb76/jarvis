const chatForm = document.querySelector<HTMLFormElement>("#chat-form");
const chatInput = document.querySelector<HTMLInputElement>("#chat-input");
const chatLog = document.querySelector<HTMLDivElement>("#chat-log");
const taskForm = document.querySelector<HTMLFormElement>("#task-form");
const taskOutput = document.querySelector<HTMLPreElement>("#task-output");
const messagesForm = document.querySelector<HTMLFormElement>("#messages-form");
const messagesOutput = document.querySelector<HTMLPreElement>("#messages-output");
const sendMessageForm = document.querySelector<HTMLFormElement>("#send-message-form");
const sendMessageOutput = document.querySelector<HTMLPreElement>("#send-message-output");

const appendLine = (text: string) => {
  if (!chatLog) return;
  const line = document.createElement("p");
  line.textContent = text;
  chatLog.appendChild(line);
};

chatForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = chatInput?.value.trim() ?? "";
  if (!message) return;
  appendLine(`You: ${message}`);
  if (chatInput) chatInput.value = "";

  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message })
  });
  const data = (await response.json()) as { text?: string; error?: string };
  appendLine(`Jarvis: ${data.text ?? data.error ?? "No response"}`);
});

taskForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const agentId = (document.querySelector<HTMLInputElement>("#agent-id")?.value ?? "").trim();
  const title = (document.querySelector<HTMLInputElement>("#task-title")?.value ?? "").trim();
  const prompt = (document.querySelector<HTMLInputElement>("#task-prompt")?.value ?? "").trim();

  const response = await fetch(`/api/agents/${agentId}/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title, prompt })
  });
  const data = await response.json();
  if (taskOutput) {
    taskOutput.textContent = JSON.stringify(data, null, 2);
  }
});

messagesForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const agentId = (document.querySelector<HTMLInputElement>("#messages-agent-id")?.value ?? "").trim();
  if (!agentId) return;
  const response = await fetch(`/api/agents/${agentId}/messages`);
  const data = await response.json();
  if (messagesOutput) {
    messagesOutput.textContent = JSON.stringify(data, null, 2);
  }
});

sendMessageForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const fromAgentId = (document.querySelector<HTMLInputElement>("#from-agent-id")?.value ?? "").trim();
  const toAgentId = (document.querySelector<HTMLInputElement>("#to-agent-id")?.value ?? "").trim();
  const content = (document.querySelector<HTMLInputElement>("#message-content")?.value ?? "").trim();
  const priority = (document.querySelector<HTMLSelectElement>("#message-priority")?.value ?? "normal") as
    | "low"
    | "normal"
    | "high";
  const correlationId = (
    document.querySelector<HTMLInputElement>("#message-correlation-id")?.value ?? ""
  ).trim();
  const taskId = (document.querySelector<HTMLInputElement>("#message-task-id")?.value ?? "").trim();
  const ttlRaw = (document.querySelector<HTMLInputElement>("#message-ttl-ms")?.value ?? "").trim();
  const ttlMs = ttlRaw ? Number(ttlRaw) : undefined;

  const response = await fetch("/api/agents/messages", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      fromAgentId,
      toAgentId,
      content,
      priority,
      correlationId: correlationId || undefined,
      taskId: taskId || undefined,
      ttlMs
    })
  });
  const data = await response.json();
  if (sendMessageOutput) {
    sendMessageOutput.textContent = JSON.stringify(data, null, 2);
  }
});
