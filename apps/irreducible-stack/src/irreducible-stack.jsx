import React, { useState, useMemo, useRef, useCallback, useLayoutEffect } from "react";
// Shared helper, same signature as the simulator template:
//   askClaude(messages, system?) => Promise<string>
// Matches apps/role-equilibrium: the client-side helper is local and posts to
// /api/claude, which is where @goodevil/claude (callClaude) runs server-side.
import { askClaude } from "./askClaude";

/*
  THE IRREDUCIBLE STACK  ·  a Good Evil Club probe
  ------------------------------------------------------------------
  A stack is not a shopping list, it is a set of roles that must all
  be filled exactly once. You assemble applications; the local engine
  derives the role each one fills, what it depends on, the uncovered
  roles and the overlaps — instantly, deterministically.

  Claude adds the judgment a rule cannot: which load-bearing app you
  truly cannot lose, whether an overlap is real redundancy or healthy
  defence in depth, the hidden risks, and what a specific use case
  (EU public sector, health data…) demands of the whole shape.

  WIRING
  askClaude posts to /api/claude so the Anthropic key stays
  server-side. CAPS, TIERS and LIB are exported so more applications
  can be added without touching the engine.
*/

// --- local helpers ---------------------------------------------------------
// parseJSON is kept local because the shared module only exports askClaude.
function parseJSON(text) {
  const clean = String(text).replace(/```json|```/g, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("no json in response");
  return JSON.parse(clean.slice(start, end + 1));
}

// --- Data ------------------------------------------------------------------
// Roles a digital company cannot reduce away. critical = the company cannot
// run at all without it.
export const CAPS = [
  { id: "orchestrate", label: "Orchestrate", critical: false },
  { id: "comms", label: "Coordinate", critical: false },
  { id: "track", label: "Track work", critical: false },
  { id: "generate", label: "Generate", critical: false },
  { id: "version", label: "Version control", critical: true },
  { id: "host", label: "Host & deploy", critical: true },
  { id: "persist", label: "Persist docs", critical: true },
  { id: "identity", label: "Identity & auth", critical: true },
];

// The four layers of the centerpiece, top to bottom. Each tier groups the
// roles it serves and owns one vivid gradient.
export const TIERS = [
  { id: "orchestrate", label: "Orchestrate", caps: ["orchestrate"], grad: ["#E2553A", "#B5301B"] },
  { id: "coordinate", label: "Coordinate", caps: ["comms", "track"], grad: ["#3E7BD6", "#27509E"] },
  { id: "produce", label: "Produce", caps: ["generate", "version", "host"], grad: ["#2FA86A", "#177A48"] },
  { id: "foundation", label: "Foundation", caps: ["persist", "identity"], grad: ["#9B86C4", "#67519B"] },
];

// Applications: provides = roles it fills, depends = roles it needs present.
export const LIB = [
  { id: "claude", name: "Claude", vendor: "Anthropic", provides: ["orchestrate", "generate"], depends: ["comms", "track", "version"], cost: 100, sov: 35, port: 60, mat: 80, fit: 92 },
  { id: "stilla", name: "Stilla.ai", vendor: "Stilla", provides: ["orchestrate"], depends: ["comms", "track", "version"], cost: 75, sov: 40, port: 45, mat: 35, fit: 80 },
  { id: "slack", name: "Slack", vendor: "Salesforce", provides: ["comms"], depends: [], cost: 40, sov: 30, port: 50, mat: 90, fit: 86 },
  { id: "matter", name: "Mattermost", vendor: "Self-host", provides: ["comms"], depends: [], cost: 15, sov: 90, port: 90, mat: 65, fit: 66 },
  { id: "linear", name: "Linear", vendor: "Linear", provides: ["track"], depends: [], cost: 40, sov: 35, port: 55, mat: 76, fit: 90 },
  { id: "jira", name: "Jira", vendor: "Atlassian", provides: ["track"], depends: [], cost: 35, sov: 35, port: 50, mat: 85, fit: 70 },
  { id: "copilot", name: "Copilot", vendor: "Microsoft", provides: ["generate"], depends: ["version"], cost: 50, sov: 30, port: 50, mat: 80, fit: 80 },
  { id: "localllm", name: "Local model", vendor: "Self-host", provides: ["generate"], depends: [], cost: 30, sov: 95, port: 90, mat: 50, fit: 60 },
  { id: "github", name: "GitHub", vendor: "Microsoft", provides: ["version"], depends: [], cost: 25, sov: 30, port: 55, mat: 90, fit: 90 },
  { id: "gitlab", name: "GitLab", vendor: "GitLab", provides: ["version", "host"], depends: [], cost: 30, sov: 60, port: 80, mat: 80, fit: 76 },
  { id: "vercel", name: "Vercel", vendor: "Vercel", provides: ["host"], depends: ["version"], cost: 40, sov: 35, port: 55, mat: 85, fit: 90 },
  { id: "hetzner", name: "Hetzner", vendor: "Self-host", provides: ["host"], depends: ["version"], cost: 25, sov: 92, port: 90, mat: 60, fit: 64 },
  { id: "gdrive", name: "Google Drive", vendor: "Google", provides: ["persist"], depends: [], cost: 35, sov: 25, port: 45, mat: 90, fit: 86 },
  { id: "nextcl", name: "Nextcloud", vendor: "Self-host", provides: ["persist"], depends: ["identity"], cost: 15, sov: 92, port: 90, mat: 65, fit: 66 },
  { id: "gauth", name: "Google Auth", vendor: "Google", provides: ["identity"], depends: [], cost: 0, sov: 25, port: 40, mat: 90, fit: 86 },
  { id: "keycloak", name: "Keycloak", vendor: "Self-host", provides: ["identity"], depends: [], cost: 10, sov: 92, port: 92, mat: 70, fit: 66 },
];

const USE_CASES = ["General", "EU public sector", "Health data", "Consumer app", "Regulated finance"];

const mod = (id) => LIB.find((m) => m.id === id);
const capLabel = (id) => (CAPS.find((c) => c.id === id) || {}).label || id;
const isCritical = (id) => !!(CAPS.find((c) => c.id === id) || {}).critical;
const tierOfCap = (capId) => TIERS.find((t) => t.caps.includes(capId));
const colorOfCap = (capId) => tierOfCap(capId).grad[0];
// Resolve an id Claude hands back: app name, role label, or the raw id.
const nameOf = (id) => (mod(id) || {}).name || (CAPS.find((c) => c.id === id) || {}).label || id;

export default function IrreducibleStack() {
  const [stack, setStack] = useState([]); // ordered app ids
  const [useCase, setUseCase] = useState("General");
  const [busy, setBusy] = useState(false);
  const [read, setRead] = useState(null); // Claude's parsed judgment
  const [readErr, setReadErr] = useState(null);
  const [arrows, setArrows] = useState([]);
  const stageRef = useRef(null);
  const blockRefs = useRef(new Map()); // "appId@capId" and "ghost@capId" -> element

  // --- local engine, all derived from stack --------------------------------
  const prov = useMemo(() => {
    const map = {};
    CAPS.forEach((c) => (map[c.id] = []));
    stack.forEach((id) => mod(id).provides.forEach((c) => map[c].push(id)));
    return map;
  }, [stack]);

  const statuses = useMemo(() => {
    const out = {};
    stack.forEach((id) => {
      const m = mod(id);
      const missing = m.depends.filter((c) => prov[c].length === 0);
      if (missing.length) {
        out[id] = { pill: "blocked", text: "Blocked: needs " + missing.map(capLabel).join(", ") };
        return;
      }
      const over = m.provides.filter((c) => prov[c].length >= 2);
      if (over.length) {
        const others = over.flatMap((c) => prov[c].filter((x) => x !== id)).map((x) => mod(x).name);
        out[id] = { pill: "overlap", text: "Overlaps " + [...new Set(others)].join(", ") + " on " + over.map(capLabel).join(", ") };
        return;
      }
      const soleCrit = m.provides.filter((c) => prov[c].length === 1 && isCritical(c));
      if (soleCrit.length) {
        out[id] = { pill: "load-bearing", text: "Load-bearing: the only application covering " + soleCrit.map(capLabel).join(", ") };
        return;
      }
      out[id] = { pill: "active", text: "Active, dependencies satisfied" };
    });
    return out;
  }, [stack, prov]);

  const gaps = useMemo(() => CAPS.filter((c) => prov[c.id].length === 0), [prov]);
  const overlapCaps = useMemo(() => CAPS.filter((c) => prov[c.id].length >= 2).map((c) => c.id), [prov]);
  const loadBearingIds = useMemo(
    () => stack.filter((id) => mod(id).provides.some((c) => prov[c].length === 1 && isCritical(c))),
    [stack, prov],
  );

  // sidebar flags, same logic as the prototype
  const flags = useMemo(() => {
    const out = [];
    if (!stack.length) return [["warn", "Empty stack. Every role is uncovered. Start adding applications."]];
    gaps.filter((c) => c.critical).forEach((c) => out.push(["bad", "No application covers " + c.label + ". A digital company cannot run without it."]));
    gaps.filter((c) => !c.critical).forEach((c) => out.push(["warn", c.label + " is uncovered. Not fatal, but the work it does falls to nobody."]));
    stack.forEach((id) => {
      const m = mod(id);
      const missing = m.depends.filter((c) => prov[c].length === 0);
      if (missing.length) out.push(["bad", m.name + " is blocked. It cannot do its job until " + missing.map(capLabel).join(" and ") + " exist in the stack."]);
    });
    CAPS.forEach((c) => {
      if (prov[c.id].length >= 2) {
        const names = prov[c.id].map((x) => mod(x).name).join(" and ");
        out.push(["warn", c.label + ": " + names + " overlap. Two applications filling one role means a contested boundary. Decide which owns it."]);
      }
    });
    const counts = {};
    stack.forEach((id) => { const v = mod(id).vendor; counts[v] = (counts[v] || 0) + 1; });
    let tv = "", tc = 0;
    for (const v in counts) if (counts[v] > tc) { tc = counts[v]; tv = v; }
    if (tc >= 3) out.push(["bad", tv + " now holds " + tc + " roles. One vendor decision can take the whole company down."]);
    if (!out.length) out.push(["good", "Every role filled exactly once, every dependency satisfied, no single vendor dominant. This stack is whole."]);
    return out;
  }, [stack, prov, gaps]);

  const profile = useMemo(() => {
    if (!stack.length) return null;
    const ms = stack.map(mod);
    const total = ms.reduce((s, m) => s + m.cost, 0);
    const avg = (k) => Math.round(ms.reduce((s, m) => s + m[k], 0) / ms.length);
    const afford = Math.round(ms.reduce((s, m) => s + (100 - (Math.min(m.cost, 120) / 120) * 100), 0) / ms.length);
    const counts = {};
    ms.forEach((m) => { counts[m.vendor] = (counts[m.vendor] || 0) + 1; });
    let tc = 0;
    for (const v in counts) if (counts[v] > tc) tc = counts[v];
    const resilience = stack.length <= 1 ? 100 : Math.round(100 * (1 - (tc - 1) / (stack.length - 1)));
    return {
      total, resilience, sov: avg("sov"),
      bars: [["Affordability", afford], ["Sovereignty", avg("sov")], ["Portability", avg("port")], ["Maturity", avg("mat")], ["Fit", avg("fit")], ["Resilience", resilience]],
    };
  }, [stack]);

  // --- dependency arrows ----------------------------------------------------
  // Measured from real DOM positions so they survive wrapping and the
  // single-column mobile layout. Curves anchor on the nearest block edge.
  const measure = useCallback(() => {
    const root = stageRef.current;
    if (!root) return;
    const rrect = root.getBoundingClientRect();
    const box = (key) => {
      const el = blockRefs.current.get(key);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: r.left - rrect.left, top: r.top - rrect.top, w: r.width, h: r.height, cx: r.left - rrect.left + r.width / 2, cy: r.top - rrect.top + r.height / 2 };
    };
    const next = [];
    stack.forEach((id) => {
      const m = mod(id);
      const src = box(id + "@" + m.provides[0]);
      if (!src) return;
      m.depends.forEach((cap, di) => {
        let dst = null, ok = true;
        const providers = prov[cap].filter((x) => x !== id);
        if (prov[cap].length === 0) { dst = box("ghost@" + cap); ok = false; }
        else if (providers.length) dst = box(providers[0] + "@" + cap);
        if (!dst) return;
        // fan multiple departures from one block out so they don't stack
        const fan = (di - (m.depends.length - 1) / 2) * 18;
        const sx = src.cx + fan;
        const dx = dst.cx - sx, dy = dst.cy - src.cy;
        let d;
        if (Math.abs(dy) >= Math.abs(dx)) {
          const y1 = dy > 0 ? src.top + src.h : src.top;
          const y2 = dy > 0 ? dst.top : dst.top + dst.h;
          const my = (y1 + y2) / 2;
          d = `M ${sx} ${y1} C ${sx} ${my}, ${dst.cx} ${my}, ${dst.cx} ${y2}`;
        } else {
          const x1 = dx > 0 ? src.left + src.w : src.left;
          const x2 = dx > 0 ? dst.left : dst.left + dst.w;
          const mx = (x1 + x2) / 2;
          d = `M ${x1} ${src.cy} C ${mx} ${src.cy}, ${mx} ${dst.cy}, ${x2} ${dst.cy}`;
        }
        next.push({ key: id + ">" + cap, d, ok });
      });
    });
    setArrows(next);
  }, [stack, prov]);

  const measureRef = useRef(measure);
  measureRef.current = measure;

  useLayoutEffect(() => { measure(); }, [measure]);
  useLayoutEffect(() => {
    const root = stageRef.current;
    if (!root) return;
    const ro = new ResizeObserver(() => measureRef.current());
    ro.observe(root);
    window.addEventListener("resize", () => measureRef.current());
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => measureRef.current());
    return () => ro.disconnect();
  }, []);

  const setRef = (key) => (el) => {
    if (el) blockRefs.current.set(key, el);
    else blockRefs.current.delete(key);
  };

  // --- actions ---------------------------------------------------------------
  const add = (id) => setStack((s) => (s.includes(id) ? s : [...s, id]));
  const remove = (id) => setStack((s) => s.filter((x) => x !== id));
  const reset = () => { setStack([]); setRead(null); setReadErr(null); };

  // --- Claude: read my stack -------------------------------------------------
  // The local engine ships its own findings so Claude judges, not recomputes.
  const readStack = useCallback(async () => {
    setBusy(true); setReadErr(null);
    try {
      const compact = stack.map((id) => {
        const m = mod(id);
        return { id: m.id, name: m.name, vendor: m.vendor, provides: m.provides, depends: m.depends, cost: m.cost, sov: m.sov, port: m.port, mat: m.mat, fit: m.fit };
      });
      const sys = "You are an organisation and infrastructure design assistant. Reply with ONLY valid JSON, no prose, no markdown fences.";
      const prompt =
        `Roles:\n${JSON.stringify(CAPS)}\n\n` +
        `Assembled stack:\n${JSON.stringify(compact)}\n\n` +
        `Locally computed (judge these, do not recompute):\n` +
        `${JSON.stringify({ uncoveredRoles: gaps.map((c) => c.id), overlappingRoles: overlapCaps, loadBearingCandidates: loadBearingIds })}\n\n` +
        `Use case: ${useCase}\n\n` +
        `Return JSON exactly:\n` +
        `{"loadBearing":{"appId":"id","why":"short"},` +
        `"overlaps":[{"cap":"role id","verdict":"redundant"|"defensible","why":"short"}],` +
        `"hiddenRisks":[{"label":"short","severity":"low"|"medium"|"high","detail":"short"}],` +
        `"useCase":{"summary":"one sentence","changes":[{"target":"app id or role id","recommendation":"short"}]}}\n` +
        `Rules: use only the provided app ids and role ids. Keep every string under 16 words. Max 3 items per list.`;
      const out = parseJSON(await askClaude([{ role: "user", content: prompt }], sys));
      setRead(out);
    } catch (e) {
      setReadErr("Could not read Claude's judgment this time. The local engine below is unaffected.");
    } finally { setBusy(false); }
  }, [stack, gaps, overlapCaps, loadBearingIds, useCase]);

  // --- render ----------------------------------------------------------------
  return (
    <div className="is-root">
      <style>{CSS}</style>

      <header className="is-bar">
        <div className="is-brand">
          <span className="is-kicker">Good Evil Club · probe</span>
          <h1>The Irreducible Stack</h1>
          <p>Start with nothing. Add applications and the probe works out what role each one fills, what it depends on, which roles are still uncovered, and where two applications are quietly doing the same job. A stack is not a shopping list, it is a set of roles that must all be filled exactly once.</p>
        </div>
        <div className="is-actions">
          <button className="btn ghost" onClick={reset} disabled={!stack.length}>Reset</button>
        </div>
      </header>

      <div className="is-grid">
        <main>
          <div className="box">
            <h3>Your stack</h3>
            <div className="stage" ref={stageRef}>
              {TIERS.map((tier) => (
                <div className="tier" key={tier.id}>
                  <div className="tier-label" style={{ color: tier.grad[0] }}>{tier.label}</div>
                  <div className="tier-slots">
                    {tier.caps.map((capId) => {
                      const providers = prov[capId];
                      return (
                        <div className="slot" key={capId}>
                          <div className="slot-label">
                            {capLabel(capId)}
                            {isCritical(capId) && <em>core</em>}
                          </div>
                          {providers.length === 0 ? (
                            <div className={"ghost" + (isCritical(capId) ? " crit" : "")} ref={setRef("ghost@" + capId)}>
                              uncovered
                            </div>
                          ) : (
                            providers.map((id) => {
                              const m = mod(id);
                              const st = statuses[id];
                              return (
                                <div
                                  className="block"
                                  key={id}
                                  ref={setRef(id + "@" + capId)}
                                  style={{ background: `linear-gradient(135deg, ${tier.grad[0]}, ${tier.grad[1]})` }}
                                  title={st.text}
                                >
                                  <div className="blk-top">
                                    <span className="blk-nm">{m.name}</span>
                                    <span className={"pill " + st.pill.replace("-", "")}>{st.pill}</span>
                                    <button className="x" title="remove" onClick={() => remove(id)}>×</button>
                                  </div>
                                  <div className="blk-vn">{m.vendor}</div>
                                  <div className="blk-meta">
                                    {m.provides.length > 1 && <span>fills {m.provides.map(capLabel).join(" + ")}</span>}
                                    {m.depends.length > 0 && <span>needs {m.depends.map(capLabel).join(", ")}</span>}
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              <svg className="overlay" aria-hidden="true">
                <defs>
                  <marker id="ah-ok" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 1 L 8 5 L 0 9" fill="none" stroke="#3FB6A8" strokeWidth="1.8" />
                  </marker>
                  <marker id="ah-bad" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 1 L 8 5 L 0 9" fill="none" stroke="#E2553A" strokeWidth="1.8" />
                  </marker>
                </defs>
                {arrows.map((a) => (
                  <path
                    key={a.key}
                    d={a.d}
                    fill="none"
                    stroke={a.ok ? "#3FB6A8" : "#E2553A"}
                    strokeWidth="1.6"
                    strokeDasharray={a.ok ? "none" : "5 5"}
                    opacity={a.ok ? 0.8 : 0.9}
                    markerEnd={a.ok ? "url(#ah-ok)" : "url(#ah-bad)"}
                  />
                ))}
              </svg>
            </div>
            <div className="legend">
              <span><i className="sw ok" /> dependency satisfied</span>
              <span><i className="sw bad" /> depends on an uncovered role</span>
            </div>
          </div>

          <div className="box">
            <h3>Add an application</h3>
            {CAPS.map((cap) => {
              const tools = LIB.filter((m) => m.provides[0] === cap.id);
              if (!tools.length) return null;
              return (
                <div className="palette-group" key={cap.id}>
                  <p className="pg-label" style={{ color: colorOfCap(cap.id) }}>{cap.label}</p>
                  <div className="pg-tools">
                    {tools.map((t) => (
                      <button className="add" key={t.id} disabled={stack.includes(t.id)} onClick={() => add(t.id)}>
                        {t.name}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </main>

        <aside className="side">
          <div className="box">
            <h3>Use case</h3>
            <select className="uc" value={useCase} onChange={(e) => setUseCase(e.target.value)}>
              {USE_CASES.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
            <button className="btn primary wide" onClick={readStack} disabled={busy || !stack.length}>
              {busy ? "Reading the stack…" : "Read my stack"}
            </button>
            {!stack.length && <p className="hint">Add at least one application first.</p>}
            {readErr && <p className="soft-err">{readErr}</p>}
          </div>

          {read && (
            <div className="box claude-read">
              <h3>Claude's read</h3>
              {read.loadBearing && read.loadBearing.appId && (
                <div className="cr-block">
                  <p className="cr-label">The one you cannot lose</p>
                  <p className="cr-main"><strong>{nameOf(read.loadBearing.appId)}</strong></p>
                  <p className="cr-why">{read.loadBearing.why}</p>
                </div>
              )}
              {Array.isArray(read.overlaps) && read.overlaps.length > 0 && (
                <div className="cr-block">
                  <p className="cr-label">Overlaps judged</p>
                  {read.overlaps.map((o, i) => (
                    <div className="cr-item" key={i}>
                      <span className={"chip " + (o.verdict === "redundant" ? "red" : "teal")}>{o.verdict}</span>
                      <strong>{nameOf(o.cap)}</strong>
                      <p className="cr-why">{o.why}</p>
                    </div>
                  ))}
                </div>
              )}
              {Array.isArray(read.hiddenRisks) && read.hiddenRisks.length > 0 && (
                <div className="cr-block">
                  <p className="cr-label">Hidden risks</p>
                  {read.hiddenRisks.map((r, i) => (
                    <div className="cr-item" key={i}>
                      <span className={"chip sev-" + (r.severity || "low")}>{r.severity}</span>
                      <strong>{r.label}</strong>
                      <p className="cr-why">{r.detail}</p>
                    </div>
                  ))}
                </div>
              )}
              {read.useCase && (
                <div className="cr-block">
                  <p className="cr-label">For {useCase}</p>
                  <p className="cr-why">{read.useCase.summary}</p>
                  {(read.useCase.changes || []).map((c, i) => (
                    <p className="cr-change" key={i}><strong>{nameOf(c.target)}</strong> — {c.recommendation}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="box">
            <h3>Roles in the stack</h3>
            <div className="cov">
              {CAPS.map((c) => {
                const list = prov[c.id];
                let color = "#5a554e", fill = "uncovered";
                if (list.length === 1) { color = colorOfCap(c.id); fill = mod(list[0]).name; }
                else if (list.length >= 2) { color = "#E8B83A"; fill = list.map((x) => mod(x).name).join(" / ") + " (overlap)"; }
                else { color = c.critical ? "#E2553A" : "#7a6f3a"; }
                return (
                  <div className="cap" key={c.id}>
                    <span className="d" style={{ background: color }} />
                    <span className="cl">{c.label}{c.critical && <span className="crit">CORE</span>}</span>
                    <span className="fill">{fill}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="box">
            <h3>What the stack tells us</h3>
            <div className="logic">
              {flags.map(([cls, text], i) => <div className={"lg " + cls} key={i}>{text}</div>)}
            </div>
          </div>

          <div className="box">
            <h3>Aspect profile</h3>
            {!profile ? (
              <p className="hint" style={{ margin: 0 }}>Add applications to see cost, sovereignty and resilience.</p>
            ) : (
              <>
                <div className="totals">
                  <div className="tot"><div className="n">${profile.total}</div><div className="l">per month</div></div>
                  <div className="tot"><div className="n">{profile.resilience}</div><div className="l">resilience</div></div>
                  <div className="tot"><div className="n">{profile.sov}</div><div className="l">sovereignty</div></div>
                </div>
                <div className="bars">
                  {profile.bars.map(([l, v]) => (
                    <div className="bar" key={l}>
                      <span className="bl">{l}</span>
                      <span className="track"><span className="f" style={{ width: v + "%", background: v >= 70 ? "#3FB6A8" : v >= 45 ? "#E8B83A" : "#E2553A" }} /></span>
                      <span className="bv">{v}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
            <p className="note">The structure above is local and instant. <strong>Read my stack</strong> adds Claude's judgment: whether an overlap is real redundancy or healthy defence in depth, which load-bearing application is the one you truly cannot lose, and what your use case demands of the whole shape.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800&family=Inter:wght@400;500;600&family=Space+Mono:wght@400;700&display=swap');
/* The shared @goodevil/ui tokens hide the native cursor (the homepage draws
   its own custom dot). This probe has no custom cursor, so bring the real
   one back. */
html, body { cursor: auto; }
.is-root{
  --bg:#14100E; --panel:#1E1916; --card:#211C18; --ink:#F1EADD; --muted:#8A8175;
  --hair:#3A342E; --accent:#D9492B; --gold:#B57A12; --alive:#138C7E;
  --gap:#E2553A; --over:#E8B83A; --ok:#3FB6A8;
  --display:'Archivo',system-ui,sans-serif; --ui:'Inter',system-ui,sans-serif; --mono:'Space Mono',ui-monospace,monospace;
  background:var(--bg); color:var(--ink); font-family:var(--ui);
  min-height:100vh; max-width:1180px; margin:0 auto; padding:26px 22px 64px; box-sizing:border-box;
}
.is-root *{box-sizing:border-box;}
.is-bar{display:flex; justify-content:space-between; align-items:flex-end; gap:24px; flex-wrap:wrap; margin-bottom:18px; border-bottom:1px solid var(--hair); padding-bottom:20px;}
.is-kicker{font-family:var(--mono); font-size:11px; letter-spacing:.18em; text-transform:uppercase; color:var(--gold);}
.is-brand h1{font-family:var(--display); font-weight:800; font-size:31px; letter-spacing:-.02em; margin:4px 0 0;}
.is-brand p{color:#B3A99A; font-size:14px; margin:8px 0 0; max-width:72ch; line-height:1.55;}
.is-actions{display:flex; gap:10px;}
.btn{font-family:var(--ui); font-weight:600; font-size:13px; border:1px solid var(--hair); background:transparent; color:#EFE7D8; padding:10px 15px; border-radius:8px; cursor:pointer; transition:.15s;}
.btn:hover{border-color:#EFE7D8;}
.btn:disabled{opacity:.45; cursor:default;}
.btn.ghost{border-color:var(--hair); color:var(--muted);}
.btn.primary{background:var(--accent); border-color:var(--accent); color:#fff;}
.btn.primary:hover:not(:disabled){filter:brightness(1.08);}
.btn.wide{width:100%; margin-top:10px; padding:12px;}
.is-grid{display:grid; grid-template-columns:1fr 366px; gap:22px; align-items:start;}
@media (max-width:920px){ .is-grid{grid-template-columns:1fr;} }

.box{background:var(--panel); border:1px solid #2a2521; border-radius:14px; padding:17px; margin-bottom:18px;}
.box h3{font-family:var(--mono); font-size:11px; letter-spacing:.13em; text-transform:uppercase; color:var(--gold); margin:0 0 13px;}

/* ── the layered stack ── */
.stage{position:relative; display:flex; flex-direction:column; gap:14px;}
.tier{display:grid; grid-template-columns:96px 1fr; gap:12px; align-items:start;}
.tier-label{font-family:var(--mono); font-size:10px; letter-spacing:.14em; text-transform:uppercase; padding-top:22px;}
.tier-slots{display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:10px;}
.slot{display:flex; flex-direction:column; gap:8px; min-width:0;}
.slot-label{font-family:var(--mono); font-size:9.5px; letter-spacing:.1em; text-transform:uppercase; color:var(--muted);}
.slot-label em{font-style:normal; color:var(--gap); font-size:8px; letter-spacing:.1em; margin-left:5px;}
.ghost{border:1.5px dashed var(--hair); border-radius:10px; padding:16px 12px; text-align:center; font-family:var(--mono); font-size:10px; letter-spacing:.08em; text-transform:uppercase; color:#5a554e;}
.ghost.crit{border-color:#61342a; color:#a05a44;}
.block{border-radius:10px; padding:10px 12px; color:#FFF8F0; box-shadow:0 2px 10px rgba(0,0,0,.3); position:relative; z-index:1;}
.blk-top{display:flex; align-items:center; gap:5px 7px; min-width:0; flex-wrap:wrap;}
.blk-nm{font-family:var(--display); font-weight:700; font-size:15px;}
.blk-vn{font-size:11px; color:rgba(255,248,240,.75); margin-top:1px;}
.blk-meta{display:flex; flex-direction:column; gap:1px; margin-top:6px; font-family:var(--mono); font-size:9px; letter-spacing:.03em; color:rgba(255,248,240,.8); line-height:1.5;}
.block .x{margin-left:auto; background:none; border:none; color:rgba(255,248,240,.7); font-size:17px; line-height:1; cursor:pointer; padding:0 0 0 4px; flex:none;}
.block .x:hover{color:#fff;}
.pill{font-family:var(--mono); font-size:8.5px; letter-spacing:.06em; text-transform:uppercase; padding:2.5px 6px; border-radius:5px; font-weight:700; flex:none; background:rgba(0,0,0,.34);}
.pill.blocked{color:#FFB59E;}
.pill.overlap{color:#F2D479;}
.pill.loadbearing{color:#FFC9B0;}
.pill.active{color:#9FE8DA;}
.overlay{position:absolute; inset:0; width:100%; height:100%; pointer-events:none; overflow:visible; z-index:2;}
.legend{display:flex; gap:16px; flex-wrap:wrap; margin-top:14px; font-family:var(--mono); font-size:10.5px; color:var(--muted);}
.legend .sw{display:inline-block; width:16px; height:0; border-top:2px solid var(--ok); vertical-align:middle; margin-right:5px;}
.legend .sw.bad{border-top-style:dashed; border-color:var(--gap);}

/* ── palette ── */
.palette-group{margin-bottom:13px;}
.palette-group:last-child{margin-bottom:0;}
.pg-label{font-family:var(--mono); font-size:9.5px; letter-spacing:.12em; text-transform:uppercase; color:var(--muted); margin:0 0 7px;}
.pg-tools{display:flex; flex-wrap:wrap; gap:7px;}
.add{font-family:var(--ui); font-weight:600; font-size:12.5px; border:1px solid var(--hair); background:#14100E; color:#cabfae; padding:7px 11px; border-radius:8px; cursor:pointer; transition:.13s;}
.add:hover:not(:disabled){border-color:var(--ink); color:var(--ink);}
.add:disabled{opacity:.32; cursor:default;}

/* ── sidebar ── */
.side{position:sticky; top:18px;}
@media (max-width:920px){ .side{position:static;} }
.uc{width:100%; background:#14100E; border:1px solid var(--hair); color:var(--ink); border-radius:8px; padding:10px 12px; font-family:var(--ui); font-size:13.5px; appearance:auto;}
.uc:focus{outline:none; border-color:var(--gold);}
.hint{font-size:12px; color:var(--muted); margin:9px 0 0; line-height:1.5;}
.soft-err{font-size:12.5px; color:#e6a48f; background:#3a201a; border:1px solid #5a3026; border-radius:8px; padding:9px 11px; margin:10px 0 0; line-height:1.45;}

.claude-read .cr-block{border-top:1px solid #2a2521; padding-top:11px; margin-top:12px;}
.claude-read .cr-block:first-of-type{border-top:none; margin-top:0; padding-top:0;}
.cr-label{font-family:var(--mono); font-size:9.5px; letter-spacing:.11em; text-transform:uppercase; color:var(--muted); margin:0 0 7px;}
.cr-main{margin:0; font-family:var(--display); font-size:16px;}
.cr-why{font-size:12.5px; color:#B3A99A; line-height:1.5; margin:4px 0 0;}
.cr-item{margin-bottom:9px;}
.cr-item strong{font-size:13px; margin-left:2px;}
.cr-change{font-size:12.5px; color:#B3A99A; line-height:1.5; margin:7px 0 0;}
.cr-change strong{color:var(--ink);}
.chip{font-family:var(--mono); font-size:9px; letter-spacing:.06em; text-transform:uppercase; padding:3px 7px; border-radius:5px; font-weight:700; margin-right:6px;}
.chip.red{background:#3a201a; color:#f0a98f; border:1px solid #5a3026;}
.chip.teal{background:#16302a; color:#7fd6c6; border:1px solid #214d44;}
.chip.sev-low{background:#16302a; color:#7fd6c6; border:1px solid #214d44;}
.chip.sev-medium{background:#332a10; color:#e8c463; border:1px solid #5c4a22;}
.chip.sev-high{background:#3a201a; color:#f0a98f; border:1px solid #5a3026;}

.cov{display:flex; flex-direction:column; gap:8px;}
.cap{display:flex; align-items:center; gap:10px;}
.cap .d{width:9px; height:9px; border-radius:50%; flex:none;}
.cap .cl{font-size:13px; flex:none; width:118px;}
.cap .crit{font-family:var(--mono); font-size:8px; letter-spacing:.1em; color:var(--gap); margin-left:4px;}
.cap .fill{font-family:var(--mono); font-size:11px; color:#a99f90;}

.logic{display:flex; flex-direction:column; gap:8px;}
.lg{font-size:12.5px; line-height:1.45; border-radius:9px; padding:9px 11px; border:1px solid;}
.lg.bad{background:#3a201a; border-color:#5a3026; color:#f0a98f;}
.lg.warn{background:#33260f; border-color:#5c4a22; color:#e6c074;}
.lg.good{background:#16302a; border-color:#214d44; color:#84d8c8;}

.totals{display:flex; gap:9px; margin-bottom:13px;}
.tot{flex:1; background:#14100E; border:1px solid var(--hair); border-radius:10px; padding:9px 10px;}
.tot .n{font-family:var(--display); font-weight:800; font-size:19px; line-height:1;}
.tot .l{font-family:var(--mono); font-size:8.5px; letter-spacing:.07em; text-transform:uppercase; color:var(--muted); margin-top:5px;}
.bars{display:flex; flex-direction:column; gap:7px;}
.bar{display:flex; align-items:center; gap:9px;}
.bar .bl{font-family:var(--mono); font-size:10px; text-transform:uppercase; color:var(--muted); width:82px; flex:none;}
.bar .track{flex:1; height:6px; background:#14100E; border-radius:4px; overflow:hidden;}
.bar .f{display:block; height:100%; border-radius:4px; transition:width .25s;}
.bar .bv{font-family:var(--mono); font-size:11px; color:#cabfae; width:24px; text-align:right;}
.note{font-size:11px; color:var(--muted); line-height:1.5; border-top:1px solid #2a2521; padding-top:11px; margin-top:13px;}
.note strong{color:#cabfae;}

@media (max-width:560px){
  .is-root{padding:20px 14px 56px;}
  .is-brand h1{font-size:26px;}
  .tier{grid-template-columns:1fr; gap:6px;}
  .tier-label{padding-top:0;}
  .tier-slots{grid-template-columns:1fr;}
}
@media (prefers-reduced-motion:reduce){ .btn,.add,.bar .f{transition:none;} }
`;
