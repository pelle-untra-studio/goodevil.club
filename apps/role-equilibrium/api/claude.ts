import type { VercelRequest, VercelResponse } from "@vercel/node";
import { callClaude } from "@goodevil/claude";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const { messages, system, maxTokens } = req.body ?? {};
    if (!Array.isArray(messages)) {
      return res.status(400).json({ error: "messages array required" });
    }
    const { text } = await callClaude({
      messages,
      system,
      maxTokens: typeof maxTokens === "number" ? maxTokens : 2048,
    });
    return res.status(200).json({ text });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Claude request failed" });
  }
}
