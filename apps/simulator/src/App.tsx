import { useState } from "react";
import { askClaude } from "./askClaude";

// Placeholder probe. No simulator logic yet — this only proves the wiring:
// tokens.css is applied (Syne font, dark theme) and the askClaude() ->
// /api/claude -> @goodevil/claude path is in place. Drop real content in here
// to turn this template into an actual probe.
export default function App() {
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleAsk() {
    setLoading(true);
    setError("");
    setReply("");
    try {
      const text = await askClaude([
        {
          role: "user",
          content:
            "In one short sentence, confirm the Good Evil Club wiring works.",
        },
      ]);
      setReply(text);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        cursor: "auto",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "1.5rem",
        padding: "48px 24px",
        textAlign: "center",
      }}
    >
      <p
        style={{
          fontSize: 10,
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          color: "var(--muted)",
        }}
      >
        Good Evil Club · Probe template
      </p>

      <h1 style={{ fontSize: "clamp(32px, 6vw, 56px)", fontWeight: 800 }}>
        Wiring test
      </h1>

      <button
        onClick={handleAsk}
        disabled={loading}
        style={{
          fontFamily: "Syne, sans-serif",
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          padding: "14px 28px",
          borderRadius: 4,
          border: "1px solid var(--fg)",
          background: "var(--fg)",
          color: "var(--bg)",
          cursor: loading ? "default" : "pointer",
          opacity: loading ? 0.6 : 1,
        }}
      >
        {loading ? "Asking Claude…" : "Ask Claude"}
      </button>

      {error && (
        <p style={{ color: "#fb7185", maxWidth: 520 }}>Error: {error}</p>
      )}

      {reply && (
        <pre
          style={{
            fontFamily: "'Syne Mono', monospace",
            fontSize: 14,
            lineHeight: 1.7,
            maxWidth: 560,
            whiteSpace: "pre-wrap",
            color: "var(--fg)",
          }}
        >
          {reply}
        </pre>
      )}

      <p style={{ fontSize: 12, color: "var(--muted)", maxWidth: 560 }}>
        Note: the button calls <code>/api/claude</code>, a Vercel serverless
        function. Plain <code>vite dev</code> serves the client only, so the call
        will fail locally — run <code>vercel dev</code> (with{" "}
        <code>ANTHROPIC_API_KEY</code> set) or deploy to exercise it end to end.
      </p>
    </main>
  );
}
