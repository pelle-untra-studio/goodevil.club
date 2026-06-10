import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
// Shared helper, same signature as the simulator/role-equilibrium template:
//   askClaude(messages, system?) => Promise<string>
// The client-side helper is local and posts to /api/claude, which is where
// @goodevil/claude (callClaude) runs server-side so the Anthropic key stays
// off the client. It returns data.text as a plain string.
import { askClaude } from "./askClaude";

/*
  BLAST RADIUS  ·  a Good Evil Club probe
  ------------------------------------------------------------------
  A process is not a settled document. Each one consumes artifacts from
  upstream and produces artifacts for downstream. Touch one output and
  several other processes quietly need rewriting.

  Two layers, one spine:
    - SYSTEM LAYER (deterministic, instant): each process declares what it
      consumes and produces. Change an output and every consumer lights up.
    - PROCESS LAYER (deterministic, instant): steps are nodes, handoffs are
      edges, sign-off gates sit on edges, each step carries an owner tag.
      Local checks find dead ends, missing gates, missing feedback loops,
      and the bottleneck. Run a unit of work and watch where it stalls.

  Claude is the judgment layer math cannot reach: it reads the NATURE of a
  change, decides whether a downstream process genuinely breaks and how
  badly, and drafts the concrete edit that owner should make.

  Worked ripple shipped here: Onboarding produces "Active employee record".
  Payroll consumes it. Add "Contractor status" to the record and Payroll
  lights up. Claude explains the break and drafts a Payroll edit to accept
  or reject.

  WIRING
  askClaude comes from the shared ./askClaude helper and posts to /api/claude,
  so the Anthropic key stays server-side. The helper takes a messages array
  and returns text; parseJSON below parses the strict-JSON reply. Colors are
  CSS variables, ready to map onto packages/ui design tokens.
*/

function parseJSON(text) {
  const clean = String(text).replace(/```json|```/g, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("no json");
  return JSON.parse(clean.slice(start, end + 1));
}

const norm = (s) => String(s).trim().toLowerCase();

// --- Owner tags ------------------------------------------------------------
const OWNERS = {
  human: { label: "Human", color: "var(--o-human)" },
  ai: { label: "AI", color: "var(--o-ai)" },
  hybrid: { label: "Hybrid", color: "var(--o-hybrid)" },
  check: { label: "Human checks AI", color: "var(--o-check)" },
};

// --- Seed processes --------------------------------------------------------
const ARTIFACT = "Active employee record";
const BASE_FIELDS = ["Legal name", "Start date", "Role", "Manager", "Tax ID"];

function seedOnboarding() {
  return {
    id: "onboarding",
    name: "Onboarding",
    consumes: ["Signed offer letter"],
    produces: { id: "aer", name: ARTIFACT, fields: [...BASE_FIELDS] },
    steps: [
      { id: "s1", label: "Collect personal details", owner: "human", latency: 1, cost: 1 },
      { id: "s2", label: "Verify identity and right to work", owner: "check", latency: 3, cost: 2 },
      { id: "s3", label: "Provision accounts and devices", owner: "ai", latency: 2, cost: 3 },
      { id: "s4", label: "Assign manager and team", owner: "human", latency: 1, cost: 1 },
      { id: "s5", label: "Write active employee record", owner: "hybrid", latency: 1, cost: 1 },
    ],
    edges: [
      { from: "s1", to: "s2" },
      { from: "s2", to: "s3", gate: true },
      { from: "s3", to: "s4" },
      { from: "s4", to: "s5" },
    ],
  };
}

function seedPayroll() {
  return {
    id: "payroll",
    name: "Payroll",
    consumes: [ARTIFACT],
    produces: { id: "pe", name: "Payroll entry", fields: ["Pay schedule", "Withholding", "Bank details"] },
    steps: [
      { id: "p1", label: "Read employee record", owner: "ai", latency: 1, cost: 1 },
      { id: "p2", label: "Set standard tax withholding", owner: "ai", latency: 1, cost: 1 },
      { id: "p3", label: "Schedule first salary payment", owner: "hybrid", latency: 1, cost: 1 },
    ],
    edges: [
      { from: "p1", to: "p2" },
      { from: "p2", to: "p3" },
    ],
    patched: false,
  };
}

const VBW = 760;
const VBH = 300;

// --- Layered layout for a single process flow ------------------------------
function layoutProcess(steps, edges, W = VBW, H = VBH) {
  const ids = steps.map((s) => s.id);
  const out = {};
  ids.forEach((i) => (out[i] = []));
  edges.forEach((e) => { if (out[e.from]) out[e.from].push(e.to); });

  const depth = {};
  ids.forEach((i) => (depth[i] = 0));
  // longest-path relaxation, capped so back edges (loops) cannot run away
  for (let iter = 0; iter < ids.length; iter++) {
    edges.forEach((e) => {
      if (depth[e.to] != null && depth[e.from] != null && depth[e.to] < depth[e.from] + 1) {
        depth[e.to] = Math.min(depth[e.from] + 1, ids.length);
      }
    });
  }
  const maxD = Math.max(0, ...ids.map((i) => depth[i]));
  const groups = {};
  ids.forEach((i) => { (groups[depth[i]] = groups[depth[i]] || []).push(i); });

  // Nodes are 144 wide; guarantee at least 160 of column spacing so they can
  // never overlap. Short chains spread across the base width, long chains
  // grow the viewBox instead (the SVG scales down to fit its container).
  const MARGIN = 84; // half a node + edge padding
  const spacing = maxD > 0 ? Math.max(160, (W - 2 * MARGIN) / maxD) : 0;
  const vbw = maxD > 0 ? Math.max(W, 2 * MARGIN + maxD * spacing) : W;

  const pos = {};
  Object.keys(groups).forEach((d) => {
    const col = groups[d];
    col.forEach((id, k) => {
      const x = maxD > 0 ? MARGIN + Number(d) * spacing : vbw / 2;
      const y = H * ((k + 1) / (col.length + 1));
      pos[id] = { x, y };
    });
  });
  return { pos, depth, vbw };
}

// --- Local diagnostics -----------------------------------------------------
function diagnose(steps, edges) {
  const out = {}, inc = {};
  steps.forEach((s) => { out[s.id] = []; inc[s.id] = []; });
  edges.forEach((e) => { if (out[e.from]) out[e.from].push(e.to); if (inc[e.to]) inc[e.to].push(e.from); });

  const sources = steps.filter((s) => inc[s.id].length === 0).map((s) => s.id);
  const sinks = steps.filter((s) => out[s.id].length === 0).map((s) => s.id);
  const orphans = steps.filter((s) => inc[s.id].length === 0 && out[s.id].length === 0).map((s) => s.id);
  const deadEnds = sinks.filter((id) => !orphans.includes(id));

  // bottleneck = highest latency step
  let bottleneck = null, maxLat = -1;
  steps.forEach((s) => { if ((s.latency || 1) > maxLat) { maxLat = s.latency || 1; bottleneck = s.id; } });

  const totalLatency = steps.reduce((a, s) => a + (s.latency || 1), 0);
  const totalCost = steps.reduce((a, s) => a + (s.cost || 1), 0);

  // any backward edge = feedback / rework loop
  const { depth } = layoutProcess(steps, edges);
  const backEdges = edges.filter((e) => depth[e.to] != null && depth[e.from] != null && depth[e.to] <= depth[e.from]);
  const hasFeedback = backEdges.length > 0;

  return { sources, sinks, orphans, deadEnds, bottleneck, totalLatency, totalCost, hasFeedback };
}

// --- Greedy work-token path -----------------------------------------------
function buildPath(steps, edges) {
  const out = {}, inc = {};
  steps.forEach((s) => { out[s.id] = []; inc[s.id] = []; });
  edges.forEach((e) => { if (out[e.from]) out[e.from].push(e.to); if (inc[e.to]) inc[e.to].push(e.from); });
  const start = (steps.find((s) => inc[s.id].length === 0) || steps[0]);
  if (!start) return { path: [], end: "empty" };
  const path = [start.id];
  const seen = new Set([start.id]);
  let cur = start.id;
  while (out[cur] && out[cur].length) {
    const next = out[cur][0];
    if (seen.has(next)) return { path, end: "loop" };
    path.push(next); seen.add(next); cur = next;
  }
  const last = path[path.length - 1];
  const isTrueSink = out[last] && out[last].length === 0;
  return { path, end: isTrueSink ? "done" : "gap" };
}

export default function BlastRadius() {
  const [onb, setOnb] = useState(seedOnboarding);
  const [pay, setPay] = useState(seedPayroll);
  const [view, setView] = useState("onboarding"); // which process flow is open
  const [selStep, setSelStep] = useState(null);
  const [fieldDraft, setFieldDraft] = useState("");
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(null); // 'impact' | 'diagnose'
  const [diagAI, setDiagAI] = useState(null);
  const [err, setErr] = useState(null);
  const [run, setRun] = useState(null); // work token
  const [toast, setToast] = useState(null);
  const svgRef = useRef(null);

  const proc = view === "onboarding" ? onb : pay;
  const setProc = view === "onboarding" ? setOnb : setPay;

  // local propagation: any field added to Onboarding's output beyond baseline
  const addedFields = useMemo(
    () => onb.produces.fields.filter((f) => !BASE_FIELDS.some((b) => norm(b) === norm(f))),
    [onb.produces.fields]
  );
  const payrollConsumes = pay.consumes.some((c) => norm(c) === norm(onb.produces.name));
  const affected = addedFields.length > 0 && payrollConsumes && !pay.patched;

  const { pos, vbw } = useMemo(() => layoutProcess(proc.steps, proc.edges), [proc]);
  const diag = useMemo(() => diagnose(proc.steps, proc.edges), [proc]);

  // --- work token engine ---------------------------------------------------
  useEffect(() => {
    if (!run || run.done) return;
    const cur = run.path[run.i];
    const isBottleneck = cur === diag.bottleneck;
    const last = run.i >= run.path.length - 1;
    const delay = isBottleneck ? 1500 : 700;
    const t = setTimeout(() => {
      setRun((r) => {
        if (!r) return r;
        if (r.i >= r.path.length - 1) return { ...r, done: true };
        return { ...r, i: r.i + 1 };
      });
    }, delay);
    return () => clearTimeout(t);
  }, [run, diag.bottleneck]);

  const runWork = () => {
    const { path, end } = buildPath(proc.steps, proc.edges);
    if (!path.length) return;
    setRun({ path, i: 0, end, done: false });
  };

  // --- output editing (the headline interaction) ---------------------------
  const addField = (val) => {
    const v = (val || "").trim();
    if (!v) return;
    setOnb((o) =>
      o.produces.fields.some((f) => norm(f) === norm(v))
        ? o
        : { ...o, produces: { ...o.produces, fields: [...o.produces.fields, v] } }
    );
    setPay((p) => ({ ...p, patched: false }));
    setReport(null);
    setFieldDraft("");
  };
  const removeField = (f) => {
    setOnb((o) => ({ ...o, produces: { ...o.produces, fields: o.produces.fields.filter((x) => x !== f) } }));
    setReport(null);
  };

  // --- Claude: cross-process impact ---------------------------------------
  const seeImpact = useCallback(async () => {
    setBusy("impact"); setErr(null); setReport(null);
    try {
      const sys = "You are a process design assistant. Reply with ONLY valid JSON, no prose, no markdown fences.";
      const prompt =
        `Connected company processes. One process changed an output; judge the downstream impact.\n\n` +
        `CHANGED PROCESS "${onb.name}" now produces artifact "${onb.produces.name}".\n` +
        `Newly ADDED fields: ${JSON.stringify(addedFields)}.\n` +
        `All current fields: ${JSON.stringify(onb.produces.fields)}.\n\n` +
        `DOWNSTREAM PROCESS that consumes "${onb.produces.name}":\n` +
        JSON.stringify({ id: pay.id, name: pay.name, consumes: pay.consumes, steps: pay.steps.map((s) => ({ id: s.id, label: s.label, owner: s.owner })) }) +
        `\n\nReturn JSON exactly:\n` +
        `{"affected":[{"processId":"id","reason":"short","severity":"low"|"medium"|"high"}],` +
        `"suggestedEdits":[{"processId":"id","change":"short imperative step to add","why":"short"}]}\n` +
        `Rules: use only processId "payroll". Every string under 16 words. Max 2 items per list. ` +
        `The change must be a concrete process step that resolves the break.`;
      const out = parseJSON(await askClaude([{ role: "user", content: prompt }], sys));
      setReport(out);
    } catch (e) {
      setErr("Could not work out the impact. The local flag on Payroll is still live.");
    } finally { setBusy(null); }
  }, [onb, pay, addedFields]);

  // --- Claude: deeper single-process diagnosis -----------------------------
  const deeperRead = useCallback(async () => {
    setBusy("diagnose"); setErr(null); setDiagAI(null);
    try {
      const sys = "You are a process design assistant. Reply with ONLY valid JSON, no prose, no markdown fences.";
      const prompt =
        `Process to diagnose:\n` +
        JSON.stringify({ name: proc.name, steps: proc.steps.map((s) => ({ id: s.id, label: s.label, owner: s.owner, latency: s.latency })), edges: proc.edges }) +
        `\n\nOwner tags: human, ai, hybrid, check (human checks AI).\n` +
        `Return JSON exactly:\n` +
        `{"diagnosis":[{"stepId":"id","issue":"short","severity":"low"|"medium"|"high"}],` +
        `"missingGate":{"between":"stepId>stepId or empty","risk":"short"},"brokenLoop":false}\n` +
        `Rules: use only provided step ids. Strings under 14 words. Max 3 diagnosis items.`;
      setDiagAI(parseJSON(await askClaude([{ role: "user", content: prompt }], sys)));
    } catch (e) {
      setErr("Could not read the flow. The local diagnostics below are still live.");
    } finally { setBusy(null); }
  }, [proc]);

  // --- accept / reject the suggested edit ----------------------------------
  const acceptEdit = (edit) => {
    setPay((p) => {
      const lastId = p.steps[p.steps.length - 1].id;
      const nid = "p" + (p.steps.length + 1);
      return {
        ...p,
        patched: true,
        steps: [...p.steps, { id: nid, label: edit.change, owner: "check", latency: 1, cost: 1, added: true }],
        edges: [...p.edges, { from: lastId, to: nid }],
      };
    });
    setReport(null);
    setView("payroll");
    setToast("Payroll updated. The ripple is resolved.");
    setTimeout(() => setToast(null), 2600);
  };
  const rejectEdit = () => { setReport(null); setToast("Suggestion dismissed. Payroll still flagged."); setTimeout(() => setToast(null), 2400); };

  const reset = () => {
    setOnb(seedOnboarding()); setPay(seedPayroll()); setView("onboarding");
    setSelStep(null); setReport(null); setDiagAI(null); setErr(null); setRun(null);
  };

  // --- step editing --------------------------------------------------------
  const updateStep = (id, patch) => setProc((p) => ({ ...p, steps: p.steps.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));
  const selectedStep = proc.steps.find((s) => s.id === selStep);

  // Append a step, wired from the current last step, and open it for editing.
  // Ids use the process prefix + (max numeric suffix + 1) so deletions never
  // cause collisions.
  const addStep = () => {
    const prefix = proc.id === "onboarding" ? "s" : "p";
    const maxN = proc.steps.reduce((m, s) => Math.max(m, Number(String(s.id).replace(/\D/g, "")) || 0), 0);
    const nid = prefix + (maxN + 1);
    const lastId = proc.steps.length ? proc.steps[proc.steps.length - 1].id : null;
    setProc((p) => {
      // a burst of clicks can race the re-render; drop adds with a stale id
      if (p.steps.some((s) => s.id === nid)) return p;
      return {
        ...p,
        steps: [...p.steps, { id: nid, label: "New step", owner: "human", latency: 1, cost: 1, added: true }],
        edges: lastId ? [...p.edges, { from: lastId, to: nid }] : p.edges,
      };
    });
    setSelStep(nid);
    setRun(null);
  };

  // Remove a step and splice its predecessors to its successors so the flow
  // stays contiguous instead of breaking into dead ends.
  const removeStep = (id) => {
    setProc((p) => {
      if (p.steps.length <= 1) return p;
      const preds = p.edges.filter((e) => e.to === id).map((e) => e.from);
      const succs = p.edges.filter((e) => e.from === id).map((e) => e.to);
      const kept = p.edges.filter((e) => e.from !== id && e.to !== id);
      const splice = [];
      preds.forEach((a) => succs.forEach((b) => {
        if (a !== b && !kept.some((e) => e.from === a && e.to === b)) splice.push({ from: a, to: b });
      }));
      return { ...p, steps: p.steps.filter((s) => s.id !== id), edges: [...kept, ...splice] };
    });
    setSelStep(null);
    setRun(null);
  };

  // --- edge geometry -------------------------------------------------------
  const edgePath = (e) => {
    const a = pos[e.from], b = pos[e.to];
    if (!a || !b) return null;
    const back = b.x <= a.x;
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2 + (back ? 70 : 0);
    return { d: `M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`, lx: mx, ly: my, back };
  };

  const tokenPos = run ? pos[run.path[run.i]] : null;
  const tokenStalled = run && run.path[run.i] === diag.bottleneck && !run.done;

  return (
    <div className="br-root">
      <style>{CSS}</style>

      <header className="br-bar">
        <div className="br-brand">
          <span className="br-kicker">Good Evil Club · probe</span>
          <h1>Blast Radius</h1>
          <p>Processes are connected by what they produce and consume. Change one output and watch which other processes have to be rewritten.</p>
        </div>
        <div className="br-actions">
          <button className="btn ghost" onClick={reset}>Reset</button>
          <button className="btn" onClick={runWork}>Run a unit of work</button>
        </div>
      </header>

      {err && <div className="br-err">{err}</div>}

      {/* SYSTEM LANE: processes connected by the artifacts that flow between them */}
      <section className="br-system">
        <div className="br-sys-head">
          <span className="br-eyebrow">System layer</span>
          <span className="br-sys-hint">Artifacts flow left to right. A changed payload lights up every consumer.</span>
        </div>
        <div className="br-lane">
          <button
            className={"proc-card" + (view === "onboarding" ? " open" : "")}
            onClick={() => { setView("onboarding"); setSelStep(null); }}
          >
            <span className="proc-name">Onboarding</span>
            <span className="proc-sub">{onb.steps.length} steps · produces ↓</span>
          </button>

          <div className={"wire" + (affected ? " hot" : "")}>
            <div className="artifact-chip">
              <span className="art-name">{onb.produces.name}</span>
              <span className="art-fields">{onb.produces.fields.length} fields</span>
              {addedFields.length > 0 && (
                <span className="art-added">{addedFields.map((f, i) => <em key={i}>+ {f}</em>)}</span>
              )}
            </div>
          </div>

          <button
            className={"proc-card" + (view === "payroll" ? " open" : "") + (affected ? " affected" : "") + (pay.patched ? " patched" : "")}
            onClick={() => { setView("payroll"); setSelStep(null); }}
          >
            <span className="proc-name">Payroll {affected && <i className="dot" />}</span>
            <span className="proc-sub">{pay.consumes[0]} → {pay.steps.length} steps</span>
            {affected && <span className="proc-flag">potentially affected</span>}
            {pay.patched && <span className="proc-ok">resolved</span>}
          </button>
        </div>
      </section>

      <div className="br-stage">
        {/* PROCESS LAYER: the open process as an editable flow */}
        <section className="br-canvas-wrap">
          <div className="br-canvas-head">
            <h3>{proc.name} <span>· process layer</span></h3>
            <div className="br-legend">
              {Object.entries(OWNERS).map(([k, v]) => (
                <span key={k}><i className="sw" style={{ background: v.color }} />{v.label}</span>
              ))}
              <button className="btn small add-step" onClick={addStep}>+ Add step</button>
            </div>
          </div>

          <svg ref={svgRef} viewBox={`0 0 ${vbw} ${VBH}`} className="br-canvas" preserveAspectRatio="xMidYMid meet">
            <defs>
              <pattern id="grid" width="26" height="26" patternUnits="userSpaceOnUse">
                <path d="M 26 0 L 0 0 0 26" fill="none" stroke="var(--grid)" strokeWidth="1" />
              </pattern>
              <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
                <path d="M 0 1 L 9 5 L 0 9" fill="none" stroke="var(--line)" strokeWidth="1.6" />
              </marker>
            </defs>
            <rect x="0" y="0" width={vbw} height={VBH} fill="url(#grid)" />

            {proc.edges.map((e, i) => {
              const g = edgePath(e);
              if (!g) return null;
              return (
                <g key={"e" + i}>
                  <path d={g.d} fill="none" stroke={g.back ? "var(--accent)" : "var(--line)"}
                    strokeWidth="1.5" strokeDasharray={g.back ? "5 5" : "none"} markerEnd="url(#arrow)" opacity="0.7" />
                  {e.gate && (
                    <g transform={`translate(${g.lx} ${g.ly + (g.back ? 0 : 40)})`}>
                      <rect x="-30" y="-9" width="60" height="18" rx="9" fill="var(--canvas)" stroke="var(--gate)" strokeWidth="1.2" />
                      <text textAnchor="middle" y="3.5" className="br-gate-label">sign-off</text>
                    </g>
                  )}
                </g>
              );
            })}

            {proc.steps.map((s) => {
              const p = pos[s.id];
              if (!p) return null;
              const c = `var(--o-${s.owner === "check" ? "check" : s.owner})`;
              const isSel = selStep === s.id;
              const isBottle = s.id === diag.bottleneck && (s.latency || 1) > 1;
              return (
                <g key={s.id} transform={`translate(${p.x - 72} ${p.y - 27})`} className="br-node"
                  onClick={() => setSelStep(s.id)}>
                  <rect width="144" height="54" rx="9" fill="var(--card)"
                    stroke={isSel ? "var(--ink)" : isBottle ? "var(--gate)" : "var(--hair)"} strokeWidth={isSel || isBottle ? 2.2 : 1.2} />
                  <rect x="0" y="0" width="5" height="54" rx="2.5" fill={c} />
                  <text x="14" y="22" className="br-node-title">{s.label.length > 19 ? s.label.slice(0, 18) + "…" : s.label}</text>
                  <text x="14" y="40" className="br-node-meta">{OWNERS[s.owner].label} · {s.latency || 1}d{s.added ? " · new" : ""}</text>
                  {isBottle && <text x="138" y="-8" textAnchor="end" className="br-node-bottle">slow</text>}
                </g>
              );
            })}

            {tokenPos && (
              <g transform={`translate(${tokenPos.x} ${tokenPos.y - 38})`}>
                <circle r="8" fill={tokenStalled ? "var(--gate)" : run.done ? "var(--o-ai)" : "var(--accent)"} className={tokenStalled ? "br-token pulse" : "br-token"} />
                <text textAnchor="middle" y="3.2" className="br-token-x">{run.done ? "✓" : tokenStalled ? "!" : ""}</text>
              </g>
            )}
          </svg>

          {run && (
            <div className="br-runline">
              {run.done
                ? <span>Work item completed the flow. Total path latency {diag.totalLatency} days.</span>
                : tokenStalled
                  ? <span className="warn">Stalled at the bottleneck. This step is {proc.steps.find((s) => s.id === diag.bottleneck)?.latency}× the others.</span>
                  : <span>Work item moving through the flow…</span>}
            </div>
          )}

          {/* local diagnostics, always on */}
          <div className="br-diag">
            <h4>Local read</h4>
            <div className="br-diag-grid">
              <span className="stat"><b>{diag.totalLatency}d</b> path latency</span>
              <span className="stat"><b>{diag.totalCost}</b> cost units</span>
              <span className={"stat" + (diag.hasFeedback ? "" : " bad")}><b>{diag.hasFeedback ? "yes" : "none"}</b> feedback loop</span>
              <span className={"stat" + (diag.deadEnds.length > 1 ? " bad" : "")}><b>{diag.deadEnds.length}</b> end points</span>
            </div>
            {!diag.hasFeedback && <p className="br-flag">No feedback loop: nothing in this process measures or corrects its own output.</p>}
            {diag.orphans.length > 0 && <p className="br-flag">Orphan step with no handoff: {diag.orphans.map((id) => proc.steps.find((s) => s.id === id)?.label).join(", ")}.</p>}
            {diagAI?.diagnosis?.map((d, i) => (
              <p key={i} className="br-flag ai"><b>{proc.steps.find((s) => s.id === d.stepId)?.label || d.stepId}:</b> {d.issue} <em>({d.severity})</em></p>
            ))}
            {diagAI?.missingGate?.between && <p className="br-flag ai">Missing gate {diagAI.missingGate.between}: {diagAI.missingGate.risk}</p>}
            <button className="btn small" onClick={deeperRead} disabled={busy === "diagnose"}>
              {busy === "diagnose" ? "Reading the flow…" : "Claude: deeper read"}
            </button>
          </div>
        </section>

        {/* PANEL */}
        <aside className="br-panel">
          {report ? (
            <div className="br-inner">
              <span className="br-eyebrow">Impact</span>
              <h2>What the change does downstream</h2>
              <Block title="Affected processes">
                {(report.affected || []).length === 0 ? <P>No downstream process breaks.</P> :
                  (report.affected || []).map((a, i) => (
                    <div className="br-item" key={i}>
                      <div className="br-item-top">
                        <strong>{a.processId === "payroll" ? "Payroll" : a.processId}</strong>
                        <span className={"sev sev-" + a.severity}>{a.severity}</span>
                      </div>
                      <p className="br-reason">{a.reason}</p>
                    </div>
                  ))}
              </Block>
              <Block title="Suggested edit">
                {(report.suggestedEdits || []).length === 0 ? <P>Nothing to change.</P> :
                  (report.suggestedEdits || []).map((edit, i) => (
                    <div className="br-item" key={i}>
                      <div className="br-item-top"><strong>{edit.processId === "payroll" ? "Payroll" : edit.processId}</strong></div>
                      <p className="br-edit">+ {edit.change}</p>
                      <p className="br-reason">{edit.why}</p>
                      <div className="br-decide">
                        <button className="btn primary" onClick={() => acceptEdit(edit)}>Accept</button>
                        <button className="btn ghost" onClick={rejectEdit}>Reject</button>
                      </div>
                    </div>
                  ))}
              </Block>
            </div>
          ) : selectedStep ? (
            <div className="br-inner">
              <span className="br-eyebrow">Step</span>
              <input className="br-title-input" value={selectedStep.label}
                onChange={(e) => updateStep(selectedStep.id, { label: e.target.value })} />
              <label className="br-label">Owner</label>
              <div className="br-owners">
                {Object.entries(OWNERS).map(([k, v]) => (
                  <button key={k} className={"owner-pill" + (selectedStep.owner === k ? " on" : "")}
                    style={selectedStep.owner === k ? { borderColor: v.color, color: v.color } : {}}
                    onClick={() => updateStep(selectedStep.id, { owner: k })}>{v.label}</button>
                ))}
              </div>
              <label className="br-label">Latency (days)</label>
              <input type="range" min="1" max="6" value={selectedStep.latency || 1}
                onChange={(e) => updateStep(selectedStep.id, { latency: Number(e.target.value) })} className="br-range" />
              <span className="br-range-val">{selectedStep.latency || 1} days</span>
              <p className="br-tip">Owner tags are one lens. The subject is how this step's output feeds the next, and which downstream processes depend on it.</p>
              <button className="btn ghost wide" onClick={() => setSelStep(null)}>Done</button>
              <button className="btn ghost wide danger" onClick={() => removeStep(selectedStep.id)}
                disabled={proc.steps.length <= 1}>Remove step</button>
            </div>
          ) : (
            <div className="br-inner">
              <span className="br-eyebrow">{onb.produces.name}</span>
              <h2>What Onboarding produces</h2>
              <p className="br-lede">This artifact is the contract with everything downstream. Change its shape and consumers feel it. Payroll reads this record.</p>

              <div className="br-fields">
                {onb.produces.fields.map((f) => {
                  const isNew = addedFields.some((a) => norm(a) === norm(f));
                  return (
                    <span key={f} className={"chip field" + (isNew ? " new" : "")}>
                      {f}
                      <button className="x" onClick={() => removeField(f)}>×</button>
                    </span>
                  );
                })}
              </div>

              <div className="br-add">
                <input className="br-input" value={fieldDraft} placeholder="Add a field to the record"
                  onChange={(e) => setFieldDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") addField(fieldDraft); }} />
                <button className="btn" onClick={() => addField(fieldDraft)}>Add</button>
              </div>

              {!affected && addedFields.length === 0 && (
                <button className="btn demo wide" onClick={() => addField("Contractor status")}>
                  Try it: collect contractor status →
                </button>
              )}

              {affected && (
                <div className="br-ripple">
                  <p className="br-ripple-line">
                    Payroll consumes this record and is now <strong>potentially affected</strong> by {addedFields.map((a) => `"${a}"`).join(", ")}.
                  </p>
                  <button className="btn primary wide" onClick={seeImpact} disabled={busy === "impact"}>
                    {busy === "impact" ? "Judging the break…" : "Ask Claude what breaks"}
                  </button>
                </div>
              )}

              <p className="br-tip">Click any step in the flow to retag its owner or change its latency. The flagging on the right is local and instant; Claude judges whether the break is real and drafts the fix.</p>
            </div>
          )}
        </aside>
      </div>

      {toast && <div className="br-toast">{toast}</div>}
    </div>
  );
}

function Block({ title, children }) { return (<div className="br-block"><h3>{title}</h3>{children}</div>); }
function P({ children }) { return <p className="br-reason">{children}</p>; }

// CSS variables below stay local to this probe (its own warm palette). Where
// @goodevil/ui (packages/ui/src/tokens.css, imported once in main.tsx) defines
// an equivalent, the mapping is: --bg → ui --bg, --ink → ui --fg,
// --muted → ui --muted. The remaining tokens (--canvas, --accent, --gate,
// --o-* owner colors, the type stacks) have no ui equivalent yet. Not
// refactoring styling now — left in place verbatim from the prototype.
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800&family=Inter:wght@400;500;600&family=Space+Mono:wght@400;700&display=swap');
/* The shared @goodevil/ui tokens hide the native cursor (the homepage draws
   its own custom dot). This probe has no custom cursor, so bring the real
   one back — buttons/nodes still get their own pointer cursors below. */
html, body { cursor: auto; }
.br-root{
  --bg:#14100E; --panel:#1E1916; --canvas:#F6F1E7; --grid:#E7DECC;
  --card:#FFFFFF; --ink:#23201C; --muted:#8A8175; --line:#3A342E; --hair:#C9BFAD;
  --accent:#D9492B; --gate:#B57A12; --teal:#138C7E;
  --o-human:#4A453E; --o-ai:#138C7E; --o-hybrid:#B57A12; --o-check:#D9492B;
  --display:'Archivo',system-ui,sans-serif; --ui:'Inter',system-ui,sans-serif; --mono:'Space Mono',ui-monospace,monospace;
  background:var(--bg); color:#F1EAdd; font-family:var(--ui); min-height:100%; padding:22px; box-sizing:border-box;
}
.br-root *{box-sizing:border-box;}
.br-bar{display:flex; justify-content:space-between; align-items:flex-end; gap:24px; flex-wrap:wrap; margin-bottom:16px;}
.br-kicker{font-family:var(--mono); font-size:11px; letter-spacing:.18em; text-transform:uppercase; color:var(--gate);}
.br-brand h1{font-family:var(--display); font-weight:800; font-size:34px; letter-spacing:-.02em; margin:4px 0 6px;}
.br-brand p{margin:0; color:#B3A99a; max-width:54ch; font-size:14px; line-height:1.5;}
.br-actions{display:flex; gap:10px; flex-wrap:wrap;}
.btn{font-family:var(--ui); font-weight:600; font-size:13px; border:1px solid var(--hair); background:transparent; color:#EFE7D8; padding:10px 15px; border-radius:8px; cursor:pointer; transition:.15s;}
.btn:hover{border-color:#EFE7D8;}
.btn:disabled{opacity:.5; cursor:default;}
.btn.ghost{border-color:#3a342e; color:#8A8175;}
.btn.primary{background:var(--accent); border-color:var(--accent); color:#fff;}
.btn.primary:hover{filter:brightness(1.08);}
.btn.demo{border-color:var(--teal); color:#7fd6c6;}
.btn.small{font-size:12px; padding:7px 11px; margin-top:8px;}
.btn.wide{width:100%; margin-top:10px; padding:12px;}
.btn.add-step{margin-top:0; border-color:var(--hair); color:var(--ink);}
.btn.add-step:hover{border-color:var(--ink);}
.btn.danger{border-color:#5a3026; color:#f2b6a6;}
.btn.danger:hover{border-color:var(--accent);}
.br-err{background:#3a201a; border:1px solid var(--accent); color:#f3c9bd; padding:10px 14px; border-radius:8px; font-size:13px; margin-bottom:14px;}

.br-system{background:var(--panel); border:1px solid #2a2521; border-radius:14px; padding:16px 18px; margin-bottom:16px;}
.br-sys-head{display:flex; justify-content:space-between; align-items:baseline; gap:12px; margin-bottom:14px; flex-wrap:wrap;}
.br-eyebrow{font-family:var(--mono); font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:var(--gate);}
.br-sys-hint{font-size:12px; color:var(--muted);}
.br-lane{display:grid; grid-template-columns:1fr 1.4fr 1fr; align-items:center; gap:0;}
.proc-card{text-align:left; background:#14100E; border:1px solid #3a342e; border-radius:10px; padding:14px 16px; cursor:pointer; transition:.15s; display:flex; flex-direction:column; gap:4px; position:relative; color:#F1EAdd;}
.proc-card:hover{border-color:#5a5147;}
.proc-card.open{border-color:var(--hair); box-shadow:0 0 0 1px var(--hair);}
.proc-card.affected{border-color:var(--accent);}
.proc-card.patched{border-color:var(--teal);}
.proc-name{font-family:var(--display); font-weight:700; font-size:17px; display:flex; align-items:center; gap:8px;}
.proc-sub{font-family:var(--mono); font-size:11px; color:var(--muted);}
.proc-flag{font-family:var(--mono); font-size:10px; color:var(--accent); letter-spacing:.06em; text-transform:uppercase; margin-top:4px;}
.proc-ok{font-family:var(--mono); font-size:10px; color:var(--teal); letter-spacing:.06em; text-transform:uppercase; margin-top:4px;}
.dot{width:8px; height:8px; border-radius:50%; background:var(--accent); display:inline-block; animation:blink 1.2s infinite;}
@keyframes blink{0%,100%{opacity:1;}50%{opacity:.3;}}

.wire{position:relative; height:3px; background:repeating-linear-gradient(90deg,#3a342e 0 8px,transparent 8px 14px); margin:0 4px; align-self:center;}
.wire.hot{background:repeating-linear-gradient(90deg,var(--accent) 0 8px,transparent 8px 14px);}
.artifact-chip{position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); background:#1E1916; border:1px solid var(--hair); border-radius:9px; padding:8px 12px; display:flex; flex-direction:column; gap:3px; min-width:160px; align-items:center; text-align:center;}
.wire.hot .artifact-chip{border-color:var(--accent);}
.art-name{font-family:var(--ui); font-weight:600; font-size:12.5px; color:#F1EAdd;}
.art-fields{font-family:var(--mono); font-size:10px; color:var(--muted);}
.art-added{display:flex; flex-direction:column; gap:2px; margin-top:2px;}
.art-added em{font-style:normal; font-family:var(--mono); font-size:10px; color:#f2b6a6; background:#3a201a; border:1px solid #5a3026; border-radius:5px; padding:1px 6px;}

.br-stage{display:grid; grid-template-columns:1fr 360px; gap:16px; align-items:start;}
.br-canvas-wrap{background:var(--canvas); border-radius:14px; padding:14px; border:1px solid #2a2521;}
.br-canvas-head{display:flex; justify-content:space-between; align-items:baseline; gap:12px; margin-bottom:8px; flex-wrap:wrap;}
.br-canvas-head h3{font-family:var(--display); font-weight:700; font-size:16px; color:var(--ink); margin:0;}
.br-canvas-head h3 span{font-family:var(--mono); font-size:11px; font-weight:400; color:var(--muted);}
.br-legend{display:flex; gap:12px; flex-wrap:wrap; font-family:var(--mono); font-size:10px; color:var(--ink);}
.br-legend span{display:inline-flex; align-items:center; gap:5px;}
.br-legend .sw{width:11px; height:11px; border-radius:3px; display:inline-block;}
.br-canvas{width:100%; height:auto; display:block; border-radius:8px;}
.br-node{cursor:pointer;}
.br-node-title{font-family:var(--ui); font-weight:600; font-size:12px; fill:var(--ink);}
.br-node-meta{font-family:var(--mono); font-size:9.5px; fill:var(--muted);}
.br-node-bottle{font-family:var(--mono); font-size:9px; fill:var(--gate); font-weight:700;}
.br-gate-label{font-family:var(--mono); font-size:9px; fill:var(--gate);}
.br-token{filter:drop-shadow(0 1px 3px rgba(0,0,0,.3));}
.br-token.pulse{animation:tok 0.9s infinite;}
@keyframes tok{0%,100%{r:8;}50%{r:11;}}
.br-token-x{font-family:var(--mono); font-size:11px; font-weight:700; fill:#fff;}
.br-runline{margin-top:8px; font-family:var(--mono); font-size:12px; color:var(--ink);}
.br-runline .warn{color:var(--accent); font-weight:700;}

.br-diag{margin-top:14px; border-top:1px dashed var(--hair); padding-top:12px;}
.br-diag h4{margin:0 0 10px; font-family:var(--mono); font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:var(--gate);}
.br-diag-grid{display:flex; gap:10px; flex-wrap:wrap; margin-bottom:8px;}
.stat{font-family:var(--mono); font-size:11px; color:var(--ink); background:#fff; border:1px solid var(--hair); border-radius:7px; padding:6px 10px;}
.stat b{color:var(--ink); font-size:13px; margin-right:3px;}
.stat.bad{border-color:var(--accent); color:var(--accent);} .stat.bad b{color:var(--accent);}
.br-flag{font-size:12.5px; color:#6b6256; line-height:1.5; margin:4px 0; background:#fff; border-left:2px solid var(--gate); padding:6px 10px; border-radius:0 6px 6px 0;}
.br-flag.ai{border-left-color:var(--teal);}
.br-flag b{color:var(--ink);} .br-flag em{color:var(--muted); font-style:normal; font-family:var(--mono); font-size:11px;}

.br-panel{background:var(--panel); border:1px solid #2a2521; border-radius:14px; min-height:440px;}
.br-inner{padding:20px;}
.br-panel h2{font-family:var(--display); font-weight:700; font-size:21px; margin:6px 0 10px; letter-spacing:-.01em;}
.br-lede{color:#B3A99a; font-size:13.5px; line-height:1.55; margin:0 0 14px;}
.br-label{display:block; font-family:var(--mono); font-size:11px; letter-spacing:.1em; text-transform:uppercase; color:var(--muted); margin:14px 0 6px;}
.br-input,.br-title-input{width:100%; background:#14100E; border:1px solid #3a342e; color:#F1EAdd; border-radius:8px; padding:10px 12px; font-family:var(--ui); font-size:14px;}
.br-input:focus,.br-title-input:focus{outline:none; border-color:var(--gate);}
.br-title-input{font-family:var(--display); font-weight:700; font-size:19px; padding:6px 0; background:transparent; border:none; border-bottom:1px solid #3a342e; border-radius:0;}
.br-fields{display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px;}
.chip{font-family:var(--mono); font-size:12px; padding:5px 9px; border-radius:6px; display:inline-flex; align-items:center; gap:6px;}
.chip.field{background:#2a2521; color:#E7DEC6; border:1px solid #3a342e;}
.chip.field.new{border-color:var(--accent); color:#f2b6a6; background:#3a201a;}
.chip .x{background:none; border:none; color:#8A8175; cursor:pointer; font-size:15px; line-height:1; padding:0;}
.chip .x:hover{color:#fff;}
.br-add{display:flex; gap:8px;}
.br-add .br-input{flex:1;}
.br-ripple{margin-top:14px; border-top:1px solid #2a2521; padding-top:14px;}
.br-ripple-line{font-size:13.5px; color:#f3c9bd; line-height:1.5; margin:0;}
.br-ripple-line strong{color:var(--accent);}
.br-tip{font-size:12.5px; color:var(--muted); line-height:1.5; margin-top:14px;}
.br-owners{display:flex; gap:6px; flex-wrap:wrap;}
.owner-pill{font-family:var(--mono); font-size:11px; padding:6px 10px; border-radius:7px; border:1px solid #3a342e; background:transparent; color:#8A8175; cursor:pointer;}
.owner-pill.on{font-weight:700;}
.br-range{width:100%;}
.br-range-val{font-family:var(--mono); font-size:11px; color:var(--muted);}
.br-block{border-top:1px solid #2a2521; padding-top:12px; margin-top:14px;}
.br-block:first-of-type{border-top:none; margin-top:4px;}
.br-block h3{font-family:var(--mono); font-size:11px; letter-spacing:.1em; text-transform:uppercase; color:var(--muted); margin:0 0 10px;}
.br-item{margin-bottom:14px;}
.br-item-top{display:flex; justify-content:space-between; align-items:baseline; gap:8px;}
.br-item-top strong{font-family:var(--ui); font-size:14px; color:#F1EAdd;}
.sev{font-family:var(--mono); font-size:10px; padding:2px 7px; border-radius:5px; text-transform:uppercase; letter-spacing:.05em;}
.sev-high{background:#3a201a; color:#f2b6a6; border:1px solid #5a3026;}
.sev-medium{background:#3a2e16; color:#e6c77f; border:1px solid #5a4a21;}
.sev-low{background:#16302a; color:#7fd6c6; border:1px solid #214d44;}
.br-reason{font-size:13px; color:#B3A99a; line-height:1.5; margin:3px 0 8px;}
.br-edit{font-family:var(--mono); font-size:13px; color:#7fd6c6; background:#16302a; border:1px solid #214d44; border-radius:7px; padding:8px 11px; margin:6px 0;}
.br-decide{display:flex; gap:8px; margin-top:8px;}
.br-decide .btn{flex:1; text-align:center;}
.br-toast{position:fixed; bottom:24px; left:50%; transform:translateX(-50%); background:#1E1916; border:1px solid var(--teal); color:#cfeee7; padding:11px 18px; border-radius:9px; font-size:13px; font-family:var(--ui); box-shadow:0 6px 24px rgba(0,0,0,.4);}
@media (max-width:880px){
  .br-stage{grid-template-columns:1fr;}
  .br-panel{min-height:auto;}
  .br-brand h1{font-size:28px;}
  .br-lane{grid-template-columns:1fr; gap:10px;}
  .wire{height:auto; min-height:60px; background:none; margin:0;}
  .wire::before{content:""; position:absolute; left:50%; top:0; bottom:0; width:3px; transform:translateX(-50%); background:repeating-linear-gradient(180deg,#3a342e 0 8px,transparent 8px 14px);}
  .wire.hot::before{background:repeating-linear-gradient(180deg,var(--accent) 0 8px,transparent 8px 14px);}
  .artifact-chip{position:relative; left:auto; top:auto; transform:none; margin:0 auto;}
}
`;
