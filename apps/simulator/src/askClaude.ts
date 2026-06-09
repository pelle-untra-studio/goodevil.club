export async function askClaude(
  messages: { role: "user" | "assistant"; content: string }[],
  system?: string,
): Promise<string> {
  const res = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, system }),
  });
  if (!res.ok) throw new Error("Claude request failed");
  const data = await res.json();
  return data.text as string;
}
