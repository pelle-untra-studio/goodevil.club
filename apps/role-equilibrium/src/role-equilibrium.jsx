import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
// Client helper, same as the simulator: posts a messages array to /api/claude
// and returns text. The Anthropic key stays server side.
import { askClaude } from "./askClaude";

/*
  ROLE EQUILIBRIUM  ·  a Good Evil Club probe
  ------------------------------------------------------------------
  Roles are nodes in a living system, not standalone documents. Change
  one role and the connected roles have to move with it. This showcase
  makes that one moment unmissable: change a role, watch the ripple,
  read the drafted notifications each affected person would receive.

  AI is used for three things, each with a pre written fallback so a
  live demo never breaks: personalized change notifications, the
  overlap and gap analysis, and rebalancing suggestions when a role
  is added. Everything reaches the ripple within a few seconds.
*/

// ---------------------------------------------------------------- helpers ---
function parseJSON(text) {
  const clean = String(text).replace(/```json|```/g, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("no json in response");
  return JSON.parse(clean.slice(start, end + 1));
}

const DEPTS = {
  Leadership: "#E4B23C",
  Product: "#6C8CFF",
  Engineering: "#35B597",
  Sales: "#E5643C",
  "Customer Success": "#B06CE0",
  Operations: "#8C99A6",
};

// Shorter labels for the map so long titles do not clip on a projector.
// The full title still shows in the role panel and personal view.
const SHORT_TITLE = {
  head_cs: "Head of CS",
  eng_mgr: "Eng Manager",
  ae: "Account Exec",
  sales_ops: "Sales Ops Analyst",
  csm: "CS Manager",
  ops_mgr: "Ops Manager",
};

// ------------------------------------------------------------- seed roles ---
// x,y are layout coordinates in the map viewBox (1520 x 860).
const SEED_ROLES = [
  { id: "ceo", title: "CEO", person: "Astrid Ek", dept: "Leadership", x: 760, y: 92,
    purpose: "Sets company direction and owns the executive team.",
    resp: ["Company strategy", "Executive hiring", "Board relationship", "Capital allocation", "Culture"],
    mandates: ["Final say on annual budget", "Approve executive hires"] },

  { id: "vp_product", title: "VP Product", person: "Johan Nystrom", dept: "Product", x: 210, y: 272,
    purpose: "Owns what the company builds and why.",
    resp: ["Product strategy", "Roadmap", "AI feature roadmap", "Pricing input", "Discovery"],
    mandates: ["Approve the roadmap", "Prioritize releases"] },

  { id: "vp_eng", title: "VP Engineering", person: "Priya Rao", dept: "Engineering", x: 520, y: 272,
    purpose: "Owns how the product is built and shipped.",
    resp: ["Engineering strategy", "Architecture", "Delivery", "Hiring engineers", "Security"],
    mandates: ["Approve model deployments", "Approve technical standards"] },

  { id: "head_sales", title: "Head of Sales", person: "Erik Lund", dept: "Sales", x: 760, y: 272,
    purpose: "Owns revenue and the sales team.",
    resp: ["Sales strategy", "Pipeline", "Forecasting", "Key accounts", "Partnerships"],
    mandates: ["Approve pricing exceptions", "Own list price and discount policy"] },

  { id: "head_cs", title: "Head of Customer Success", person: "Sofia Berg", dept: "Customer Success", x: 1060, y: 272,
    purpose: "Owns customer retention and expansion.",
    resp: ["Retention", "Expansion", "Onboarding", "Customer health", "Advocacy"],
    mandates: ["Approve save offers", "Set health scoring"] },

  { id: "head_ops", title: "Head of Operations", person: "Markus Holm", dept: "Operations", x: 1350, y: 272,
    purpose: "Owns internal operations and vendors.",
    resp: ["Operations", "Vendor onboarding", "Vendor contracts", "Tooling", "Facilities"],
    mandates: ["Approve vendor spend", "Own procurement policy"] },

  { id: "pm", title: "Product Manager", person: "Lena Falk", dept: "Product", x: 120, y: 502,
    purpose: "Turns strategy into shipped product.",
    resp: ["Requirements", "Backlog", "Release notes", "Customer interviews", "Metrics"],
    mandates: ["Prioritize the backlog"] },

  { id: "designer", title: "Product Designer", person: "Oskar Vik", dept: "Product", x: 296, y: 502,
    purpose: "Owns the product experience.",
    resp: ["UX flows", "Visual design", "Prototypes", "Design system"],
    mandates: ["Approve final design"] },

  { id: "eng_mgr", title: "Engineering Manager", person: "David Sund", dept: "Engineering", x: 472, y: 502,
    purpose: "Runs the engineering team day to day.",
    resp: ["Sprint planning", "Code review", "Delivery", "One on ones", "Incident response"],
    mandates: ["Approve production releases"] },

  { id: "senior_eng", title: "Senior Engineer", person: "Nina Ali", dept: "Engineering", x: 472, y: 700,
    purpose: "Builds core systems.",
    resp: ["Implementation", "Architecture input", "Model evaluation", "Code review", "Mentoring"],
    mandates: ["Approve merges to main"] },

  { id: "ae", title: "Account Executive", person: "Tomas Ek", dept: "Sales", x: 648, y: 502,
    purpose: "Closes new business.",
    resp: ["Prospecting", "Demos", "Negotiation", "Closing", "Handoff to Customer Success"],
    mandates: ["Commit deal terms within policy"] },

  { id: "sales_ops", title: "Sales Operations Analyst", person: "Hanna Ek", dept: "Sales", x: 824, y: 502,
    purpose: "Keeps the sales engine running.",
    resp: ["Pipeline hygiene", "Reporting", "Deal desk", "Quota tracking"],
    mandates: ["Approve pricing exceptions", "Own CRM data quality"] },

  { id: "csm", title: "Customer Success Manager", person: "Maja Lind", dept: "Customer Success", x: 1000, y: 502,
    purpose: "Owns a book of customers after the sale.",
    resp: ["Onboarding", "Adoption", "Quarterly reviews", "Renewal prep", "Escalation triage"],
    mandates: ["Own the renewal recommendation"] },

  { id: "support_lead", title: "Support Lead", person: "Felix Strom", dept: "Customer Success", x: 1176, y: 502,
    purpose: "Owns customer support quality.",
    resp: ["Ticket triage", "Service levels", "Escalations", "Knowledge base"],
    mandates: ["Set support priority"] },

  { id: "ops_mgr", title: "Operations Manager", person: "Ida Nilsson", dept: "Operations", x: 1352, y: 502,
    purpose: "Runs operations day to day.",
    resp: ["Vendor onboarding", "Contract tracking", "Tooling admin", "Reporting"],
    mandates: ["Approve tooling under budget"] },
];

// from = subordinate or source, to = manager or target
const SEED_EDGES = [
  // reporting lines
  { from: "vp_product", to: "ceo", type: "reports" },
  { from: "vp_eng", to: "ceo", type: "reports" },
  { from: "head_sales", to: "ceo", type: "reports" },
  { from: "head_cs", to: "ceo", type: "reports" },
  { from: "head_ops", to: "ceo", type: "reports" },
  { from: "pm", to: "vp_product", type: "reports" },
  { from: "designer", to: "vp_product", type: "reports" },
  { from: "eng_mgr", to: "vp_eng", type: "reports" },
  { from: "senior_eng", to: "eng_mgr", type: "reports" },
  { from: "ae", to: "head_sales", type: "reports" },
  { from: "sales_ops", to: "head_sales", type: "reports" },
  { from: "csm", to: "head_cs", type: "reports" },
  { from: "support_lead", to: "head_cs", type: "reports" },
  { from: "ops_mgr", to: "head_ops", type: "reports" },
  // handoffs
  { from: "ae", to: "csm", type: "handoff", label: "deal handoff" },
  { from: "pm", to: "eng_mgr", type: "handoff", label: "spec handoff" },
  // dependencies
  { from: "pm", to: "senior_eng", type: "dependency", label: "feasibility" },
  { from: "csm", to: "pm", type: "dependency", label: "product feedback" },
  { from: "designer", to: "pm", type: "dependency", label: "decisions" },
  { from: "ae", to: "sales_ops", type: "dependency", label: "deal desk" },
  { from: "ops_mgr", to: "vp_eng", type: "dependency", label: "tooling" },
  // shared mandate (the deliberate overlap)
  { from: "head_sales", to: "sales_ops", type: "shared", label: "pricing exceptions" },
];

const EDGE_STYLE = {
  reports: { stroke: "#4b4640", width: 1.3, dash: "none", arrow: "arrow-reports", opacity: 0.6 },
  handoff: { stroke: "#E5643C", width: 2, dash: "none", arrow: "arrow-handoff", opacity: 0.95 },
  dependency: { stroke: "#6C8CFF", width: 1.7, dash: "6 6", arrow: "arrow-dep", opacity: 0.9 },
  shared: { stroke: "#D9492B", width: 2.6, dash: "none", arrow: "none", opacity: 1 },
};

// --------------------------------------------------------------- analysis ---
const ANALYSIS_FALLBACK = {
  overlaps: [
    { roleIds: ["head_sales", "sales_ops"], area: "Pricing exceptions",
      explanation: "Both the Head of Sales and the Sales Operations Analyst list approval of pricing exceptions as a mandate. A deal can be approved twice, or slip between them while each assumes the other has it." },
  ],
  gaps: [
    { area: "Vendor offboarding",
      explanation: "Vendor onboarding and contracts sit with Operations, but no role owns offboarding. Contracts can auto renew or lapse with no one accountable for closing them out." },
  ],
};

// --------------------------------------------------------------- scenarios ---
// Each scenario is self contained: what it changes, which nodes ripple and
// why (in propagation order), the data migrations, and pre written
// notifications used as a fallback when the AI call is unavailable.
const SCENARIOS = {
  add_ai: {
    key: "add_ai",
    label: "Add a Head of AI role",
    summary: "A Head of AI role is added to Leadership. It takes ownership of model governance and the AI roadmap, which today are split across Engineering and Product.",
    newRoles: [
      { id: "head_ai", title: "Head of AI", person: "Vacant, open req", dept: "Leadership", x: 980, y: 150, isNew: true,
        purpose: "Owns AI strategy, model governance, and responsible use.",
        resp: ["AI strategy", "AI feature roadmap", "Model evaluation", "Responsible AI review"],
        mandates: ["Approve model deployments", "Sign off on AI risk"] },
    ],
    newEdges: [
      { from: "head_ai", to: "ceo", type: "reports" },
      { from: "vp_eng", to: "head_ai", type: "dependency", label: "model risk" },
      { from: "vp_product", to: "head_ai", type: "dependency", label: "AI roadmap" },
      { from: "senior_eng", to: "head_ai", type: "handoff", label: "eval handoff" },
    ],
    migrations: [
      { fromId: "vp_eng", kind: "mandates", item: "Approve model deployments" },
      { fromId: "vp_product", kind: "resp", item: "AI feature roadmap" },
      { fromId: "senior_eng", kind: "resp", item: "Model evaluation" },
    ],
    affected: [
      { id: "head_ai", reason: "New role created" },
      { id: "vp_eng", reason: "Model governance moves out" },
      { id: "vp_product", reason: "AI roadmap moves out" },
      { id: "senior_eng", reason: "Model evaluation reassigned" },
      { id: "pm", reason: "New sign off in the path" },
    ],
    fallbackNotifications: [
      { toId: "vp_eng", subject: "Model governance moves to the Head of AI",
        body: "Priya, with the new Head of AI role, approval of model deployments moves out of Engineering. Your team still builds and ships as before. Final sign off on model risk now sits with the Head of AI. Nothing changes for your current sprint, the handoff starts once the role is filled." },
      { toId: "vp_product", subject: "AI roadmap consolidates under one owner",
        body: "Johan, the AI feature roadmap you have been holding moves to the Head of AI. Product keeps the customer facing roadmap. AI capabilities get planned together, with the Head of AI setting direction on model choices. Expect a short handoff session once the seat is filled." },
      { toId: "senior_eng", subject: "Model evaluation gets a dedicated owner",
        body: "Nina, model evaluation moves from your plate to the Head of AI. You keep implementation and code review. This should give back the time you were spending on eval tooling. You stay close to the standards, you just will not own them." },
    ],
  },

  split_cs: {
    key: "split_cs",
    label: "Split Customer Success",
    summary: "Customer Success splits into Onboarding and Retention. Two focused leads replace one Head of Customer Success, and the reporting lines and the sales handoff move to the new owners.",
    newRoles: [
      { id: "head_onboarding", title: "Head of Onboarding", person: "Sofia Berg", dept: "Customer Success", x: 980, y: 150, isNew: true,
        purpose: "Owns the first 90 days of every new customer.",
        resp: ["Onboarding playbook", "Time to value", "Implementation quality"],
        mandates: ["Approve onboarding scope"] },
      { id: "head_retention", title: "Head of Retention", person: "Vacant, open req", dept: "Customer Success", x: 1200, y: 150, isNew: true,
        purpose: "Owns renewals, expansion, and churn.",
        resp: ["Renewals", "Expansion", "Churn analysis"],
        mandates: ["Approve save offers"] },
    ],
    newEdges: [
      { from: "head_onboarding", to: "ceo", type: "reports" },
      { from: "head_retention", to: "ceo", type: "reports" },
      { from: "csm", to: "head_onboarding", type: "reports" },
      { from: "support_lead", to: "head_retention", type: "reports" },
      { from: "ae", to: "head_onboarding", type: "handoff", label: "deal handoff" },
    ],
    removeEdges: [
      { from: "csm", to: "head_cs" },
      { from: "support_lead", to: "head_cs" },
      { from: "head_cs", to: "ceo" },
    ],
    retire: ["head_cs"],
    affected: [
      { id: "head_cs", reason: "Role splits in two" },
      { id: "head_onboarding", reason: "New owner, onboarding" },
      { id: "head_retention", reason: "New owner, retention" },
      { id: "csm", reason: "Now reports to Onboarding" },
      { id: "support_lead", reason: "Now reports to Retention" },
      { id: "ae", reason: "Handoff target changed" },
    ],
    fallbackNotifications: [
      { toId: "csm", subject: "Your reporting line moves to Onboarding",
        body: "Maja, Customer Success is splitting into Onboarding and Retention. You move under the Head of Onboarding, since your work lives in the first 90 days. Your accounts stay with you through onboarding, then hand to Retention at go live. We will map the exact cutover with you this week." },
      { toId: "support_lead", subject: "Support moves under Retention",
        body: "Felix, with the split, Support sits under the Head of Retention, closer to renewals and churn signals. Your escalation paths stay the same for now. The one change is that churn risk flags route to Retention, not to the old Head of Customer Success." },
      { toId: "ae", subject: "Your handoff at close now goes to Onboarding",
        body: "Tomas, when you close a deal the handoff now goes to the Head of Onboarding, not the general Customer Success inbox. Same fields, same timing. This should make the first customer call faster to book." },
      { toId: "head_sales", subject: "Sales to CS handoff has a clear owner",
        body: "Erik, the Customer Success split gives your team a single named owner for new customer handoffs. Closed deals now route to Onboarding. Nothing changes in your pipeline, only where a closed deal lands." },
    ],
  },

  move_mandate: {
    key: "move_mandate",
    label: "Move a mandate between roles",
    summary: "Approval of pricing exceptions moves from the Head of Sales to the Sales Operations Analyst. This closes the overlap where two roles both owned it.",
    newRoles: [],
    newEdges: [],
    removeEdges: [{ from: "head_sales", to: "sales_ops", type: "shared" }],
    migrations: [
      { fromId: "head_sales", kind: "mandates", item: "Approve pricing exceptions" },
    ],
    affected: [
      { id: "head_sales", reason: "Gives up pricing approvals" },
      { id: "sales_ops", reason: "Now sole owner" },
      { id: "ae", reason: "Escalate to Sales Ops now" },
    ],
    fallbackNotifications: [
      { toId: "head_sales", subject: "Pricing exceptions move to Sales Ops",
        body: "Erik, to close the overlap, approval of pricing exceptions moves fully to the Sales Operations Analyst. You keep list price and discount policy. Day to day exception calls no longer wait on you. You will still get a weekly summary of what was approved." },
      { toId: "sales_ops", subject: "You now own pricing exceptions end to end",
        body: "Hanna, approval of pricing exceptions is now yours alone. Reps escalate directly to you, not to the Head of Sales. Keep the existing threshold, anything past 20 percent needs a note. Send only true edge cases further up." },
      { toId: "ae", subject: "Send pricing exceptions to Sales Ops",
        body: "Tomas, when a deal needs a pricing exception, send it to the Sales Operations Analyst rather than the Head of Sales. This should cut approval time. The threshold and the fields are unchanged." },
    ],
  },
};

// apply a scenario to a clean base, returning the next roles + edges
function applyScenario(sc) {
  let roles = SEED_ROLES.map((r) => ({ ...r, resp: [...r.resp], mandates: [...r.mandates] }));
  let edges = SEED_EDGES.map((e) => ({ ...e }));

  (sc.newRoles || []).forEach((nr) => roles.push({ ...nr, resp: [...nr.resp], mandates: [...nr.mandates] }));
  (sc.retire || []).forEach((id) => {
    const role = roles.find((r) => r.id === id);
    if (role) role.retired = true;
  });
  (sc.removeEdges || []).forEach((re) => {
    edges = edges.filter((e) => !(e.from === re.from && e.to === re.to && (!re.type || e.type === re.type)));
  });
  (sc.newEdges || []).forEach((ne) => edges.push({ ...ne }));
  (sc.migrations || []).forEach((m) => {
    const src = roles.find((r) => r.id === m.fromId);
    if (src) src[m.kind] = src[m.kind].filter((x) => x.toLowerCase() !== m.item.toLowerCase());
  });
  return { roles, edges };
}

const byId = (roles, id) => roles.find((r) => r.id === id);

// --------------------------------------------------------------- AI layer ---
const AI_SYS =
  "You draft internal reorg content for a company operating model tool. Return ONLY valid JSON, no prose, no markdown fences. Never use em dashes. Never use exclamation marks. Write plainly, like a thoughtful manager, direct and specific.";

async function aiNotifications(sc, roles) {
  const people = sc.affected
    .map((a) => byId(roles, a.id))
    .filter(Boolean)
    .filter((r) => !/vacant/i.test(r.person)) // never draft a message to an unfilled seat
    .map((r) => `- ${r.id} :: ${r.person} (${r.title}) :: reason: ${
      (sc.affected.find((a) => a.id === r.id) || {}).reason
    }`)
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
  const compact = roles
    .filter((r) => !r.retired)
    .map((r) => ({ id: r.id, title: r.title, responsibilities: r.resp, mandates: r.mandates }));
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
  const compact = roles
    .filter((r) => !r.isNew && !r.retired)
    .map((r) => ({ id: r.id, title: r.title, responsibilities: r.resp, mandates: r.mandates }));
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

// fallback migrations rendered as human sentences for the change rail
function fallbackMigrations(sc) {
  const reasons = {
    add_ai: {
      "Approve model deployments": "Model risk gets a dedicated owner",
      "AI feature roadmap": "AI roadmap consolidates under one role",
      "Model evaluation": "Evaluation standards centralize",
    },
  };
  return (sc.migrations || []).map((m) => ({
    fromId: m.fromId,
    item: m.item,
    reason: (reasons[sc.key] && reasons[sc.key][m.item]) || "Reassigned to the new role",
  }));
}

const PERSONA_ID = "csm";
const SEED_TIMELINE = [
  { when: "Last quarter", title: "Support escalation path clarified",
    meaning: "Escalations from Support now reach you with a severity tag, so you triage the urgent ones first." },
];

// ============================================================= component ====
export default function RoleEquilibrium() {
  const [started, setStarted] = useState(false);
  const [view, setView] = useState("system"); // system | personal
  const [roles, setRoles] = useState(SEED_ROLES);
  const [edges, setEdges] = useState(SEED_EDGES);

  const [selected, setSelected] = useState(null);
  const [rightMode, setRightMode] = useState("info"); // info | role | change | analysis

  const [change, setChange] = useState(null); // active scenario descriptor
  const [rippleStep, setRippleStep] = useState(0);
  const [migrations, setMigrations] = useState([]);
  const [notifications, setNotifications] = useState(null);
  const [notifState, setNotifState] = useState("idle"); // idle | loading | live | fallback
  const [analysis, setAnalysis] = useState(null);
  const [analysisState, setAnalysisState] = useState("idle"); // idle | loading | live | fallback

  const [timeline, setTimeline] = useState(SEED_TIMELINE);
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

  // ripple animation: reveal affected nodes one by one, under 3 seconds total
  useEffect(() => {
    if (!change) return;
    if (rippleStep >= change.affected.length) return;
    const t = setTimeout(() => setRippleStep((s) => s + 1), 460);
    return () => clearTimeout(t);
  }, [change, rippleStep]);

  const resetSystem = useCallback(() => {
    setRoles(SEED_ROLES);
    setEdges(SEED_EDGES);
    setChange(null);
    setRippleStep(0);
    setMigrations([]);
    setNotifications(null);
    setNotifState("idle");
    setSelected(null);
    setRightMode("info");
  }, []);

  const runScenario = useCallback(async (key) => {
    const sc = SCENARIOS[key];
    if (!sc) return;
    const token = ++runToken.current;

    const { roles: nextRoles, edges: nextEdges } = applyScenario(sc);
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

    // personal timeline: record if the persona is touched
    if (sc.affected.some((a) => a.id === PERSONA_ID)) {
      const line = personalLineFor(sc);
      if (line) setTimeline((t) => [line, ...t.filter((x) => x.title !== line.title)]);
    }

    // rebalancing suggestions (AI, fallback already shown)
    if (sc.newRoles && sc.newRoles.length && sc.migrations && sc.migrations.length) {
      aiRebalance(sc, nextRoles)
        .then((mg) => { if (runToken.current === token) setMigrations(mg); })
        .catch(() => {});
    }

    // notifications (AI, fallback on failure)
    try {
      const list = await aiNotifications(sc, nextRoles);
      if (runToken.current !== token) return;
      setNotifications(list);
      setNotifState("live");
    } catch {
      if (runToken.current !== token) return;
      setNotifications(sc.fallbackNotifications);
      setNotifState("fallback");
    }
  }, []);

  const analyze = useCallback(async () => {
    setView("system");
    setRightMode("analysis");
    setSelected(null);
    setAnalysisState("loading");
    setAnalysis(null);
    try {
      const res = await aiAnalyze(roles);
      setAnalysis(res);
      setAnalysisState("live");
    } catch {
      setAnalysis(ANALYSIS_FALLBACK);
      setAnalysisState("fallback");
    }
  }, [roles]);

  const openRole = (id) => {
    setSelected(id);
    setRightMode("role");
  };

  const persona = byId(roles, PERSONA_ID);

  // ---------------------------------------------------------------- render ---
  if (!started) {
    return (
      <div className="req-root">
        <style>{CSS}</style>
        <Landing
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
          <span className="req-kicker">Good Evil Club · probe</span>
          <h1>Role Equilibrium</h1>
        </div>

        <div className="req-toggle" role="tablist" aria-label="View">
          <button className={"tg" + (view === "system" ? " on" : "")} onClick={() => setView("system")}>System view</button>
          <button className={"tg" + (view === "personal" ? " on" : "")} onClick={() => setView("personal")}>My role</button>
        </div>

        <div className="req-actions">
          <button className="btn ghost" onClick={resetSystem}>Reset</button>
          <button className="btn" onClick={analyze}>Analyze system</button>
        </div>
      </header>

      {view === "system" ? (
        <div className="req-stage">
          <section className="req-canvas-wrap">
            <SystemMap
              roles={roles}
              edges={edges}
              selected={selected}
              onSelect={openRole}
              affectedIndex={affectedIndex}
              rippleActive={rippleActive}
            />
            <Legend />
            <div className="req-scenariobar">
              <span className="req-scenariobar-l">Run a change</span>
              {Object.values(SCENARIOS).map((s) => (
                <button key={s.key} className={"chipbtn" + (change && change.key === s.key ? " on" : "")}
                  onClick={() => runScenario(s.key)}>{s.label}</button>
              ))}
            </div>
          </section>

          <aside className="req-panel">
            {rightMode === "change" && change && (
              <ChangeRail
                change={change} roles={roles} migrations={migrations}
                notifications={notifications} notifState={notifState}
                rippleStep={rippleStep} onClose={resetSystem}
              />
            )}
            {rightMode === "role" && selected && (
              <RolePanel role={byId(roles, selected)} roles={roles} edges={edges} onClose={() => setRightMode("info")} />
            )}
            {rightMode === "analysis" && (
              <AnalysisPanel analysis={analysis} state={analysisState} roles={roles} onClose={() => setRightMode("info")} />
            )}
            {rightMode === "info" && (
              <InfoPanel onAnalyze={analyze} onScenario={runScenario} />
            )}
          </aside>
        </div>
      ) : (
        <PersonalView persona={persona} roles={roles} edges={edges} timeline={timeline} onBack={() => setView("system")} />
      )}
    </div>
  );
}

// personal timeline entries per scenario, for the persona (CSM)
function personalLineFor(sc) {
  if (sc.key === "split_cs") {
    return { when: "Just now", title: "Reporting line moved to Onboarding",
      meaning: "You now sit under the Head of Onboarding. Your accounts stay with you through onboarding, then hand to Retention at go live." };
  }
  return null;
}

// ------------------------------------------------------------- sub views ----
function Landing({ onScenario, onExplore }) {
  return (
    <div className="req-landing">
      <span className="req-kicker gold">Good Evil Club · probe</span>
      <h1 className="req-hero">Role Equilibrium</h1>
      <p className="req-pitch">Roles are a living system. Change one, and the rest have to move with it.</p>
      <p className="req-sub">
        A mid size company, fifteen roles, wired together by handoffs, dependencies, shared mandates and
        reporting lines. Run a change and watch which roles it touches, then read the notification each
        affected person would actually receive.
      </p>

      <div className="req-scenarios">
        <p className="req-eyebrow">Run a scenario</p>
        <div className="req-scenario-grid">
          {Object.values(SCENARIOS).map((s) => (
            <button key={s.key} className="scenariocard" onClick={() => onScenario(s.key)}>
              <span className="scenariocard-t">{s.label}</span>
              <span className="scenariocard-go">Run change →</span>
            </button>
          ))}
        </div>
        <button className="req-explore" onClick={onExplore}>Or explore the organization first</button>
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="req-legend">
      <span><i className="sw reports" /> reports to</span>
      <span><i className="sw handoff" /> handoff</span>
      <span><i className="sw dependency" /> dependency</span>
      <span><i className="sw shared" /> shared mandate</span>
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

function SystemMap({ roles, edges, selected, onSelect, affectedIndex, rippleActive }) {
  const NW = 158, NH = 60;
  const pos = useMemo(() => {
    const m = {};
    roles.forEach((r) => (m[r.id] = r));
    return m;
  }, [roles]);

  return (
    <svg viewBox="0 0 1520 860" className="req-canvas" preserveAspectRatio="xMidYMid meet">
      <defs>
        <pattern id="reqgrid" width="30" height="30" patternUnits="userSpaceOnUse">
          <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#efe7d80f" strokeWidth="1" />
        </pattern>
        {[["arrow-reports", "#4b4640"], ["arrow-handoff", "#E5643C"], ["arrow-dep", "#6C8CFF"]].map(([id, c]) => (
          <marker key={id} id={id} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 1 L 9 5 L 0 9" fill="none" stroke={c} strokeWidth="1.6" />
          </marker>
        ))}
      </defs>
      <rect x="0" y="0" width="1520" height="860" fill="url(#reqgrid)" />

      {/* edges */}
      {edges.map((e, i) => {
        const a = pos[e.from], b = pos[e.to];
        if (!a || !b || a.retired || b.retired) return null;
        const st = EDGE_STYLE[e.type];
        const g = edgePath(a, b);
        const hot = rippleActive(e.from) && rippleActive(e.to);
        return (
          <g key={"e" + i}>
            <path d={g.d} fill="none" stroke={hot ? "#E4B23C" : st.stroke} strokeWidth={hot ? st.width + 1 : st.width}
              strokeDasharray={st.dash} markerEnd={st.arrow === "none" ? undefined : `url(#${st.arrow})`}
              opacity={hot ? 1 : st.opacity} className={hot ? "req-edge hot" : "req-edge"} />
            {e.type === "shared" && (
              <g transform={`translate(${g.lx} ${g.ly})`}>
                <rect x={-56} y={-9} width={112} height={17} rx={4} fill="#1b1512" stroke="#D9492B" strokeWidth="0.8" />
                <text textAnchor="middle" y={3} className="req-edge-label" fill="#e8836e">shared mandate</text>
              </g>
            )}
          </g>
        );
      })}

      {/* nodes */}
      {roles.map((r) => {
        if (r.retired && !affectedIndex.has(r.id)) return null;
        const accent = DEPTS[r.dept] || "#8C99A6";
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
            <text x={16} y={26} className="req-node-title">{SHORT_TITLE[r.id] || r.title}</text>
            <text x={16} y={45} className="req-node-person">{r.person}</text>
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

function ChangeRail({ change, roles, migrations, notifications, notifState, rippleStep, onClose }) {
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
                <span className="req-msg-avatar" style={{ background: (to && DEPTS[to.dept]) || "#8C99A6" }}>
                  {to ? initials(to.person) : "?"}
                </span>
                <div>
                  <p className="req-msg-name">To: {to ? to.person : n.toId}</p>
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

function RolePanel({ role, roles, edges, onClose }) {
  if (!role) return null;
  const conns = edges
    .filter((e) => e.from === role.id || e.to === role.id)
    .map((e) => {
      const otherId = e.from === role.id ? e.to : e.from;
      const other = byId(roles, otherId);
      const dir = e.type === "reports" ? (e.from === role.id ? "reports to" : "manages") : e.type;
      return other ? { title: other.title, person: other.person, type: e.type, dir, label: e.label } : null;
    })
    .filter(Boolean);

  return (
    <div className="req-inner">
      <div className="req-inner-head">
        <span className="req-eyebrow" style={{ color: DEPTS[role.dept] }}>{role.dept}</span>
        <button className="req-x" onClick={onClose}>×</button>
      </div>
      <h2>{role.title}</h2>
      <p className="req-person">{role.person}</p>
      <p className="req-summary">{role.purpose}</p>

      <div className="req-block">
        <h3>Responsibilities</h3>
        <div className="req-chips">{role.resp.map((r) => <span key={r} className="chip">{r}</span>)}</div>
      </div>
      <div className="req-block">
        <h3>Mandates</h3>
        <div className="req-chips">{role.mandates.map((m) => <span key={m} className="chip mandate">{m}</span>)}</div>
      </div>
      <div className="req-block">
        <h3>Connections</h3>
        {conns.map((c, i) => (
          <div className="req-conn" key={i}>
            <span className={"req-conn-dot " + c.type} />
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

function InfoPanel({ onAnalyze, onScenario }) {
  return (
    <div className="req-inner">
      <span className="req-eyebrow gold">How to read this</span>
      <h2>The organization is a system</h2>
      <p className="req-summary">
        Every card is a role. The lines are how the roles depend on each other: reporting lines,
        handoffs, dependencies, and shared mandates. Two roles share the pricing exception mandate,
        and no role owns vendor offboarding. Run Analyze system to surface both.
      </p>
      <button className="btn wide" onClick={onAnalyze}>Analyze system</button>
      <div className="req-block">
        <h3>Run a change</h3>
        {Object.values(SCENARIOS).map((s) => (
          <button key={s.key} className="req-listbtn" onClick={() => onScenario(s.key)}>
            {s.label}<span>→</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function PersonalView({ persona, roles, edges, timeline, onBack }) {
  if (!persona) return null;
  const conns = edges
    .filter((e) => e.from === persona.id || e.to === persona.id)
    .map((e) => {
      const otherId = e.from === persona.id ? e.to : e.from;
      const other = byId(roles, otherId);
      const dir = e.type === "reports" ? (e.from === persona.id ? "reports to" : "manages") : e.type;
      return other ? { title: other.title, dir, type: e.type } : null;
    })
    .filter(Boolean);

  return (
    <div className="req-personal">
      <div className="req-personal-grid">
        <section className="req-me">
          <span className="req-eyebrow" style={{ color: DEPTS[persona.dept] }}>My role · {persona.dept}</span>
          <h2 className="req-me-title">{persona.title}</h2>
          <p className="req-person">{persona.person}</p>
          <p className="req-summary">{persona.purpose}</p>

          <div className="req-block">
            <h3>What I own</h3>
            <div className="req-chips">{persona.resp.map((r) => <span key={r} className="chip">{r}</span>)}</div>
          </div>
          <div className="req-block">
            <h3>My mandates</h3>
            <div className="req-chips">{persona.mandates.map((m) => <span key={m} className="chip mandate">{m}</span>)}</div>
          </div>
          <div className="req-block">
            <h3>Who I work with</h3>
            {conns.map((c, i) => (
              <div className="req-conn" key={i}>
                <span className={"req-conn-dot " + c.type} />
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
          <p className="req-tip">Run "Split Customer Success" in system view, then come back here to see the change land on this role.</p>
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
.req-pitch{font-family:var(--display); font-weight:600; font-size:clamp(20px,3vw,28px); color:var(--ink); margin:0 0 16px; letter-spacing:-.01em;}
.req-sub{color:#B3A99A; font-size:16px; line-height:1.6; max-width:60ch; margin:0 0 36px;}
.req-eyebrow{font-family:var(--mono); font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:var(--muted);}
.req-scenario-grid{display:grid; grid-template-columns:repeat(3,1fr); gap:14px; margin:12px 0 18px;}
.scenariocard{display:flex; flex-direction:column; justify-content:space-between; gap:26px; text-align:left;
  background:var(--panel); border:1px solid var(--hair); border-radius:14px; padding:20px 18px; cursor:pointer; transition:.16s; min-height:130px;}
.scenariocard:hover{border-color:var(--gold); transform:translateY(-2px);}
.scenariocard-t{font-family:var(--display); font-weight:700; font-size:19px; color:var(--ink); line-height:1.15;}
.scenariocard-go{font-family:var(--mono); font-size:12px; color:var(--gold); letter-spacing:.04em;}
.req-explore{background:none; border:none; color:var(--muted); font-family:var(--ui); font-size:14px; cursor:pointer; text-decoration:underline; text-underline-offset:3px; padding:4px 0;}
.req-explore:hover{color:var(--ink);}

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
.req-legend .sw{display:inline-block; width:18px; height:0; border-top-width:2px; border-top-style:solid; vertical-align:middle; margin-right:6px;}
.req-legend .sw.reports{border-color:#6b6459;}
.req-legend .sw.handoff{border-color:#E5643C;}
.req-legend .sw.dependency{border-color:#6C8CFF; border-top-style:dashed;}
.req-legend .sw.shared{border-color:#D9492B; border-top-width:3px;}
.req-legend .hint{margin-left:auto;}

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
.req-conn-dot{width:9px; height:9px; border-radius:50%; flex:none;}
.req-conn-dot.reports{background:#6b6459;}
.req-conn-dot.handoff{background:#E5643C;}
.req-conn-dot.dependency{background:#6C8CFF;}
.req-conn-dot.shared{background:#D9492B;}
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
  .req-panel{max-height:none;}
}
@media (prefers-reduced-motion:reduce){
  .req-ring,.req-msg,.req-dot{animation:none;}
}
`;
