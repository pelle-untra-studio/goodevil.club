import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  if (!client) client = new Anthropic({ apiKey });
  return client;
}

export interface ClaudeRequest {
  messages: { role: "user" | "assistant"; content: string }[];
  system?: string;
  model?: string;
  maxTokens?: number;
}

// Default model. Verified current against the Claude docs (Sonnet 4.6).
// Overridable per call via ClaudeRequest.model.
const DEFAULT_MODEL = "claude-sonnet-4-6";

export async function callClaude(req: ClaudeRequest): Promise<{ text: string }> {
  const anthropic = getClient();
  const response = await anthropic.messages.create({
    model: req.model ?? DEFAULT_MODEL,
    max_tokens: req.maxTokens ?? 1024,
    system: req.system,
    messages: req.messages,
  });
  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("\n");
  return { text };
}
