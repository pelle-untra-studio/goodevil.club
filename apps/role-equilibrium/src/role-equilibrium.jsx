import React, { useState, useMemo, useRef, useCallback } from "react";
// Shared helper, same signature as the simulator template:
//   askClaude(messages, system?) => Promise<string>
// Matches apps/simulator: the client-side helper is local and posts to
// /api/claude, which is where @goodevil/claude (callClaude) runs server-side.
import { askClaude } from "./askClaude";

/*
  ROLE EQUILIBRIUM  ·  a Good Evil Club probe
  ------------------------------------------------------------------
  Job descriptions (befattningsbeskrivning) are not standalone documents.
  Each role sits in tension with the others through shared, adjacent and
  dependent responsibilities. When a new person arrives, that balance
  shifts and several existing descriptions quietly need rewriting.

  Overlaps ("contested" work) are computed locally as you edit.
  Claude adds the judgment layer: dependencies, handoffs, orphaned work,
  and the rewrite of each affected description when a newcomer lands.

  WIRING
  askClaude comes from the shared package and posts to /api/claude, so the
  Anthropic key stays server-side. The helper takes a messages array and
  returns text; askJSON below wraps a single prompt and parses the reply.
  Colors are CSS variables, ready to map onto packages/ui design tokens.
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

// Single-prompt convenience wrapper over the shared messages-array helper.
async function askJSON(prompt, system) {
  return parseJSON(await askClaude([{ role: "user", content: prompt }], system));
}

// --- Seed organisation -----------------------------------------------------
const SEED = [
  { id: "lead", title: "Studio Lead", mission: "Sets creative direction and owns client relationships.", resp: ["Creative direction", "Final design sign-off", "Client relationships", "Hiring"] },
  { id: "design", title: "Designer", mission: "Takes the work from concept to polished interface.", resp: ["UX flows", "Visual systems", "Prototypes", "Final design sign-off"] },
  { id: "eng", title: "Engineer", mission: "Builds and ships the product.", resp: ["Architecture", "Implementation", "Deployment", "Prototypes"] },
  { id: "prod", title: "Producer", mission: "Keeps projects on time, on budget and clear.", resp: ["Timelines", "Budgets", "Client relationships", "Scope"] },
];

const VBW = 820;
const VBH = 560;

function seedPositions(roles) {
  const cx = VBW / 2, cy = VBH / 2 - 10, r = 175;
  const pos = {};
  roles.forEach((role, i) => {
    const a = (i / roles.length) * Math.PI * 2 - Math.PI / 2;
    pos[role.id] = { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
  });
  return pos;
}

const norm = (s) => s.trim().toLowerCase();

// Local, deterministic overlap detection (shared responsibilities = contested)
function computeContested(roles) {
  const edges = [];
  for (let i = 0; i < roles.length; i++) {
    for (let j = i + 1; j < roles.length; j++) {
      const a = roles[i], b = roles[j];
      const shared = a.resp.filter((r) => b.resp.some((x) => norm(x) === norm(r)));
      if (shared.length) edges.push({ from: a.id, to: b.id, type: "contested", label: shared[0], weight: shared.length, shared });
    }
  }
  return edges;
}

export default function RoleEquilibrium() {
  const [roles, setRoles] = useState(SEED);
  const [pos, setPos] = useState(() => seedPositions(SEED));
  const [links, setLinks] = useState([]); // dependency / handoff from Claude
  const [gaps, setGaps] = useState(["QA and testing", "Post-launch maintenance", "Analytics and reporting"]);
  const [selected, setSelected] = useState(null);
  const [mode, setMode] = useState("inspect"); // inspect | newcomer | impact
  const [busy, setBusy] = useState(null); // 'analyze' | 'newcomer'
  const [err, setErr] = useState(null);
  const [report, setReport] = useState(null);
  const [newRole, setNewRole] = useState({ title: "", focus: "" });
  const [respDraft, setRespDraft] = useState("");
  const drag = useRef(null);
  const svgRef = useRef(null);

  const contested = useMemo(() => computeContested(roles), [roles]);
  const allEdges = useMemo(() => [...contested, ...links], [contested, links]);

  const compact = () => roles.map((r) => ({ id: r.id, title: r.title, mission: r.mission, responsibilities: r.resp }));

  // --- drag ----------------------------------------------------------------
  const toSvg = (e) => {
    const rect = svgRef.current.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * VBW,
      y: ((e.clientY - rect.top) / rect.height) * VBH,
    };
  };
  const onPointerMove = (e) => {
    if (!drag.current) return;
    const p = toSvg(e);
    const id = drag.current;
    setPos((prev) => ({ ...prev, [id]: { x: Math.max(85, Math.min(VBW - 85, p.x)), y: Math.max(45, Math.min(VBH - 45, p.y)) } }));
  };
  const startDrag = (id) => (e) => { e.stopPropagation(); drag.current = id; };
  const endDrag = () => { drag.current = null; };

  // --- Claude: enrich relationships ---------------------------------------
  const analyze = useCallback(async () => {
    setBusy("analyze"); setErr(null);
    try {
      const sys = "You are an organisation design assistant. Reply with ONLY valid JSON, no prose, no markdown fences.";
      const prompt =
        `Roles:\n${JSON.stringify(compact())}\n\n` +
        `Identify dependencies and handoffs between roles (NOT duplicate ownership, that is handled elsewhere), ` +
        `and responsibilities no role currently owns.\n` +
        `Return JSON exactly: {"links":[{"from":"id","to":"id","type":"dependency"|"handoff","label":"short"}],"gaps":["short"]}\n` +
        `Rules: use only the provided ids, max 5 links, max 4 gaps, every string under 9 words.`;
      const out = await askJSON(prompt, sys);
      const valid = (out.links || []).filter((l) => pos[l.from] && pos[l.to] && l.from !== l.to);
      setLinks(valid.map((l) => ({ ...l, weight: 1 })));
      if (Array.isArray(out.gaps) && out.gaps.length) setGaps(out.gaps);
    } catch (e) {
      setErr("Could not refresh the relationship layer. The contested links are still live.");
    } finally { setBusy(null); }
  }, [roles, pos]);

  // --- Claude: newcomer impact --------------------------------------------
  const seeImpact = useCallback(async () => {
    if (!newRole.title.trim()) { setErr("Give the newcomer a title first."); return; }
    setBusy("newcomer"); setErr(null); setReport(null);
    try {
      const sys = "You are an organisation design assistant. You decide how adding a new role reshapes existing job descriptions. Reply with ONLY valid JSON, no prose, no markdown fences.";
      const prompt =
        `Current roles:\n${JSON.stringify(compact())}\n\n` +
        `A new person is joining.\nTitle: ${newRole.title}\nIntended focus: ${newRole.focus || "(not specified)"}\n\n` +
        `Return JSON exactly:\n` +
        `{"newcomerMission":"one sentence","migrations":[{"from":"role id","responsibility":"short","reason":"short"}],` +
        `"newOverlaps":[{"with":"role id","area":"short"}],"gapsFilled":["short"],` +
        `"rewrites":[{"roleId":"role id","newMission":"one sentence","removed":["short"],"added":["short"]}]}\n` +
        `Rules: use only the provided role ids. Keep every string under 12 words. Max 3 items per list. ` +
        `Migrations move responsibilities the newcomer should now own.`;
      const out = await askJSON(prompt, sys);
      setReport(out); setMode("impact");
    } catch (e) {
      setErr("Could not work out the impact. Try a clearer focus for the newcomer.");
    } finally { setBusy(null); }
  }, [newRole, roles]);

  // --- apply the newcomer to the org --------------------------------------
  const applyImpact = () => {
    if (!report) return;
    const id = (newRole.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "role") + "-" + Math.random().toString(36).slice(2, 5);
    const migrated = (report.migrations || []).map((m) => m.responsibility).filter(Boolean);
    const filled = (report.gapsFilled || []);
    const newcomerResp = Array.from(new Set([...migrated, ...filled]));

    let next = roles.map((r) => {
      const rw = (report.rewrites || []).find((x) => x.roleId === r.id);
      const lost = (report.migrations || []).filter((m) => m.from === r.id).map((m) => norm(m.responsibility));
      let resp = r.resp.filter((x) => !lost.includes(norm(x)));
      if (rw) {
        const removed = (rw.removed || []).map(norm);
        resp = resp.filter((x) => !removed.includes(norm(x)));
        (rw.added || []).forEach((a) => { if (!resp.some((x) => norm(x) === norm(a))) resp.push(a); });
      }
      return { ...r, resp, mission: rw ? rw.newMission : r.mission };
    });

    next.push({ id, title: newRole.title, mission: report.newcomerMission || newRole.focus || "New role.", resp: newcomerResp.length ? newcomerResp : ["(define responsibilities)"], isNew: true });

    // remaining gaps after the ones this newcomer filled
    setGaps((g) => g.filter((x) => !filled.some((f) => norm(f) === norm(x))));
    setRoles(next);
    setPos((prev) => {
      const center = { x: VBW / 2, y: VBH / 2 - 10 };
      return { ...prev, [id]: { x: center.x, y: center.y } };
    });
    setSelected(id);
    setReport(null); setMode("inspect"); setNewRole({ title: "", focus: "" }); setLinks([]);
  };

  // --- role editing --------------------------------------------------------
  const updateRole = (id, patch) => setRoles((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const addResp = (id) => {
    const v = respDraft.trim();
    if (!v) return;
    setRoles((rs) => rs.map((r) => (r.id === id && !r.resp.some((x) => norm(x) === norm(v)) ? { ...r, resp: [...r.resp, v] } : r)));
    setRespDraft("");
  };
  const removeResp = (id, r) => setRoles((rs) => rs.map((x) => (x.id === id ? { ...x, resp: x.resp.filter((y) => y !== r) } : x)));
  const reset = () => { setRoles(SEED); setPos(seedPositions(SEED)); setLinks([]); setGaps(["QA and testing", "Post-launch maintenance", "Analytics and reporting"]); setSelected(null); setMode("inspect"); setReport(null); setErr(null); };

  const affectedIds = useMemo(() => {
    if (mode !== "impact" || !report) return new Set();
    const s = new Set();
    (report.migrations || []).forEach((m) => s.add(m.from));
    (report.rewrites || []).forEach((r) => s.add(r.roleId));
    (report.newOverlaps || []).forEach((o) => s.add(o.with));
    return s;
  }, [mode, report]);

  const selectedRole = roles.find((r) => r.id === selected);
  const titleOf = (id) => (roles.find((r) => r.id === id) || {}).title || id;

  // --- edge geometry -------------------------------------------------------
  const edgePath = (e) => {
    const a = pos[e.from], b = pos[e.to];
    if (!a || !b) return null;
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const dx = b.x - a.x, dy = b.y - a.y;
    const off = 26;
    const nx = -dy, ny = dx;
    const len = Math.hypot(nx, ny) || 1;
    const cx = mx + (nx / len) * off, cy = my + (ny / len) * off;
    return { d: `M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`, lx: cx, ly: cy };
  };

  return (
    <div className="re-root" onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerLeave={endDrag}>
      <style>{CSS}</style>

      <header className="re-bar">
        <div className="re-brand">
          <span className="re-kicker">Good Evil Club · probe</span>
          <h1>Role Equilibrium</h1>
          <p>Job descriptions as a system in tension. Edit a role, or add someone new and watch what has to be rewritten.</p>
        </div>
        <div className="re-actions">
          <button className="btn ghost" onClick={reset}>Reset</button>
          <button className="btn" onClick={analyze} disabled={busy === "analyze"}>
            {busy === "analyze" ? "Reading the org…" : "Refresh relationships"}
          </button>
          <button className="btn primary" onClick={() => { setMode("newcomer"); setSelected(null); setErr(null); }}>
            Add someone new
          </button>
        </div>
      </header>

      {err && <div className="re-err">{err}</div>}

      <div className="re-stage">
        <section className="re-canvas-wrap">
          <svg ref={svgRef} viewBox={`0 0 ${VBW} ${VBH}`} className="re-canvas" preserveAspectRatio="xMidYMid meet">
            <defs>
              <pattern id="grid" width="26" height="26" patternUnits="userSpaceOnUse">
                <path d="M 26 0 L 0 0 0 26" fill="none" stroke="var(--grid)" strokeWidth="1" />
              </pattern>
              <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 1 L 9 5 L 0 9" fill="none" stroke="var(--line)" strokeWidth="1.6" />
              </marker>
            </defs>
            <rect x="0" y="0" width={VBW} height={VBH} fill="url(#grid)" />

            {allEdges.map((e, i) => {
              const g = edgePath(e);
              if (!g) return null;
              const isContested = e.type === "contested";
              const stroke = isContested ? "var(--contested)" : "var(--line)";
              return (
                <g key={`e${i}`} className="re-edge">
                  <path d={g.d} fill="none" stroke={stroke}
                    strokeWidth={isContested ? 1.5 + e.weight : 1.4}
                    strokeDasharray={e.type === "dependency" ? "5 5" : "none"}
                    markerEnd={e.type === "handoff" ? "url(#arrow)" : "none"}
                    opacity={isContested ? 0.9 : 0.55} />
                  {e.label && (
                    <g transform={`translate(${g.lx} ${g.ly})`}>
                      <rect x={-(e.label.length * 3.1)} y="-9" width={e.label.length * 6.2} height="16" rx="3"
                        fill="var(--canvas)" stroke={isContested ? "var(--contested)" : "var(--hair)"} strokeWidth="0.8" opacity="0.96" />
                      <text textAnchor="middle" y="3" className="re-edge-label" fill={isContested ? "var(--contested)" : "var(--muted)"}>{e.label}</text>
                    </g>
                  )}
                </g>
              );
            })}

            {roles.map((r) => {
              const p = pos[r.id];
              if (!p) return null;
              const isSel = selected === r.id;
              const isAffected = affectedIds.has(r.id);
              const ring = r.isNew ? "var(--new)" : isAffected ? "var(--contested)" : isSel ? "var(--ink)" : "var(--hair)";
              return (
                <g key={r.id} transform={`translate(${p.x - 78} ${p.y - 33})`}
                  className="re-node" onPointerDown={startDrag(r.id)}
                  onClick={(e) => { e.stopPropagation(); setSelected(r.id); setMode("inspect"); }}>
                  <rect width="156" height="66" rx="9" fill="var(--card)" stroke={ring}
                    strokeWidth={isSel || isAffected || r.isNew ? 2.2 : 1.2} />
                  {r.isNew && <rect x="0" y="0" width="156" height="3.5" rx="2" fill="var(--new)" />}
                  <text x="13" y="25" className="re-node-title">{r.title}</text>
                  <text x="13" y="44" className="re-node-meta">{r.resp.length} responsibilities</text>
                  {r.isNew && <text x="143" y="25" textAnchor="end" className="re-node-new">NEW</text>}
                </g>
              );
            })}
          </svg>

          <div className="re-legend">
            <span><i className="sw contested" /> contested ownership</span>
            <span><i className="sw dep" /> dependency</span>
            <span><i className="sw hand" /> handoff</span>
            <span className="hint">drag to rearrange · click a role to edit</span>
          </div>

          <div className="re-gaps">
            <h4>Nobody owns this</h4>
            {gaps.length === 0 ? <p className="re-empty">No orphaned work right now.</p> : (
              <div className="re-chips">{gaps.map((g, i) => <span key={i} className="chip orphan">{g}</span>)}</div>
            )}
          </div>
        </section>

        <aside className="re-panel">
          {mode === "newcomer" && (
            <div className="re-inner">
              <span className="re-eyebrow">Arrival</span>
              <h2>Who is joining?</h2>
              <label className="re-label">Role title</label>
              <input className="re-input" value={newRole.title} placeholder="e.g. Delivery Manager"
                onChange={(e) => setNewRole((n) => ({ ...n, title: e.target.value }))} />
              <label className="re-label">Intended focus</label>
              <textarea className="re-input" rows={3} value={newRole.focus} placeholder="What is this person meant to own and improve?"
                onChange={(e) => setNewRole((n) => ({ ...n, focus: e.target.value }))} />
              <button className="btn primary wide" onClick={seeImpact} disabled={busy === "newcomer"}>
                {busy === "newcomer" ? "Re-settling the org…" : "See what shifts"}
              </button>
              <button className="btn ghost wide" onClick={() => setMode("inspect")}>Cancel</button>
            </div>
          )}

          {mode === "impact" && report && (
            <div className="re-inner">
              <span className="re-eyebrow">Impact of {newRole.title}</span>
              <h2>What has to move</h2>

              <Block title="Responsibilities to migrate">
                {(report.migrations || []).length === 0 ? <P>Nothing needs to move.</P> :
                  (report.migrations || []).map((m, i) => (
                    <div className="re-item" key={i}>
                      <div className="re-item-top"><strong>{m.responsibility}</strong><span className="re-from">from {titleOf(m.from)}</span></div>
                      <p className="re-reason">{m.reason}</p>
                    </div>
                  ))}
              </Block>

              <Block title="Descriptions to rewrite">
                {(report.rewrites || []).length === 0 ? <P>No existing description changes.</P> :
                  (report.rewrites || []).map((rw, i) => (
                    <div className="re-item" key={i}>
                      <div className="re-item-top"><strong>{titleOf(rw.roleId)}</strong></div>
                      <p className="re-reason">{rw.newMission}</p>
                      {(rw.removed || []).map((x, k) => <span key={"r" + k} className="chip minus">− {x}</span>)}
                      {(rw.added || []).map((x, k) => <span key={"a" + k} className="chip plus">+ {x}</span>)}
                    </div>
                  ))}
              </Block>

              {(report.newOverlaps || []).length > 0 && (
                <Block title="New friction to watch">
                  {(report.newOverlaps || []).map((o, i) => (
                    <p className="re-reason" key={i}><strong>{o.area}</strong> with {titleOf(o.with)}</p>
                  ))}
                </Block>
              )}

              {(report.gapsFilled || []).length > 0 && (
                <Block title="Gaps this fills">
                  {(report.gapsFilled || []).map((g, i) => <span key={i} className="chip plus">{g}</span>)}
                </Block>
              )}

              <button className="btn primary wide" onClick={applyImpact}>Apply to the org</button>
              <button className="btn ghost wide" onClick={() => setMode("newcomer")}>Back</button>
            </div>
          )}

          {mode === "inspect" && selectedRole && (
            <div className="re-inner">
              <span className="re-eyebrow">{selectedRole.isNew ? "New role" : "Description"}</span>
              <input className="re-title-input" value={selectedRole.title}
                onChange={(e) => updateRole(selectedRole.id, { title: e.target.value })} />
              <label className="re-label">Mission</label>
              <textarea className="re-input" rows={3} value={selectedRole.mission}
                onChange={(e) => updateRole(selectedRole.id, { mission: e.target.value })} />
              <label className="re-label">Responsibilities</label>
              <div className="re-resp">
                {selectedRole.resp.map((r) => {
                  const shared = contested.some((c) => (c.from === selectedRole.id || c.to === selectedRole.id) && c.shared.some((s) => norm(s) === norm(r)));
                  return (
                    <span key={r} className={"chip resp" + (shared ? " contested" : "")}>
                      {r}{shared && <em> contested</em>}
                      <button className="x" onClick={() => removeResp(selectedRole.id, r)}>×</button>
                    </span>
                  );
                })}
              </div>
              <div className="re-add">
                <input className="re-input" value={respDraft} placeholder="Add a responsibility"
                  onChange={(e) => setRespDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") addResp(selectedRole.id); }} />
                <button className="btn" onClick={() => addResp(selectedRole.id)}>Add</button>
              </div>
              <p className="re-tip">Responsibilities marked <span className="contested-text">contested</span> are also owned by another role. That is where descriptions blur.</p>
            </div>
          )}

          {mode === "inspect" && !selectedRole && (
            <div className="re-inner re-empty-state">
              <span className="re-eyebrow">How to read this</span>
              <h2>The org is in tension</h2>
              <p>Each card is a job description. Coral threads are <strong>contested</strong> work two people both claim. Dotted lines are dependencies, arrows are handoffs. The amber strip is work <strong>nobody</strong> owns.</p>
              <p>Click any role to edit its description. Use <strong>Add someone new</strong> to see which descriptions a new hire forces you to rewrite.</p>
              <p className="re-tip">Tip: run <strong>Refresh relationships</strong> after editing to let Claude re-read the dependencies and gaps.</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function Block({ title, children }) {
  return (<div className="re-block"><h3>{title}</h3>{children}</div>);
}
function P({ children }) { return <p className="re-reason">{children}</p>; }

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800&family=Inter:wght@400;500;600&family=Space+Mono:wght@400;700&display=swap');
.re-root{
  --bg:#14100E; --panel:#1E1916; --canvas:#F6F1E7; --grid:#E7DECC;
  --card:#FFFFFF; --ink:#23201C; --muted:#8A8175; --line:#3A342E; --hair:#C9BFAD;
  --contested:#D9492B; --orphan:#B57A12; --new:#138C7E;
  --display:'Archivo',system-ui,sans-serif; --ui:'Inter',system-ui,sans-serif; --mono:'Space Mono',ui-monospace,monospace;
  background:var(--bg); color:#F1EAdd; font-family:var(--ui);
  min-height:100%; padding:22px; box-sizing:border-box;
}
.re-root *{box-sizing:border-box;}
.re-bar{display:flex; justify-content:space-between; align-items:flex-end; gap:24px; flex-wrap:wrap; margin-bottom:18px;}
.re-kicker{font-family:var(--mono); font-size:11px; letter-spacing:.18em; text-transform:uppercase; color:var(--orphan);}
.re-brand h1{font-family:var(--display); font-weight:800; font-size:34px; letter-spacing:-.02em; margin:4px 0 6px;}
.re-brand p{margin:0; color:#B3A99a; max-width:48ch; font-size:14px; line-height:1.5;}
.re-actions{display:flex; gap:10px; flex-wrap:wrap;}
.btn{font-family:var(--ui); font-weight:600; font-size:13px; border:1px solid var(--hair); background:transparent; color:#EFE7D8;
  padding:10px 15px; border-radius:8px; cursor:pointer; transition:.15s;}
.btn:hover{border-color:#EFE7D8;}
.btn:disabled{opacity:.5; cursor:default;}
.btn.ghost{border-color:#3a342e; color:#8A8175;}
.btn.primary{background:var(--contested); border-color:var(--contested); color:#fff;}
.btn.primary:hover{filter:brightness(1.08);}
.btn.wide{width:100%; margin-top:8px; padding:12px;}
.re-err{background:#3a201a; border:1px solid var(--contested); color:#f3c9bd; padding:10px 14px; border-radius:8px; font-size:13px; margin-bottom:14px;}
.re-stage{display:grid; grid-template-columns:1fr 360px; gap:18px; align-items:start;}
.re-canvas-wrap{background:var(--canvas); border-radius:14px; padding:14px; border:1px solid #2a2521;}
.re-canvas{width:100%; height:auto; display:block; border-radius:8px; touch-action:none;}
.re-node{cursor:grab;}
.re-node:active{cursor:grabbing;}
.re-node-title{font-family:var(--display); font-weight:700; font-size:15px; fill:var(--ink);}
.re-node-meta{font-family:var(--mono); font-size:10px; fill:var(--muted);}
.re-node-new{font-family:var(--mono); font-size:9px; font-weight:700; fill:var(--new); letter-spacing:.1em;}
.re-edge-label{font-family:var(--mono); font-size:9px;}
.re-legend{display:flex; gap:16px; flex-wrap:wrap; align-items:center; margin-top:12px; font-size:12px; color:var(--ink); font-family:var(--mono);}
.re-legend .sw{display:inline-block; width:16px; height:0; border-top-width:2px; border-top-style:solid; vertical-align:middle; margin-right:5px;}
.re-legend .sw.contested{border-color:var(--contested);}
.re-legend .sw.dep{border-color:var(--line); border-top-style:dashed;}
.re-legend .sw.hand{border-color:var(--line);}
.re-legend .hint{margin-left:auto; color:var(--muted);}
.re-gaps{margin-top:14px; border-top:1px dashed var(--hair); padding-top:12px;}
.re-gaps h4{margin:0 0 8px; font-family:var(--mono); font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:var(--orphan);}
.re-chips{display:flex; gap:8px; flex-wrap:wrap;}
.chip{font-family:var(--mono); font-size:12px; padding:5px 9px; border-radius:6px; display:inline-flex; align-items:center; gap:6px;}
.chip.orphan{background:#f3e6cb; color:var(--orphan); border:1px solid #e3cf9f;}
.re-empty{color:var(--muted); font-size:13px; margin:0;}
.re-panel{background:var(--panel); border:1px solid #2a2521; border-radius:14px; min-height:420px;}
.re-inner{padding:20px;}
.re-eyebrow{font-family:var(--mono); font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:var(--orphan);}
.re-panel h2{font-family:var(--display); font-weight:700; font-size:22px; margin:6px 0 14px; letter-spacing:-.01em;}
.re-label{display:block; font-family:var(--mono); font-size:11px; letter-spacing:.1em; text-transform:uppercase; color:var(--muted); margin:14px 0 6px;}
.re-input,.re-title-input{width:100%; background:#14100E; border:1px solid #3a342e; color:#F1EAdd; border-radius:8px; padding:10px 12px; font-family:var(--ui); font-size:14px; resize:vertical;}
.re-input:focus,.re-title-input:focus{outline:none; border-color:var(--orphan);}
.re-title-input{font-family:var(--display); font-weight:700; font-size:20px; padding:6px 0; background:transparent; border:none; border-bottom:1px solid #3a342e; border-radius:0;}
.re-resp{display:flex; gap:8px; flex-wrap:wrap; margin-bottom:10px;}
.chip.resp{background:#2a2521; color:#E7DEC6; border:1px solid #3a342e;}
.chip.resp.contested{border-color:var(--contested); color:#f2b6a6;}
.chip.resp em{font-style:normal; color:var(--contested); font-size:10px;}
.chip.resp .x{background:none; border:none; color:#8A8175; cursor:pointer; font-size:15px; line-height:1; padding:0;}
.chip.resp .x:hover{color:#fff;}
.re-add{display:flex; gap:8px;}
.re-add .re-input{flex:1;}
.re-add .btn{white-space:nowrap;}
.re-tip{font-size:12.5px; color:var(--muted); line-height:1.5; margin-top:14px;}
.contested-text{color:var(--contested); font-family:var(--mono); font-size:11px;}
.re-empty-state p{color:#B3A99a; font-size:14px; line-height:1.55; margin:0 0 12px;}
.re-empty-state strong{color:#EFE7D8;}
.re-block{border-top:1px solid #2a2521; padding-top:12px; margin-top:14px;}
.re-block:first-of-type{border-top:none; margin-top:4px;}
.re-block h3{font-family:var(--mono); font-size:11px; letter-spacing:.1em; text-transform:uppercase; color:var(--muted); margin:0 0 10px;}
.re-item{margin-bottom:12px;}
.re-item-top{display:flex; justify-content:space-between; align-items:baseline; gap:8px;}
.re-item-top strong{font-family:var(--ui); font-size:14px; color:#F1EAdd;}
.re-from{font-family:var(--mono); font-size:11px; color:var(--muted);}
.re-reason{font-size:13px; color:#B3A99a; line-height:1.5; margin:3px 0 8px;}
.chip.minus{background:#3a201a; color:#f2b6a6; border:1px solid #5a3026; margin:0 6px 6px 0;}
.chip.plus{background:#16302a; color:#7fd6c6; border:1px solid #214d44; margin:0 6px 6px 0;}
@media (max-width:880px){
  .re-stage{grid-template-columns:1fr;}
  .re-panel{min-height:auto;}
  .re-brand h1{font-size:28px;}
}
@media (prefers-reduced-motion:reduce){ .btn{transition:none;} }
`;
