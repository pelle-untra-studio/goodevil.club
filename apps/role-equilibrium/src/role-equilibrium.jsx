import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
// Client helper, same as the simulator: posts a messages array to /api/claude
// and returns text. The Anthropic key stays server side.
import { askClaude } from "./askClaude";
import { COMPANIES, loadConfig, normRole } from "./config";

/*
  ROLE EQUILIBRIUM  ·  a Good Evil Club probe
  ------------------------------------------------------------------
  Roles are nodes in a living system, not standalone documents. Change
  one role and the connected roles have to move with it. This showcase
  makes that one moment unmissable: change a role, watch the ripple,
  read the drafted notifications each affected person would receive.

  Every organization specific thing lives in a validated config (see
  config.js). This file is the engine: it reads only from a normalized
  config, so a new company is a new config, not new code.
*/

// ---------------------------------------------------------------- helpers ---
function parseJSON(text) {
  const clean = String(text).replace(/```json|```/g, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("no json in response");
  return JSON.parse(clean.slice(start, end + 1));
}

const byId = (roles, id) => roles.find((r) => r.id === id);
const domainColor = (cfg, id) => (cfg._domainById[id] || {}).color || "#8C99A6";
const domainName = (cfg, id) => (cfg._domainById[id] || {}).name || id;
const etype = (cfg, id) =>
  cfg._edgeTypeById[id] || { id, label: id, stroke: "#8C8375", width: 1.5, dash: "none", arrow: false, opacity: 1, legendColor: "#8C8375", legendWidth: 2, conn: id };
const nameOf = (r) => (r.people && r.people.length ? r.people[0] : r.person || "");
const nameLabel = (r) => {
  const p = r.people || (r.person ? [r.person] : []);
  if (!p.length) return "";
  return p.length > 1 ? `${p[0]} +${p.length - 1}` : p[0];
};

// Load every company config once, up front, with plain language errors.
const LOADED = {};
COMPANIES.forEach((raw) => { LOADED[raw.id] = { id: raw.id, name: raw.name, kind: raw.kind, ...loadConfig(raw) }; });
const COMPANY_LIST = COMPANIES.map((raw) => ({ id: raw.id, name: raw.name, kind: raw.kind }));
const FIRST_OK = (COMPANY_LIST.find((c) => LOADED[c.id].ok) || COMPANY_LIST[0]).id;

// apply a scenario to a config's clean base, returning the next roles + edges
function applyScenario(cfg, sc) {
  let roles = cfg.roles.map((r) => ({ ...r, resp: [...r.resp], mandates: [...r.mandates], people: [...(r.people || [])] }));
  let edges = cfg.edges.map((e) => ({ ...e }));

  (sc.newRoles || []).forEach((nr) => {
    const n = normRole(nr);
    roles.push({ ...n, resp: [...n.resp], mandates: [...n.mandates], people: [...n.people] });
  });
  (sc.retire || []).forEach((id) => { const r = roles.find((x) => x.id === id); if (r) r.retired = true; });
  (sc.removeEdges || []).forEach((re) => {
    edges = edges.filter((e) => !(e.from === re.from && e.to === re.to && (!re.type || e.type === re.type)));
  });
  (sc.newEdges || []).forEach((ne) => edges.push({ ...ne }));
  (sc.migrations || []).forEach((m) => {
    const src = roles.find((r) => r.id === m.fromId);
    if (src && Array.isArray(src[m.kind])) src[m.kind] = src[m.kind].filter((x) => x.toLowerCase() !== m.item.toLowerCase());
  });
  return { roles, edges };
}

function fallbackMigrations(sc) {
  return (sc.migrations || []).map((m) => ({ fromId: m.fromId, item: m.item, reason: m.reason || "Reassigned to the new role" }));
}

// --------------------------------------------------------------- AI layer ---
const AI_SYS =
  "You draft internal reorg content for a company operating model tool. Return ONLY valid JSON, no prose, no markdown fences. Never use em dashes. Never use exclamation marks. Write plainly, like a thoughtful manager, direct and specific.";

async function aiNotifications(sc, roles) {
  const people = sc.affected
    .map((a) => byId(roles, a.id))
    .filter(Boolean)
    .filter((r) => !/vacant/i.test(nameOf(r)))
    .map((r) => `- ${r.id} :: ${nameOf(r)} (${r.title}) :: reason: ${(sc.affected.find((a) => a.id === r.id) || {}).reason}`)
    .join("\n");
  const prompt =
    `A change is happening in the org.\n` +
    `Change: ${sc.summary}\n\n` +
    `Write one personalized notification per person below. Speak to them by first name, in second person, and say exactly what changes for them and what stays the same.\n` +
    `People:\n${people}\n\n` +
    `Return JSON: {"notifications":[{"toId":"the id","subject":"under 8 words","body":"2 to 4 sentences"}]}`;
  const out = parseJSON(await askClaude([{ role: "user", content: prompt }], AI_SYS, 1600));
  const list = (out.notifications || []).filter((n) => byId(roles, n.toId) && n.body);
  if (!list.length) throw new Error("empty notifications");
  return list;
}

async function aiAnalyze(roles) {
  const compact = roles.filter((r) => !r.retired).map((r) => ({ id: r.id, title: r.title, responsibilities: r.resp, mandates: r.mandates }));
  const prompt =
    `Roles:\n${JSON.stringify(compact)}\n\n` +
    `Find where two or more roles own the same responsibility or mandate (overlaps), and important work that no role owns (gaps).\n` +
    `Return JSON: {"overlaps":[{"roleIds":["id"],"area":"short","explanation":"one or two sentences"}],"gaps":[{"area":"short","explanation":"one or two sentences"}]}\n` +
    `Return the clearest overlap and the clearest gap. Use only the provided ids.`;
  const out = parseJSON(await askClaude([{ role: "user", content: prompt }], AI_SYS, 1200));
  if (!out.overlaps && !out.gaps) throw new Error("empty analysis");
  return { overlaps: out.overlaps || [], gaps: out.gaps || [] };
}

async function aiRebalance(sc, roles) {
  const compact = roles.filter((r) => !r.isNew && !r.retired).map((r) => ({ id: r.id, title: r.title, responsibilities: r.resp, mandates: r.mandates }));
  const nr = sc.newRoles[0];
  const prompt =
    `Existing roles:\n${JSON.stringify(compact)}\n\n` +
    `A new role is being added: ${nr.title}. Purpose: ${nr.purpose}.\n` +
    `Which responsibilities or mandates should migrate from which existing roles to it. Return JSON: {"migrations":[{"fromId":"id","item":"short","reason":"short under 9 words"}]}. Use only provided ids. Max 3.`;
  const out = parseJSON(await askClaude([{ role: "user", content: prompt }], AI_SYS, 900));
  const list = (out.migrations || []).filter((m) => byId(roles, m.fromId) && m.item);
  if (!list.length) throw new Error("empty rebalance");
  return list;
}

// ============================================================= component ====
export default function RoleEquilibrium() {
  const [companyId, setCompanyId] = useState(FIRST_OK);
  const wrap = LOADED[companyId];
  const cfg = wrap.ok ? wrap.config : null;

  const [started, setStarted] = useState(false);
  const [view, setView] = useState("system"); // system | personal
  const [roles, setRoles] = useState(() => (cfg ? cfg.roles : []));
  const [edges, setEdges] = useState(() => (cfg ? cfg.edges : []));

  const [selected, setSelected] = useState(null);
  const [rightMode, setRightMode] = useState("info");
  const [backboneOnly, setBackboneOnly] = useState(false);

  const [change, setChange] = useState(null);
  const [rippleStep, setRippleStep] = useState(0);
  const [migrations, setMigrations] = useState([]);
  const [notifications, setNotifications] = useState(null);
  const [notifState, setNotifState] = useState("idle");
  const [analysis, setAnalysis] = useState(null);
  const [analysisState, setAnalysisState] = useState("idle");

  const [timeline, setTimeline] = useState(() => (cfg ? cfg.timelineSeed : []));
  const runToken = useRef(0);

  const affectedIndex = useMemo(() => {
    const m = new Map();
    if (change) change.affected.forEach((a, i) => m.set(a.id, { i, reason: a.reason }));
    return m;
  }, [change]);

  const rippleActive = (id) => {
    const a = affectedIndex.get(id);
    return a ? a.i < rippleStep : false;
  };

  useEffect(() => {
    if (!change) return;
    if (rippleStep >= change.affected.length) return;
    const t = setTimeout(() => setRippleStep((s) => s + 1), 460);
    return () => clearTimeout(t);
  }, [change, rippleStep]);

  const clearRun = useCallback(() => {
    setChange(null); setRippleStep(0); setMigrations([]);
    setNotifications(null); setNotifState("idle");
    setSelected(null); setRightMode("info"); setBackboneOnly(false);
  }, []);

  const resetSystem = useCallback(() => {
    if (!cfg) return;
    setRoles(cfg.roles); setEdges(cfg.edges);
    clearRun();
  }, [cfg, clearRun]);

  const selectCompany = useCallback((id) => {
    setCompanyId(id);
    const c = LOADED[id];
    if (c.ok) { setRoles(c.config.roles); setEdges(c.config.edges); setTimeline(c.config.timelineSeed); }
    setView("system");
    clearRun();
  }, [clearRun]);

  const runScenario = useCallback(async (key) => {
    if (!cfg) return;
    const sc = cfg.scenarios.find((s) => s.id === key);
    if (!sc) return;
    const token = ++runToken.current;

    const { roles: nextRoles, edges: nextEdges } = applyScenario(cfg, sc);
    setStarted(true);
    setView("system");
    setSelected(null);
    setRoles(nextRoles);
    setEdges(nextEdges);
    setChange(sc);
    setRightMode("change");
    setRippleStep(0);
    setNotifications(null);
    setNotifState("loading");
    setMigrations(sc.migrations ? fallbackMigrations(sc) : []);

    if (cfg.persona && sc.personalEntry && sc.affected.some((a) => a.id === cfg.persona)) {
      const line = sc.personalEntry;
      setTimeline((t) => [line, ...t.filter((x) => x.title !== line.title)]);
    }

    if (sc.newRoles && sc.newRoles.length && sc.migrations && sc.migrations.length) {
      aiRebalance(sc, nextRoles).then((mg) => { if (runToken.current === token) setMigrations(mg); }).catch(() => {});
    }

    try {
      const list = await aiNotifications(sc, nextRoles);
      if (runToken.current !== token) return;
      setNotifications(list); setNotifState("live");
    } catch {
      if (runToken.current !== token) return;
      setNotifications(sc.fallbackNotifications); setNotifState("fallback");
    }
  }, [cfg]);

  const analyze = useCallback(async () => {
    if (!cfg) return;
    setView("system"); setRightMode("analysis"); setSelected(null);
    setAnalysisState("loading"); setAnalysis(null);
    try {
      const res = await aiAnalyze(roles);
      setAnalysis(res); setAnalysisState("live");
    } catch {
      setAnalysis(cfg.analysisFallback || { overlaps: [], gaps: [] });
      setAnalysisState("fallback");
    }
  }, [cfg, roles]);

  const openRole = (id) => { setSelected(id); setRightMode("role"); };
  const goCompanies = () => { setStarted(false); clearRun(); };

  // ---- invalid config: show the plain language errors ----
  if (!wrap.ok) {
    return (
      <div className="req-root">
        <style>{CSS}</style>
        <ConfigError name={wrap.name} errors={wrap.errors} companies={COMPANY_LIST} onPick={selectCompany} />
      </div>
    );
  }

  const persona = cfg.persona ? byId(roles, cfg.persona) : null;

  if (!started) {
    return (
      <div className="req-root">
        <style>{CSS}</style>
        <Landing
          cfg={cfg} companyId={companyId} companies={COMPANY_LIST}
          onSelectCompany={selectCompany}
          onScenario={(k) => runScenario(k)}
          onExplore={() => { setStarted(true); setView("system"); setRightMode("info"); }}
        />
      </div>
    );
  }

  return (
    <div className="req-root">
      <style>{CSS}</style>

      <header className="req-bar">
        <div className="req-brand">
          <span className="req-kicker">Good Evil Club · {cfg.name}</span>
          <h1>Role Equilibrium</h1>
        </div>

        <div className="req-toggle" role="tablist" aria-label="View">
          <button className={"tg" + (view === "system" ? " on" : "")} onClick={() => setView("system")}>System view</button>
          {persona && <button className={"tg" + (view === "personal" ? " on" : "")} onClick={() => setView("personal")}>My role</button>}
        </div>

        <div className="req-actions">
          <button className="btn ghost" onClick={goCompanies}>Companies</button>
          <button className="btn ghost" onClick={resetSystem}>Reset</button>
          <button className="btn" onClick={analyze}>Analyze system</button>
        </div>
      </header>

      {view === "system" ? (
        <div className="req-stage">
          <section className="req-canvas-wrap">
            <SystemMap cfg={cfg} roles={roles} edges={edges} selected={selected} onSelect={openRole}
              affectedIndex={affectedIndex} rippleActive={rippleActive} backboneOnly={backboneOnly} />
            <Legend cfg={cfg} backboneOnly={backboneOnly} onToggleBackbone={() => setBackboneOnly((v) => !v)} />
            {cfg.scenarios.length > 0 && (
              <div className="req-scenariobar">
                <span className="req-scenariobar-l">Run a change</span>
                {cfg.scenarios.map((s) => (
                  <button key={s.id} className={"chipbtn" + (change && change.id === s.id ? " on" : "")}
                    onClick={() => runScenario(s.id)}>{s.label}</button>
                ))}
              </div>
            )}
          </section>

          <aside className="req-panel">
            {rightMode === "change" && change && (
              <ChangeRail cfg={cfg} change={change} roles={roles} migrations={migrations}
                notifications={notifications} notifState={notifState} rippleStep={rippleStep} onClose={resetSystem} />
            )}
            {rightMode === "role" && selected && (
              <RolePanel cfg={cfg} role={byId(roles, selected)} roles={roles} edges={edges} onClose={() => setRightMode("info")} />
            )}
            {rightMode === "analysis" && (
              <AnalysisPanel analysis={analysis} state={analysisState} roles={roles} onClose={() => setRightMode("info")} />
            )}
            {rightMode === "info" && (
              <InfoPanel cfg={cfg} onAnalyze={analyze} onScenario={runScenario} />
            )}
          </aside>
        </div>
      ) : (
        <PersonalView cfg={cfg} persona={persona} roles={roles} edges={edges} timeline={timeline} onBack={() => setView("system")} />
      )}
    </div>
  );
}

// ------------------------------------------------------------- sub views ----
function Landing({ cfg, companyId, companies, onSelectCompany, onScenario, onExplore }) {
  return (
    <div className="req-landing">
      <span className="req-kicker gold">Good Evil Club · probe</span>
      <h1 className="req-hero">Role Equilibrium</h1>
      <p className="req-pitch">Roles are a living system. Change one, and the rest have to move with it.</p>

      <p className="req-eyebrow" style={{ marginTop: 6 }}>Choose a company</p>
      <div className="req-company-grid">
        {companies.map((c) => (
          <button key={c.id} className={"companycard" + (c.id === companyId ? " on" : "")} onClick={() => onSelectCompany(c.id)}>
            <span className="companycard-k">{c.kind}</span>
            <span className="companycard-t">{c.name}</span>
          </button>
        ))}
      </div>

      <p className="req-sub">{cfg.blurb}</p>

      {cfg.scenarios.length > 0 ? (
        <div className="req-scenarios">
          <p className="req-eyebrow">Run a scenario</p>
          <div className="req-scenario-grid">
            {cfg.scenarios.map((s) => (
              <button key={s.id} className="scenariocard" onClick={() => onScenario(s.id)}>
                <span className="scenariocard-t">{s.label}</span>
                <span className="scenariocard-go">Run change →</span>
              </button>
            ))}
          </div>
          <button className="req-explore" onClick={onExplore}>Or explore the organization first</button>
        </div>
      ) : (
        <div className="req-scenarios">
          <p className="req-sub">This organization has no scenarios yet. You can still explore the map.</p>
          <button className="req-explore" onClick={onExplore}>Explore the organization</button>
        </div>
      )}
    </div>
  );
}

function ConfigError({ name, errors, companies, onPick }) {
  return (
    <div className="req-landing">
      <span className="req-kicker gold">Good Evil Club · probe</span>
      <h1 className="req-hero" style={{ fontSize: "clamp(32px,5vw,52px)" }}>This config does not load</h1>
      <p className="req-sub">The config for {name} has problems that need fixing before it can run:</p>
      <ul className="req-errlist">
        {errors.map((e, i) => <li key={i}>{e}</li>)}
      </ul>
      <div className="req-company-grid" style={{ marginTop: 8 }}>
        {companies.map((c) => (
          <button key={c.id} className="companycard" onClick={() => onPick(c.id)}>
            <span className="companycard-k">{c.kind}</span>
            <span className="companycard-t">{c.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Legend({ cfg, backboneOnly, onToggleBackbone }) {
  return (
    <div className="req-legend">
      {cfg.edgeTypes.map((t) => (
        <span key={t.id}>
          <i className="sw" style={{
            borderTopWidth: t.legendWidth, borderTopStyle: t.dash !== "none" ? "dashed" : "solid",
            borderTopColor: t.legendColor,
          }} /> {t.label}
        </span>
      ))}
      {cfg.backbone.length > 0 && (
        <button className={"req-filter" + (backboneOnly ? " on" : "")} onClick={onToggleBackbone}>
          {backboneOnly ? "Showing backbone" : "Backbone only"}
        </button>
      )}
      <span className="hint">click a role to open it</span>
    </div>
  );
}

// quadratic path between node centers, curved for non vertical edges
function edgePath(a, b) {
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const dx = b.x - a.x, dy = b.y - a.y;
  const dist = Math.hypot(dx, dy) || 1;
  const bow = Math.min(46, dist * 0.12) * (Math.abs(dx) > Math.abs(dy) ? 1 : 0.35);
  const nx = -dy / dist, ny = dx / dist;
  const cx = mx + nx * bow, cy = my + ny * bow;
  return { d: `M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`, lx: cx, ly: cy };
}

function SystemMap({ cfg, roles, edges, selected, onSelect, affectedIndex, rippleActive, backboneOnly }) {
  const NW = 158, NH = 60;
  const [W, H] = [cfg.layout.width, cfg.layout.height];
  const pos = useMemo(() => { const m = {}; roles.forEach((r) => (m[r.id] = r)); return m; }, [roles]);
  const arrows = cfg.edgeTypes.filter((t) => t.arrow);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="req-canvas" preserveAspectRatio="xMidYMid meet">
      <defs>
        <pattern id="reqgrid" width="30" height="30" patternUnits="userSpaceOnUse">
          <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#efe7d80f" strokeWidth="1" />
        </pattern>
        {arrows.map((t) => (
          <marker key={t.id} id={`arrow-${t.id}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 1 L 9 5 L 0 9" fill="none" stroke={t.stroke} strokeWidth="1.6" />
          </marker>
        ))}
      </defs>
      <rect x="0" y="0" width={W} height={H} fill="url(#reqgrid)" />

      {/* edges */}
      {edges.map((e, i) => {
        const a = pos[e.from], b = pos[e.to];
        if (!a || !b || a.retired || b.retired) return null;
        const st = etype(cfg, e.type);
        if (backboneOnly && !cfg.backbone.includes(e.type)) return null;
        const g = edgePath(a, b);
        const hot = rippleActive(e.from) && rippleActive(e.to);
        const w = st.mapLabel ? st.label.length * 7 + 14 : 0;
        return (
          <g key={"e" + i}>
            <path d={g.d} fill="none" stroke={hot ? "#E4B23C" : st.stroke} strokeWidth={hot ? st.width + 1 : st.width}
              strokeDasharray={st.dash === "none" ? undefined : st.dash}
              markerEnd={st.arrow ? `url(#arrow-${st.id})` : undefined}
              opacity={hot ? 1 : st.opacity} className={hot ? "req-edge hot" : "req-edge"} />
            {st.mapLabel && (
              <g transform={`translate(${g.lx} ${g.ly})`}>
                <rect x={-w / 2} y={-9} width={w} height={17} rx={4} fill="#1b1512" stroke={st.stroke} strokeWidth="0.8" />
                <text textAnchor="middle" y={3} className="req-edge-label" fill={st.mapLabelColor || st.stroke}>{st.label}</text>
              </g>
            )}
          </g>
        );
      })}

      {/* nodes */}
      {roles.map((r) => {
        if (r.retired && !affectedIndex.has(r.id)) return null;
        const accent = domainColor(cfg, r.domain);
        const a = affectedIndex.get(r.id);
        const isActive = a && rippleActive(r.id);
        const isSel = selected === r.id;
        return (
          <g key={r.id} transform={`translate(${r.x - NW / 2} ${r.y - NH / 2})`}
            className={"req-node" + (r.retired ? " retired" : "")} onClick={() => onSelect(r.id)}>
            {isActive && <rect x={-6} y={-6} width={NW + 12} height={NH + 12} rx={12} fill="none" stroke="#E4B23C" strokeWidth="2.5" className="req-ring" />}
            <rect width={NW} height={NH} rx={9} fill="#141a17" stroke={isSel ? "#EFE7D8" : isActive ? "#E4B23C" : "#2c2a26"} strokeWidth={isSel || isActive ? 2 : 1.2} />
            <rect x={0} y={0} width={5} height={NH} rx={2} fill={accent} />
            {r.isNew && <rect x={NW - 40} y={9} width={30} height={15} rx={7} fill={accent} opacity="0.9" />}
            {r.isNew && <text x={NW - 25} y={20} textAnchor="middle" className="req-node-new">NEW</text>}
            <text x={16} y={26} className="req-node-title">{r.short || r.title}</text>
            <text x={16} y={45} className="req-node-person">{nameLabel(r)}</text>
            {isActive && (
              <g transform={`translate(${NW / 2} ${NH + 20})`}>
                <rect x={-92} y={-14} width={184} height={26} rx={6} fill="#E4B23C" />
                <text textAnchor="middle" y={3} className="req-reason">{a.reason}</text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function ChangeRail({ cfg, change, roles, migrations, notifications, notifState, rippleStep, onClose }) {
  const done = rippleStep >= change.affected.length;
  return (
    <div className="req-inner">
      <div className="req-inner-head">
        <span className="req-eyebrow gold">The change</span>
        <button className="req-x" onClick={onClose}>×</button>
      </div>
      <h2>{change.label}</h2>
      <p className="req-summary">{change.summary}</p>

      <ol className="req-steps">
        <li className="on">Change summarized</li>
        <li className={rippleStep > 0 ? "on" : ""}>Ripple across the map {done ? "" : "…"}</li>
        <li className={notifState === "live" || notifState === "fallback" ? "on" : ""}>Notifications drafted</li>
      </ol>

      {migrations && migrations.length > 0 && (
        <div className="req-block">
          <h3>What moves</h3>
          {migrations.map((m, i) => {
            const src = byId(roles, m.fromId);
            return (
              <div className="req-mig" key={i}>
                <span className="req-mig-item">{m.item}</span>
                <span className="req-mig-from">from {src ? src.title : m.fromId}</span>
                <p className="req-mig-reason">{m.reason}</p>
              </div>
            );
          })}
        </div>
      )}

      <div className="req-block">
        <h3>
          Notifications
          {notifState === "loading" && <span className="req-tag">drafting…</span>}
          {notifState === "live" && <span className="req-tag live">written by Claude</span>}
          {notifState === "fallback" && <span className="req-tag">standby copy</span>}
        </h3>

        {notifState === "loading" && (
          <div className="req-drafting">
            <span className="req-dot" /><span className="req-dot" /><span className="req-dot" />
            <p>Drafting a message for each affected person</p>
          </div>
        )}

        {notifications && notifications.map((n, i) => {
          const to = byId(roles, n.toId);
          return (
            <div className="req-msg" key={i} style={{ animationDelay: `${i * 90}ms` }}>
              <div className="req-msg-to">
                <span className="req-msg-avatar" style={{ background: to ? domainColor(cfg, to.domain) : "#8C99A6" }}>
                  {to ? initials(nameOf(to)) : "?"}
                </span>
                <div>
                  <p className="req-msg-name">To: {to ? nameOf(to) : n.toId}</p>
                  <p className="req-msg-role">{to ? to.title : ""}</p>
                </div>
              </div>
              <p className="req-msg-subject">{n.subject}</p>
              <p className="req-msg-body">{n.body}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function connectionsOf(cfg, role, roles, edges) {
  return edges
    .filter((e) => e.from === role.id || e.to === role.id)
    .map((e) => {
      const otherId = e.from === role.id ? e.to : e.from;
      const other = byId(roles, otherId);
      if (!other) return null;
      const t = etype(cfg, e.type);
      const dir = t.dir ? (e.from === role.id ? t.dir.from : t.dir.to) : t.conn;
      return { title: other.title, dir, color: t.legendColor, label: e.label };
    })
    .filter(Boolean);
}

function RolePanel({ cfg, role, roles, edges, onClose }) {
  if (!role) return null;
  const conns = connectionsOf(cfg, role, roles, edges);
  return (
    <div className="req-inner">
      <div className="req-inner-head">
        <span className="req-eyebrow" style={{ color: domainColor(cfg, role.domain) }}>{domainName(cfg, role.domain)}</span>
        <button className="req-x" onClick={onClose}>×</button>
      </div>
      <h2>{role.title}</h2>
      <p className="req-person">{(role.people || []).join(", ") || role.person || ""}</p>
      {role.purpose && <p className="req-summary">{role.purpose}</p>}

      {role.resp && role.resp.length > 0 && (
        <div className="req-block">
          <h3>Responsibilities</h3>
          <div className="req-chips">{role.resp.map((r) => <span key={r} className="chip">{r}</span>)}</div>
        </div>
      )}
      {role.mandates && role.mandates.length > 0 && (
        <div className="req-block">
          <h3>Mandates</h3>
          <div className="req-chips">{role.mandates.map((m) => <span key={m} className="chip mandate">{m}</span>)}</div>
        </div>
      )}
      <div className="req-block">
        <h3>Connections</h3>
        {conns.map((c, i) => (
          <div className="req-conn" key={i}>
            <span className="req-conn-dot" style={{ background: c.color }} />
            <span className="req-conn-dir">{c.dir}</span>
            <span className="req-conn-title">{c.title}</span>
            {c.label && <span className="req-conn-label">{c.label}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function AnalysisPanel({ analysis, state, roles, onClose }) {
  return (
    <div className="req-inner">
      <div className="req-inner-head">
        <span className="req-eyebrow gold">System analysis</span>
        <button className="req-x" onClick={onClose}>×</button>
      </div>
      <h2>What the model found</h2>

      {state === "loading" && (
        <div className="req-drafting">
          <span className="req-dot" /><span className="req-dot" /><span className="req-dot" />
          <p>Reading the org for overlaps and gaps</p>
        </div>
      )}

      {analysis && (
        <>
          <div className="req-block">
            <h3>Overlaps <span className="req-tag">{state === "live" ? "found by Claude" : "standby"}</span></h3>
            {(analysis.overlaps || []).length === 0 ? <p className="req-empty">No overlaps found.</p> :
              analysis.overlaps.map((o, i) => (
                <div className="req-finding overlap" key={i}>
                  <p className="req-finding-t">{o.area}</p>
                  <p className="req-finding-roles">{(o.roleIds || []).map((id) => (byId(roles, id) || {}).title || id).join(" and ")}</p>
                  <p className="req-finding-x">{o.explanation}</p>
                </div>
              ))}
          </div>
          <div className="req-block">
            <h3>Gaps</h3>
            {(analysis.gaps || []).length === 0 ? <p className="req-empty">No gaps found.</p> :
              analysis.gaps.map((g, i) => (
                <div className="req-finding gap" key={i}>
                  <p className="req-finding-t">{g.area}</p>
                  <p className="req-finding-x">{g.explanation}</p>
                </div>
              ))}
          </div>
        </>
      )}
    </div>
  );
}

function InfoPanel({ cfg, onAnalyze, onScenario }) {
  return (
    <div className="req-inner">
      <span className="req-eyebrow gold">How to read this</span>
      <h2>The organization is a system</h2>
      <p className="req-summary">
        Every card is a role. The lines are how the roles depend on each other. {cfg.infoNote ||
          "Open a role to read its definition and connections."}
      </p>
      <button className="btn wide" onClick={onAnalyze}>Analyze system</button>
      {cfg.scenarios.length > 0 && (
        <div className="req-block">
          <h3>Run a change</h3>
          {cfg.scenarios.map((s) => (
            <button key={s.id} className="req-listbtn" onClick={() => onScenario(s.id)}>
              {s.label}<span>→</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PersonalView({ cfg, persona, roles, edges, timeline, onBack }) {
  if (!persona) return null;
  const conns = connectionsOf(cfg, persona, roles, edges);
  const personaScenario = cfg.scenarios.find((s) => s.personalEntry && s.affected.some((a) => a.id === cfg.persona));
  return (
    <div className="req-personal">
      <div className="req-personal-grid">
        <section className="req-me">
          <span className="req-eyebrow" style={{ color: domainColor(cfg, persona.domain) }}>My role · {domainName(cfg, persona.domain)}</span>
          <h2 className="req-me-title">{persona.title}</h2>
          <p className="req-person">{(persona.people || []).join(", ") || persona.person || ""}</p>
          {persona.purpose && <p className="req-summary">{persona.purpose}</p>}

          {persona.resp && persona.resp.length > 0 && (
            <div className="req-block">
              <h3>What I own</h3>
              <div className="req-chips">{persona.resp.map((r) => <span key={r} className="chip">{r}</span>)}</div>
            </div>
          )}
          {persona.mandates && persona.mandates.length > 0 && (
            <div className="req-block">
              <h3>My mandates</h3>
              <div className="req-chips">{persona.mandates.map((m) => <span key={m} className="chip mandate">{m}</span>)}</div>
            </div>
          )}
          <div className="req-block">
            <h3>Who I work with</h3>
            {conns.map((c, i) => (
              <div className="req-conn" key={i}>
                <span className="req-conn-dot" style={{ background: c.color }} />
                <span className="req-conn-dir">{c.dir}</span>
                <span className="req-conn-title">{c.title}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="req-timeline-wrap">
          <span className="req-eyebrow gold">Changes that affected me</span>
          <h2 className="req-me-title">My timeline</h2>
          <div className="req-timeline">
            {timeline.map((t, i) => (
              <div className="req-tl" key={i}>
                <span className="req-tl-dot" />
                <div className="req-tl-body">
                  <p className="req-tl-when">{t.when}</p>
                  <p className="req-tl-title">{t.title}</p>
                  <p className="req-tl-mean">{t.meaning}</p>
                </div>
              </div>
            ))}
          </div>
          {personaScenario && (
            <p className="req-tip">Run "{personaScenario.label}" in system view, then come back here to see the change land on this role.</p>
          )}
          <button className="btn ghost wide" onClick={onBack}>Back to system view</button>
        </section>
      </div>
    </div>
  );
}

function initials(name) {
  return String(name).split(/[\s,]+/).filter(Boolean).slice(0, 2).map((s) => s[0]).join("").toUpperCase();
}

// ------------------------------------------------------------------- css ----
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800&family=Inter:wght@400;500;600&family=Space+Mono:wght@400;700&display=swap');
html, body { cursor: auto; }
.req-root{
  --bg:#0F0D0C; --panel:#171310; --canvas:#100E0C; --card:#141a17;
  --ink:#F1EADD; --muted:#8C8375; --hair:#2c2a26; --gold:#E4B23C;
  --display:'Archivo',system-ui,sans-serif; --ui:'Inter',system-ui,sans-serif; --mono:'Space Mono',ui-monospace,monospace;
  background:var(--bg); color:var(--ink); font-family:var(--ui);
  min-height:100%; padding:20px; box-sizing:border-box;
}
.req-root *{box-sizing:border-box;}
.req-kicker{font-family:var(--mono); font-size:11px; letter-spacing:.18em; text-transform:uppercase; color:var(--muted);}
.req-kicker.gold, .gold{color:var(--gold);}

/* ---- landing ---- */
.req-landing{max-width:820px; margin:0 auto; padding:56px 8px 40px;}
.req-hero{font-family:var(--display); font-weight:800; font-size:clamp(40px,7vw,72px); letter-spacing:-.03em; margin:10px 0 14px; line-height:.98;}
.req-pitch{font-family:var(--display); font-weight:600; font-size:clamp(20px,3vw,28px); color:var(--ink); margin:0 0 22px; letter-spacing:-.01em;}
.req-sub{color:#B3A99A; font-size:16px; line-height:1.6; max-width:60ch; margin:8px 0 32px;}
.req-eyebrow{font-family:var(--mono); font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:var(--muted);}
.req-company-grid{display:grid; grid-template-columns:1fr 1fr; gap:14px; margin:10px 0 6px; max-width:620px;}
.companycard{display:flex; flex-direction:column; gap:6px; text-align:left; background:var(--panel); border:1px solid var(--hair); border-radius:14px; padding:18px 18px; cursor:pointer; transition:.16s;}
.companycard:hover{border-color:var(--gold);}
.companycard.on{border-color:var(--gold); box-shadow:inset 0 0 0 1px var(--gold);}
.companycard-k{font-family:var(--mono); font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:var(--muted);}
.companycard-t{font-family:var(--display); font-weight:800; font-size:24px; letter-spacing:-.01em; color:var(--ink);}
.req-scenario-grid{display:grid; grid-template-columns:repeat(3,1fr); gap:14px; margin:12px 0 18px;}
.scenariocard{display:flex; flex-direction:column; justify-content:space-between; gap:26px; text-align:left;
  background:var(--panel); border:1px solid var(--hair); border-radius:14px; padding:20px 18px; cursor:pointer; transition:.16s; min-height:130px;}
.scenariocard:hover{border-color:var(--gold); transform:translateY(-2px);}
.scenariocard-t{font-family:var(--display); font-weight:700; font-size:19px; color:var(--ink); line-height:1.15;}
.scenariocard-go{font-family:var(--mono); font-size:12px; color:var(--gold); letter-spacing:.04em;}
.req-explore{background:none; border:none; color:var(--muted); font-family:var(--ui); font-size:14px; cursor:pointer; text-decoration:underline; text-underline-offset:3px; padding:4px 0;}
.req-explore:hover{color:var(--ink);}
.req-errlist{margin:6px 0 20px; padding-left:18px; color:#f0b6a6; font-size:14px; line-height:1.7; max-width:70ch;}

/* ---- top bar ---- */
.req-bar{display:flex; align-items:center; gap:20px; margin-bottom:16px; flex-wrap:wrap;}
.req-brand h1{font-family:var(--display); font-weight:800; font-size:24px; letter-spacing:-.02em; margin:2px 0 0;}
.req-toggle{display:flex; gap:4px; background:var(--panel); border:1px solid var(--hair); border-radius:10px; padding:4px; margin-left:8px;}
.tg{font-family:var(--ui); font-weight:600; font-size:13px; border:none; background:transparent; color:var(--muted); padding:9px 16px; border-radius:7px; cursor:pointer; transition:.14s;}
.tg.on{background:var(--gold); color:#1a1408;}
.req-actions{display:flex; gap:10px; margin-left:auto;}
.btn{font-family:var(--ui); font-weight:600; font-size:13px; border:1px solid var(--hair); background:transparent; color:var(--ink); padding:10px 16px; border-radius:9px; cursor:pointer; transition:.15s;}
.btn:hover{border-color:var(--ink);}
.btn.ghost{color:var(--muted);}
.btn.wide{width:100%; margin:8px 0 6px; padding:12px; background:var(--gold); border-color:var(--gold); color:#1a1408;}
.btn.wide:hover{filter:brightness(1.06);}

/* ---- stage ---- */
.req-stage{display:grid; grid-template-columns:1fr 400px; gap:16px; align-items:start;}
.req-canvas-wrap{background:var(--canvas); border:1px solid var(--hair); border-radius:16px; padding:12px;}
.req-canvas{width:100%; height:auto; display:block; border-radius:10px; touch-action:none;}
.req-node{cursor:pointer;}
.req-node.retired{opacity:.34;}
.req-node-title{font-family:var(--display); font-weight:700; font-size:15px; fill:var(--ink);}
.req-node-person{font-family:var(--mono); font-size:10.5px; fill:var(--muted);}
.req-node-new{font-family:var(--mono); font-size:8.5px; font-weight:700; fill:#1a1408;}
.req-reason{font-family:var(--mono); font-size:11px; font-weight:700; fill:#1a1408;}
.req-edge-label{font-family:var(--mono); font-size:9px;}
.req-edge.hot{filter:drop-shadow(0 0 4px rgba(228,178,60,.5));}
@keyframes reqpulse{0%{opacity:.25;} 100%{opacity:1;}}
.req-ring{animation:reqpulse .5s ease-out;}

.req-legend{display:flex; gap:18px; flex-wrap:wrap; align-items:center; margin-top:12px; font-family:var(--mono); font-size:12px; color:var(--muted);}
.req-legend .sw{display:inline-block; width:18px; height:0; border-top-width:2px; border-top-style:solid; border-top-color:#6b6459; vertical-align:middle; margin-right:6px;}
.req-legend .hint{margin-left:auto;}
.req-filter{font-family:var(--mono); font-size:11px; letter-spacing:.04em; color:var(--muted); background:transparent; border:1px solid var(--hair); border-radius:20px; padding:4px 11px; cursor:pointer; transition:.14s;}
.req-filter:hover{border-color:var(--muted); color:var(--ink);}
.req-filter.on{background:var(--gold); border-color:var(--gold); color:#1a1408;}

.req-scenariobar{display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-top:14px; border-top:1px solid var(--hair); padding-top:14px;}
.req-scenariobar-l{font-family:var(--mono); font-size:11px; letter-spacing:.12em; text-transform:uppercase; color:var(--muted); margin-right:2px;}
.chipbtn{font-family:var(--ui); font-weight:600; font-size:13px; background:var(--panel); border:1px solid var(--hair); color:var(--ink); padding:9px 14px; border-radius:8px; cursor:pointer; transition:.15s;}
.chipbtn:hover{border-color:var(--gold);}
.chipbtn.on{background:var(--gold); border-color:var(--gold); color:#1a1408;}

/* ---- right panel ---- */
.req-panel{background:var(--panel); border:1px solid var(--hair); border-radius:16px; min-height:560px; max-height:calc(100vh - 120px); overflow:auto;}
.req-inner{padding:22px;}
.req-inner-head{display:flex; justify-content:space-between; align-items:flex-start;}
.req-x{background:none; border:none; color:var(--muted); font-size:22px; line-height:1; cursor:pointer; padding:0;}
.req-x:hover{color:var(--ink);}
.req-panel h2{font-family:var(--display); font-weight:700; font-size:23px; margin:6px 0 8px; letter-spacing:-.01em; line-height:1.1;}
.req-person{font-family:var(--mono); font-size:12px; color:var(--muted); margin:0 0 12px;}
.req-summary{font-size:14.5px; line-height:1.6; color:#C3B9A9; margin:0 0 16px;}
.req-eyebrow.gold{color:var(--gold);}

.req-steps{list-style:none; counter-reset:s; padding:0; margin:0 0 18px; display:flex; flex-direction:column; gap:8px;}
.req-steps li{counter-increment:s; font-size:13px; color:var(--muted); padding-left:30px; position:relative;}
.req-steps li::before{content:counter(s); position:absolute; left:0; top:-2px; width:20px; height:20px; border-radius:50%; border:1px solid var(--hair); font-family:var(--mono); font-size:11px; display:flex; align-items:center; justify-content:center; color:var(--muted);}
.req-steps li.on{color:var(--ink);}
.req-steps li.on::before{background:var(--gold); border-color:var(--gold); color:#1a1408;}

.req-block{border-top:1px solid var(--hair); padding-top:14px; margin-top:16px;}
.req-block h3{font-family:var(--mono); font-size:11px; letter-spacing:.1em; text-transform:uppercase; color:var(--muted); margin:0 0 12px; display:flex; align-items:center; gap:8px;}
.req-tag{font-family:var(--mono); font-size:9.5px; letter-spacing:.06em; text-transform:none; color:var(--muted); border:1px solid var(--hair); border-radius:20px; padding:2px 8px;}
.req-tag.live{color:var(--gold); border-color:#5a4a1e;}

.req-mig{margin-bottom:12px;}
.req-mig-item{font-family:var(--ui); font-weight:600; font-size:14px; color:var(--ink);}
.req-mig-from{font-family:var(--mono); font-size:11px; color:var(--muted); margin-left:8px;}
.req-mig-reason{font-size:13px; color:#A79D8E; margin:3px 0 0; line-height:1.5;}

.req-drafting{display:flex; align-items:center; gap:8px; color:var(--muted); font-size:13px; padding:6px 0 4px;}
.req-drafting p{margin:0;}
.req-dot{width:6px; height:6px; border-radius:50%; background:var(--gold); display:inline-block; animation:reqbounce 1s infinite ease-in-out;}
.req-dot:nth-child(2){animation-delay:.16s;}
.req-dot:nth-child(3){animation-delay:.32s;}
@keyframes reqbounce{0%,80%,100%{opacity:.25; transform:translateY(0);}40%{opacity:1; transform:translateY(-4px);}}

.req-msg{background:#12100e; border:1px solid var(--hair); border-radius:12px; padding:14px; margin-bottom:12px; animation:reqrise .4s both;}
@keyframes reqrise{from{opacity:0; transform:translateY(8px);}to{opacity:1; transform:translateY(0);}}
.req-msg-to{display:flex; align-items:center; gap:10px; margin-bottom:9px;}
.req-msg-avatar{width:30px; height:30px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-family:var(--mono); font-size:11px; font-weight:700; color:#12100e; flex:none;}
.req-msg-name{font-family:var(--ui); font-weight:600; font-size:13px; color:var(--ink); margin:0;}
.req-msg-role{font-family:var(--mono); font-size:10.5px; color:var(--muted); margin:1px 0 0;}
.req-msg-subject{font-family:var(--display); font-weight:700; font-size:15px; color:var(--ink); margin:0 0 6px;}
.req-msg-body{font-size:13.5px; line-height:1.55; color:#C3B9A9; margin:0;}

.req-chips{display:flex; gap:8px; flex-wrap:wrap;}
.chip{font-family:var(--mono); font-size:12px; padding:6px 10px; border-radius:6px; background:#211d18; color:#D9CFBD; border:1px solid var(--hair);}
.chip.mandate{background:#2a2016; color:#e6b877; border-color:#4a3a22;}

.req-conn{display:flex; align-items:center; gap:9px; padding:6px 0; font-size:13.5px; border-bottom:1px solid #201d19;}
.req-conn:last-child{border-bottom:none;}
.req-conn-dot{width:9px; height:9px; border-radius:50%; flex:none; background:#6b6459;}
.req-conn-dir{font-family:var(--mono); font-size:11px; color:var(--muted); min-width:74px;}
.req-conn-title{color:var(--ink); font-weight:500;}
.req-conn-label{font-family:var(--mono); font-size:10px; color:var(--muted); margin-left:auto;}

.req-finding{border-left:2px solid var(--hair); padding:2px 0 2px 14px; margin-bottom:14px;}
.req-finding.overlap{border-color:#D9492B;}
.req-finding.gap{border-color:var(--gold);}
.req-finding-t{font-family:var(--display); font-weight:700; font-size:16px; margin:0 0 3px; color:var(--ink);}
.req-finding-roles{font-family:var(--mono); font-size:11px; color:#e8836e; margin:0 0 6px;}
.req-finding-x{font-size:13.5px; line-height:1.55; color:#B3A99A; margin:0;}
.req-empty{color:var(--muted); font-size:13px;}

.req-listbtn{width:100%; display:flex; justify-content:space-between; align-items:center; background:#12100e; border:1px solid var(--hair); color:var(--ink); font-family:var(--ui); font-weight:600; font-size:14px; padding:12px 14px; border-radius:9px; cursor:pointer; margin-bottom:8px; transition:.14s;}
.req-listbtn:hover{border-color:var(--gold);}
.req-listbtn span{color:var(--gold);}

/* ---- personal ---- */
.req-personal{margin-top:4px;}
.req-personal-grid{display:grid; grid-template-columns:1fr 1fr; gap:16px; align-items:start;}
.req-me, .req-timeline-wrap{background:var(--panel); border:1px solid var(--hair); border-radius:16px; padding:24px;}
.req-me-title{font-family:var(--display); font-weight:800; font-size:28px; letter-spacing:-.02em; margin:8px 0 6px;}
.req-timeline{margin:14px 0 16px;}
.req-tl{display:flex; gap:14px; padding-bottom:18px; position:relative;}
.req-tl:not(:last-child)::before{content:''; position:absolute; left:5px; top:14px; bottom:-4px; width:1px; background:var(--hair);}
.req-tl-dot{width:11px; height:11px; border-radius:50%; background:var(--gold); flex:none; margin-top:3px; z-index:1;}
.req-tl-when{font-family:var(--mono); font-size:11px; color:var(--muted); margin:0 0 2px; text-transform:uppercase; letter-spacing:.08em;}
.req-tl-title{font-family:var(--display); font-weight:700; font-size:16px; color:var(--ink); margin:0 0 4px;}
.req-tl-mean{font-size:13.5px; line-height:1.55; color:#B3A99A; margin:0;}
.req-tip{font-size:12.5px; color:var(--muted); line-height:1.5; margin:8px 0 16px; border-top:1px solid var(--hair); padding-top:14px;}

@media (max-width:1080px){
  .req-stage{grid-template-columns:1fr;}
  .req-personal-grid{grid-template-columns:1fr;}
  .req-scenario-grid{grid-template-columns:1fr;}
  .req-company-grid{grid-template-columns:1fr;}
  .req-panel{max-height:none;}
}
@media (prefers-reduced-motion:reduce){
  .req-ring,.req-msg,.req-dot{animation:none;}
}
`;
