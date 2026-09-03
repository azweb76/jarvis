const chatForm = document.querySelector<HTMLFormElement>("#chat-form");
const chatInput = document.querySelector<HTMLInputElement>("#chat-input");
const chatLog = document.querySelector<HTMLDivElement>("#chat-log");
const taskForm = document.querySelector<HTMLFormElement>("#task-form");
const taskOutput = document.querySelector<HTMLPreElement>("#task-output");

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
