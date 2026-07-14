/*
  ROLE EQUILIBRIUM · ORGANIZATION CONFIG SCHEMA
  ==================================================================
  Everything organization specific lives in a config object that
  matches the schema below. The engine (role-equilibrium.jsx) reads
  ONLY from a validated, normalized config, so a new organization is a
  new config, not new code. A future intake step where Claude drafts a
  config from pasted org material must produce exactly this shape, then
  pass it through loadConfig() like everything else.

  ------------------------------------------------------------------
  Config
    id            string   short identifier, unique per company
    name          string   company name shown to people
    kind          string   one line descriptor for the picker card
    blurb         string?  landing sub text (optional)
    infoNote      string?  one line on the seeded overlap and gap (optional)
    persona       roleId?  the role shown in "My role" (optional; if
                           absent, the personal view is hidden)
    layout        { width?, height? }?   map viewBox, defaults 1520x860

    domains       [ Domain ]     at least one, any names and colors
      Domain { id, name, color }

    edgeTypes     [ EdgeType ]   the connection vocabulary; the four
                                 below are this example's choices, not
                                 the engine's. Add your own freely.
      EdgeType {
        id, label,
        stroke?, width?, dash?, arrow?(bool), opacity?,  map line style
        legendColor?, legendWidth?,                       legend swatch
        mapLabel?(bool), mapLabelColor?,                  chip on the edge
        conn?,                                            word in role panels
        dir?: { from, to }                                directional wording
      }

    backbone      [ edgeTypeId ]   which edge types form the structural
                                   skeleton, used by the "backbone only"
                                   map filter. Optional.

    roles         [ Role ]
      Role {
        id, title, short?,        short is the map label if the title clips
        domain,                   must match a Domain id
        person? | owners?[],      one holder, or several (multiple owners)
        x, y,                     map coordinates
        purpose?, resp?[], mandates?[]
      }
      A role reports to more than one manager by having more than one
      "reports" style edge leaving it (dual reporting lines).

    edges         [ Edge ]
      Edge { from, to, type, label? }   from and to are role ids, type
                                        is an edgeType id

    analysisFallback { overlaps: [Overlap], gaps: [Gap] }?   shown if the
                                        AI analysis call is unavailable
      Overlap { roleIds:[roleId], area, explanation }
      Gap     { area, explanation }

    timelineSeed  [ { when, title, meaning } ]?   seeds the persona timeline

    scenarios     [ Scenario ]?   optional. A config with no scenarios
                                  still renders a working, explorable map.
      Scenario {
        id, label, summary,
        newRoles?[ Role + isNew:true ],
        newEdges?[ Edge ],
        removeEdges?[ { from, to, type? } ],
        retire?[ roleId ],
        migrations?[ { fromId, kind:"resp"|"mandates", item, reason? } ],
        affected: [ { id, reason } ],          drives the ripple order
        fallbackNotifications: [ { toId, subject, body } ],
        personalEntry?: { when, title, meaning }   added to the persona
                                  timeline when the persona is affected
      }

  Optional fields degrade gracefully. Required fields, and every cross
  reference between them, are checked by validateConfig, which returns
  plain language errors.
*/

// ---------------------------------------------------------------- validate ---
export function validateConfig(cfg) {
  const e = [];
  const isStr = (v) => typeof v === "string" && v.length > 0;
  const isNum = (v) => typeof v === "number" && !Number.isNaN(v);
  if (!cfg || typeof cfg !== "object") return { ok: false, errors: ["The config is empty or not an object."] };

  if (!isStr(cfg.id)) e.push('The config needs an "id" (a short text identifier).');
  if (!isStr(cfg.name)) e.push('The config needs a "name" (the company name shown to people).');

  const domainIds = new Set();
  if (!Array.isArray(cfg.domains) || cfg.domains.length === 0) {
    e.push('The config needs at least one domain in "domains".');
  } else cfg.domains.forEach((d, i) => {
    if (!isStr(d.id)) e.push(`Domain ${i + 1} is missing an "id".`);
    else { if (domainIds.has(d.id)) e.push(`Two domains share the id "${d.id}". Domain ids must be unique.`); domainIds.add(d.id); }
    if (!isStr(d.name)) e.push(`Domain "${d.id || i + 1}" is missing a "name".`);
    if (!isStr(d.color)) e.push(`Domain "${d.id || i + 1}" is missing a "color" (for example "#4F86C6").`);
  });

  const edgeIds = new Set();
  if (!Array.isArray(cfg.edgeTypes) || cfg.edgeTypes.length === 0) {
    e.push('The config needs at least one edge type in "edgeTypes".');
  } else cfg.edgeTypes.forEach((t, i) => {
    if (!isStr(t.id)) e.push(`Edge type ${i + 1} is missing an "id".`);
    else { if (edgeIds.has(t.id)) e.push(`Two edge types share the id "${t.id}". Edge type ids must be unique.`); edgeIds.add(t.id); }
    if (!isStr(t.label)) e.push(`Edge type "${t.id || i + 1}" is missing a "label" (the words shown in the legend).`);
  });

  const roleIds = new Set();
  if (!Array.isArray(cfg.roles) || cfg.roles.length === 0) {
    e.push('The config needs at least one role in "roles".');
  } else cfg.roles.forEach((r, i) => {
    const w = `Role "${r.id || i + 1}"`;
    if (!isStr(r.id)) e.push(`Role ${i + 1} is missing an "id".`);
    else { if (roleIds.has(r.id)) e.push(`Two roles share the id "${r.id}". Role ids must be unique.`); roleIds.add(r.id); }
    if (!isStr(r.title)) e.push(`${w} is missing a "title".`);
    if (!isStr(r.domain)) e.push(`${w} is missing a "domain".`);
    else if (!domainIds.has(r.domain)) e.push(`${w} points to domain "${r.domain}", but no domain with that id is defined.`);
    if (!isNum(r.x) || !isNum(r.y)) e.push(`${w} needs numeric "x" and "y" map coordinates.`);
  });

  if (!Array.isArray(cfg.edges)) e.push('The config needs an "edges" list (it can be empty).');
  else cfg.edges.forEach((ed, i) => {
    const w = `Edge ${i + 1} (${ed.from || "?"} to ${ed.to || "?"})`;
    if (!roleIds.has(ed.from)) e.push(`${w} starts at role "${ed.from}", which does not exist.`);
    if (!roleIds.has(ed.to)) e.push(`${w} ends at role "${ed.to}", which does not exist.`);
    if (!edgeIds.has(ed.type)) e.push(`${w} uses edge type "${ed.type}", which is not defined in edgeTypes.`);
  });

  if (cfg.persona != null && !roleIds.has(cfg.persona))
    e.push(`The persona "${cfg.persona}" is not one of the defined roles.`);

  (cfg.backbone || []).forEach((t) => {
    if (!edgeIds.has(t)) e.push(`Backbone lists edge type "${t}", which is not defined in edgeTypes.`);
  });

  (cfg.scenarios || []).forEach((s, i) => {
    const sw = `Scenario "${s.id || i + 1}"`;
    if (!isStr(s.id)) e.push(`Scenario ${i + 1} is missing an "id".`);
    if (!isStr(s.label)) e.push(`${sw} is missing a "label".`);
    if (!isStr(s.summary)) e.push(`${sw} is missing a "summary".`);
    const created = new Set((s.newRoles || []).map((r) => r.id));
    const known = (id) => roleIds.has(id) || created.has(id);
    (s.newRoles || []).forEach((r, j) => {
      if (!isStr(r.id)) e.push(`${sw} newRole ${j + 1} is missing an "id".`);
      if (!isStr(r.domain) || !domainIds.has(r.domain)) e.push(`${sw} newRole "${r.id}" points to domain "${r.domain}", which is not defined.`);
    });
    if (!Array.isArray(s.affected) || s.affected.length === 0) e.push(`${sw} needs an "affected" list so the ripple has something to show.`);
    (s.affected || []).forEach((a) => { if (!known(a.id)) e.push(`${sw} marks role "${a.id}" as affected, but it is neither an existing role nor created by this scenario.`); });
    (s.migrations || []).forEach((m) => {
      if (!known(m.fromId)) e.push(`${sw} migrates work from role "${m.fromId}", which does not exist.`);
      if (m.kind !== "resp" && m.kind !== "mandates") e.push(`${sw} migration for "${m.item}" has kind "${m.kind}"; it must be "resp" or "mandates".`);
    });
    (s.newEdges || []).forEach((ed) => {
      if (!known(ed.from) || !known(ed.to)) e.push(`${sw} adds an edge from "${ed.from}" to "${ed.to}", referencing a role that does not exist.`);
      if (!edgeIds.has(ed.type)) e.push(`${sw} adds an edge of type "${ed.type}", which is not defined in edgeTypes.`);
    });
    (s.fallbackNotifications || []).forEach((n) => { if (!known(n.toId)) e.push(`${sw} has a notification to "${n.toId}", which is not a role in this scenario.`); });
    if (!Array.isArray(s.fallbackNotifications) || s.fallbackNotifications.length === 0) e.push(`${sw} needs at least one fallback notification so the demo works without the AI.`);
  });

  return { ok: e.length === 0, errors: e };
}

// --------------------------------------------------------------- normalize ---
// Fills defaults so the engine can assume every field is present.
export function normalizeConfig(raw) {
  const c = JSON.parse(JSON.stringify(raw));
  c.domains = c.domains || [];
  c.roles = c.roles || [];
  c.edges = c.edges || [];
  c.scenarios = c.scenarios || [];
  c.timelineSeed = c.timelineSeed || [];
  c.backbone = c.backbone || [];
  c.layout = { width: 1520, height: 860, ...(c.layout || {}) };

  c.edgeTypes = (c.edgeTypes || []).map((t) => ({
    dash: "none", arrow: false, opacity: 1, width: 1.5, ...t,
    legendColor: t.legendColor || t.stroke || "#8C8375",
    legendWidth: t.legendWidth || 2,
    conn: t.conn || t.id,
  }));

  c.roles = c.roles.map(normRole);
  c._domainById = Object.fromEntries(c.domains.map((d) => [d.id, d]));
  c._edgeTypeById = Object.fromEntries(c.edgeTypes.map((t) => [t.id, t]));
  return c;
}

// A role always has resp, mandates, and a people array after normalization.
export function normRole(r) {
  return {
    resp: [], mandates: [], ...r,
    people: r.owners && r.owners.length ? r.owners : r.person ? [r.person] : [],
  };
}

export function loadConfig(raw) {
  const { ok, errors } = validateConfig(raw);
  if (!ok) return { ok: false, errors };
  return { ok: true, config: normalizeConfig(raw) };
}

// ================================================================ COMPANIES ==
// Company one: the original SaaS org, extracted field for field so the
// demo is identical to before the refactor.
const northlight = {
  id: "northlight",
  name: "Northlight",
  kind: "SaaS company, 15 roles",
  blurb:
    "A mid size company, fifteen roles, wired together by handoffs, dependencies, shared mandates and reporting lines. Run a change and watch which roles it touches, then read the notification each affected person would actually receive.",
  infoNote:
    "Two roles share the pricing exception mandate, and no role owns vendor offboarding. Run Analyze system to surface both.",
  persona: "csm",
  domains: [
    { id: "lead", name: "Leadership", color: "#E4B23C" },
    { id: "product", name: "Product", color: "#6C8CFF" },
    { id: "eng", name: "Engineering", color: "#35B597" },
    { id: "sales", name: "Sales", color: "#E5643C" },
    { id: "cs", name: "Customer Success", color: "#B06CE0" },
    { id: "ops", name: "Operations", color: "#8C99A6" },
  ],
  edgeTypes: [
    { id: "reports", label: "reports to", stroke: "#4b4640", width: 1.3, dash: "none", arrow: true, opacity: 0.6, legendColor: "#6b6459", legendWidth: 2, conn: "reports", dir: { from: "reports to", to: "manages" } },
    { id: "handoff", label: "handoff", stroke: "#E5643C", width: 2, dash: "none", arrow: true, opacity: 0.95, legendWidth: 2 },
    { id: "dependency", label: "dependency", stroke: "#6C8CFF", width: 1.7, dash: "6 6", arrow: true, opacity: 0.9, legendWidth: 2 },
    { id: "shared", label: "shared mandate", stroke: "#D9492B", width: 2.6, dash: "none", arrow: false, opacity: 1, legendWidth: 3, mapLabel: true, mapLabelColor: "#e8836e" },
  ],
  backbone: ["reports"],
  roles: [
    { id: "ceo", title: "CEO", person: "Astrid Ek", domain: "lead", x: 760, y: 92,
      purpose: "Sets company direction and owns the executive team.",
      resp: ["Company strategy", "Executive hiring", "Board relationship", "Capital allocation", "Culture"],
      mandates: ["Final say on annual budget", "Approve executive hires"] },
    { id: "vp_product", title: "VP Product", person: "Johan Nystrom", domain: "product", x: 210, y: 272,
      purpose: "Owns what the company builds and why.",
      resp: ["Product strategy", "Roadmap", "AI feature roadmap", "Pricing input", "Discovery"],
      mandates: ["Approve the roadmap", "Prioritize releases"] },
    { id: "vp_eng", title: "VP Engineering", person: "Priya Rao", domain: "eng", x: 520, y: 272,
      purpose: "Owns how the product is built and shipped.",
      resp: ["Engineering strategy", "Architecture", "Delivery", "Hiring engineers", "Security"],
      mandates: ["Approve model deployments", "Approve technical standards"] },
    { id: "head_sales", title: "Head of Sales", person: "Erik Lund", domain: "sales", x: 760, y: 272,
      purpose: "Owns revenue and the sales team.",
      resp: ["Sales strategy", "Pipeline", "Forecasting", "Key accounts", "Partnerships"],
      mandates: ["Approve pricing exceptions", "Own list price and discount policy"] },
    { id: "head_cs", title: "Head of Customer Success", short: "Head of CS", person: "Sofia Berg", domain: "cs", x: 1060, y: 272,
      purpose: "Owns customer retention and expansion.",
      resp: ["Retention", "Expansion", "Onboarding", "Customer health", "Advocacy"],
      mandates: ["Approve save offers", "Set health scoring"] },
    { id: "head_ops", title: "Head of Operations", person: "Markus Holm", domain: "ops", x: 1350, y: 272,
      purpose: "Owns internal operations and vendors.",
      resp: ["Operations", "Vendor onboarding", "Vendor contracts", "Tooling", "Facilities"],
      mandates: ["Approve vendor spend", "Own procurement policy"] },
    { id: "pm", title: "Product Manager", person: "Lena Falk", domain: "product", x: 120, y: 502,
      purpose: "Turns strategy into shipped product.",
      resp: ["Requirements", "Backlog", "Release notes", "Customer interviews", "Metrics"],
      mandates: ["Prioritize the backlog"] },
    { id: "designer", title: "Product Designer", person: "Oskar Vik", domain: "product", x: 296, y: 502,
      purpose: "Owns the product experience.",
      resp: ["UX flows", "Visual design", "Prototypes", "Design system"],
      mandates: ["Approve final design"] },
    { id: "eng_mgr", title: "Engineering Manager", short: "Eng Manager", person: "David Sund", domain: "eng", x: 472, y: 502,
      purpose: "Runs the engineering team day to day.",
      resp: ["Sprint planning", "Code review", "Delivery", "One on ones", "Incident response"],
      mandates: ["Approve production releases"] },
    { id: "senior_eng", title: "Senior Engineer", person: "Nina Ali", domain: "eng", x: 472, y: 700,
      purpose: "Builds core systems.",
      resp: ["Implementation", "Architecture input", "Model evaluation", "Code review", "Mentoring"],
      mandates: ["Approve merges to main"] },
    { id: "ae", title: "Account Executive", short: "Account Exec", person: "Tomas Ek", domain: "sales", x: 648, y: 502,
      purpose: "Closes new business.",
      resp: ["Prospecting", "Demos", "Negotiation", "Closing", "Handoff to Customer Success"],
      mandates: ["Commit deal terms within policy"] },
    { id: "sales_ops", title: "Sales Operations Analyst", short: "Sales Ops Analyst", person: "Hanna Ek", domain: "sales", x: 824, y: 502,
      purpose: "Keeps the sales engine running.",
      resp: ["Pipeline hygiene", "Reporting", "Deal desk", "Quota tracking"],
      mandates: ["Approve pricing exceptions", "Own CRM data quality"] },
    { id: "csm", title: "Customer Success Manager", short: "CS Manager", person: "Maja Lind", domain: "cs", x: 1000, y: 502,
      purpose: "Owns a book of customers after the sale.",
      resp: ["Onboarding", "Adoption", "Quarterly reviews", "Renewal prep", "Escalation triage"],
      mandates: ["Own the renewal recommendation"] },
    { id: "support_lead", title: "Support Lead", person: "Felix Strom", domain: "cs", x: 1176, y: 502,
      purpose: "Owns customer support quality.",
      resp: ["Ticket triage", "Service levels", "Escalations", "Knowledge base"],
      mandates: ["Set support priority"] },
    { id: "ops_mgr", title: "Operations Manager", short: "Ops Manager", person: "Ida Nilsson", domain: "ops", x: 1352, y: 502,
      purpose: "Runs operations day to day.",
      resp: ["Vendor onboarding", "Contract tracking", "Tooling admin", "Reporting"],
      mandates: ["Approve tooling under budget"] },
  ],
  edges: [
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
    { from: "ae", to: "csm", type: "handoff", label: "deal handoff" },
    { from: "pm", to: "eng_mgr", type: "handoff", label: "spec handoff" },
    { from: "pm", to: "senior_eng", type: "dependency", label: "feasibility" },
    { from: "csm", to: "pm", type: "dependency", label: "product feedback" },
    { from: "designer", to: "pm", type: "dependency", label: "decisions" },
    { from: "ae", to: "sales_ops", type: "dependency", label: "deal desk" },
    { from: "ops_mgr", to: "vp_eng", type: "dependency", label: "tooling" },
    { from: "head_sales", to: "sales_ops", type: "shared", label: "pricing exceptions" },
  ],
  analysisFallback: {
    overlaps: [
      { roleIds: ["head_sales", "sales_ops"], area: "Pricing exceptions",
        explanation: "Both the Head of Sales and the Sales Operations Analyst list approval of pricing exceptions as a mandate. A deal can be approved twice, or slip between them while each assumes the other has it." },
    ],
    gaps: [
      { area: "Vendor offboarding",
        explanation: "Vendor onboarding and contracts sit with Operations, but no role owns offboarding. Contracts can auto renew or lapse with no one accountable for closing them out." },
    ],
  },
  timelineSeed: [
    { when: "Last quarter", title: "Support escalation path clarified",
      meaning: "Escalations from Support now reach you with a severity tag, so you triage the urgent ones first." },
  ],
  scenarios: [
    {
      id: "add_ai",
      label: "Add a Head of AI role",
      summary: "A Head of AI role is added to Leadership. It takes ownership of model governance and the AI roadmap, which today are split across Engineering and Product.",
      newRoles: [
        { id: "head_ai", title: "Head of AI", person: "Vacant, open req", domain: "lead", x: 980, y: 150, isNew: true,
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
        { fromId: "vp_eng", kind: "mandates", item: "Approve model deployments", reason: "Model risk gets a dedicated owner" },
        { fromId: "vp_product", kind: "resp", item: "AI feature roadmap", reason: "AI roadmap consolidates under one role" },
        { fromId: "senior_eng", kind: "resp", item: "Model evaluation", reason: "Evaluation standards centralize" },
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
    {
      id: "split_cs",
      label: "Split Customer Success",
      summary: "Customer Success splits into Onboarding and Retention. Two focused leads replace one Head of Customer Success, and the reporting lines and the sales handoff move to the new owners.",
      newRoles: [
        { id: "head_onboarding", title: "Head of Onboarding", person: "Sofia Berg", domain: "cs", x: 980, y: 150, isNew: true,
          purpose: "Owns the first 90 days of every new customer.",
          resp: ["Onboarding playbook", "Time to value", "Implementation quality"],
          mandates: ["Approve onboarding scope"] },
        { id: "head_retention", title: "Head of Retention", person: "Vacant, open req", domain: "cs", x: 1200, y: 150, isNew: true,
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
      personalEntry: { when: "Just now", title: "Reporting line moved to Onboarding",
        meaning: "You now sit under the Head of Onboarding. Your accounts stay with you through onboarding, then hand to Retention at go live." },
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
    {
      id: "move_mandate",
      label: "Move a mandate between roles",
      summary: "Approval of pricing exceptions moves from the Head of Sales to the Sales Operations Analyst. This closes the overlap where two roles both owned it.",
      removeEdges: [{ from: "head_sales", to: "sales_ops", type: "shared" }],
      migrations: [
        { fromId: "head_sales", kind: "mandates", item: "Approve pricing exceptions", reason: "One clear owner for exceptions" },
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
  ],
};

// Company two: a regional bank. Deliberately different domains and
// colors, a custom "regulatory oversight" edge type, its own overlap
// (two roles approving lending exceptions), gap (model validation), a
// role with two owners, a dual reporting line, and one scenario.
const ostkustBank = {
  id: "ostkust",
  name: "Ostkust Bank",
  kind: "Regional bank, 14 roles",
  blurb:
    "A regional bank, fourteen roles across retail, commercial lending, treasury, risk and operations, wired by reporting lines, handoffs, dependencies and regulatory oversight. Run a change and read the notification each person would receive.",
  infoNote:
    "The Head of Commercial Lending and the Chief Risk Officer both approve exceptions to lending policy, and no role owns model validation. Run Analyze system to surface both.",
  persona: "compliance",
  domains: [
    { id: "exec", name: "Executive", color: "#E4B23C" },
    { id: "retail", name: "Retail Banking", color: "#4F86C6" },
    { id: "commercial", name: "Commercial Lending", color: "#2FA98C" },
    { id: "risk", name: "Risk and Compliance", color: "#C0433B" },
    { id: "treasury", name: "Treasury", color: "#9B6BD6" },
    { id: "ops", name: "Operations", color: "#7C8894" },
  ],
  edgeTypes: [
    { id: "reports", label: "reports to", stroke: "#4b4640", width: 1.3, dash: "none", arrow: true, opacity: 0.6, legendColor: "#6b6459", legendWidth: 2, conn: "reports", dir: { from: "reports to", to: "manages" } },
    { id: "handoff", label: "handoff", stroke: "#4F86C6", width: 2, dash: "none", arrow: true, opacity: 0.95, legendWidth: 2 },
    { id: "dependency", label: "dependency", stroke: "#9B6BD6", width: 1.7, dash: "6 6", arrow: true, opacity: 0.9, legendWidth: 2 },
    { id: "oversight", label: "regulatory oversight", stroke: "#C0433B", width: 1.9, dash: "2 6", arrow: true, opacity: 0.95, legendWidth: 2, conn: "oversees" },
    { id: "shared", label: "shared mandate", stroke: "#D98C2B", width: 2.6, dash: "none", arrow: false, opacity: 1, legendWidth: 3, mapLabel: true, mapLabelColor: "#e8b25e" },
  ],
  backbone: ["reports", "oversight"],
  roles: [
    { id: "ceo_bank", title: "CEO", person: "Ingrid Sundberg", domain: "exec", x: 760, y: 92,
      purpose: "Sets the bank's direction and owns the executive team.",
      resp: ["Bank strategy", "Executive hiring", "Board relationship", "Capital planning"],
      mandates: ["Approve the annual plan", "Approve executive hires"] },
    { id: "cro", title: "Chief Risk Officer", short: "CRO", person: "Anders Holm", domain: "risk", x: 200, y: 272,
      purpose: "Owns the risk appetite and independent risk oversight.",
      resp: ["Risk appetite", "Credit risk oversight", "Financial crime risk", "Regulatory relationship"],
      mandates: ["Approve exceptions to lending policy", "Approve high risk onboarding", "Own risk appetite"] },
    { id: "head_retail", title: "Head of Retail Banking", short: "Retail Head", person: "Bengt Akesson", domain: "retail", x: 470, y: 272,
      purpose: "Owns the branch network and retail customers.",
      resp: ["Branch network", "Retail products", "Deposit growth", "Customer experience"],
      mandates: ["Approve retail product changes", "Set branch targets"] },
    { id: "head_commercial", title: "Head of Commercial Lending", short: "Commercial Head", person: "Nils Berg", domain: "commercial", x: 830, y: 272,
      purpose: "Owns business lending and the commercial book.",
      resp: ["Commercial lending", "Portfolio quality", "Sector strategy", "Pricing"],
      mandates: ["Approve exceptions to lending policy", "Set commercial credit strategy"] },
    { id: "head_treasury", title: "Head of Treasury", short: "Treasury Head", person: "Eva Strom", domain: "treasury", x: 1100, y: 272,
      purpose: "Owns liquidity, funding, and market risk.",
      resp: ["Liquidity", "Funding", "Interest rate risk", "Investment book"],
      mandates: ["Approve funding plan", "Set hedging policy"] },
    { id: "head_ops_bank", title: "Head of Operations", short: "Ops Head", person: "Ulla Nyberg", domain: "ops", x: 1330, y: 272,
      purpose: "Owns processing, payments, and vendors.",
      resp: ["Payments processing", "Account servicing", "Vendor management", "Business continuity"],
      mandates: ["Approve process changes", "Approve vendor spend"] },
    { id: "compliance", title: "Compliance Officer", short: "Compliance", person: "Lena Ohlsson", domain: "risk", x: 200, y: 502,
      purpose: "Owns regulatory compliance and conduct.",
      resp: ["Regulatory reporting", "AML monitoring", "Conduct rules", "Policy attestation"],
      mandates: ["Sign off on regulatory returns"] },
    { id: "branch_mgr", title: "Branch Manager", person: "Karin Falk", domain: "retail", x: 400, y: 502,
      purpose: "Runs a branch and its team.",
      resp: ["Branch operations", "Local targets", "Staff scheduling", "Cash handling"],
      mandates: ["Approve retail loans within limit"] },
    { id: "retail_advisor", title: "Retail Advisor", person: "Sara Lund", domain: "retail", x: 580, y: 502,
      purpose: "Serves retail customers day to day.",
      resp: ["Account opening", "Product advice", "Mortgage intake", "Customer queries"],
      mandates: ["Recommend within product rules"] },
    { id: "credit_analyst", title: "Credit Analyst", person: "Pia Ek", domain: "commercial", x: 780, y: 502,
      purpose: "Assesses commercial credit applications.",
      resp: ["Credit assessment", "Financial analysis", "Covenant checks", "Annual reviews"],
      mandates: ["Recommend credit decisions"] },
    { id: "relationship_mgr", title: "Relationship Manager", short: "Relationship Mgr", person: "Johan Dahl", domain: "commercial", x: 960, y: 502,
      purpose: "Owns commercial client relationships.",
      resp: ["Client relationships", "Deal origination", "Portfolio growth", "Loan handoff"],
      mandates: ["Commit terms within mandate"] },
    { id: "liquidity_analyst", title: "Liquidity Analyst", short: "Liquidity", owners: ["Mats Ek", "Sofia Nyman"], domain: "treasury", x: 1140, y: 502,
      purpose: "Monitors liquidity and funding positions.",
      resp: ["Liquidity monitoring", "Cash forecasting", "Regulatory ratios", "Stress testing"],
      mandates: ["Flag limit breaches"] },
    { id: "ops_analyst", title: "Operations Analyst", short: "Ops Analyst", person: "Tobias Holm", domain: "ops", x: 1330, y: 502,
      purpose: "Runs payment and settlement operations.",
      resp: ["Payment processing", "Settlement", "Reconciliation", "Vendor onboarding"],
      mandates: ["Approve settlement exceptions within limit"] },
  ],
  edges: [
    { from: "cro", to: "ceo_bank", type: "reports" },
    { from: "head_retail", to: "ceo_bank", type: "reports" },
    { from: "head_commercial", to: "ceo_bank", type: "reports" },
    { from: "head_treasury", to: "ceo_bank", type: "reports" },
    { from: "head_ops_bank", to: "ceo_bank", type: "reports" },
    { from: "compliance", to: "cro", type: "reports" },
    { from: "branch_mgr", to: "head_retail", type: "reports" },
    { from: "branch_mgr", to: "head_ops_bank", type: "reports" },
    { from: "retail_advisor", to: "branch_mgr", type: "reports" },
    { from: "credit_analyst", to: "head_commercial", type: "reports" },
    { from: "relationship_mgr", to: "head_commercial", type: "reports" },
    { from: "liquidity_analyst", to: "head_treasury", type: "reports" },
    { from: "ops_analyst", to: "head_ops_bank", type: "reports" },
    { from: "relationship_mgr", to: "credit_analyst", type: "handoff", label: "loan handoff" },
    { from: "branch_mgr", to: "ops_analyst", type: "handoff", label: "account opening" },
    { from: "credit_analyst", to: "cro", type: "dependency", label: "risk model" },
    { from: "liquidity_analyst", to: "head_ops_bank", type: "dependency", label: "settlement" },
    { from: "retail_advisor", to: "compliance", type: "dependency", label: "KYC guidance" },
    { from: "compliance", to: "head_retail", type: "oversight", label: "conduct" },
    { from: "compliance", to: "head_commercial", type: "oversight", label: "conduct" },
    { from: "cro", to: "head_treasury", type: "oversight", label: "market risk" },
    { from: "head_commercial", to: "cro", type: "shared", label: "lending exceptions" },
  ],
  analysisFallback: {
    overlaps: [
      { roleIds: ["head_commercial", "cro"], area: "Lending policy exceptions",
        explanation: "The Head of Commercial Lending and the Chief Risk Officer both hold approval of exceptions to lending policy. A borderline deal can be approved by the business without independent risk sign off, or stall while each waits for the other." },
    ],
    gaps: [
      { area: "Model validation",
        explanation: "Credit scoring models are built and used across lending, but no role owns independent validation. A model can drift or misprice risk with no one accountable for catching it." },
    ],
  },
  timelineSeed: [
    { when: "Last year", title: "Sanctions screening centralized",
      meaning: "Screening moved to a shared platform, so you review the flags it raises rather than running the scans yourself." },
  ],
  scenarios: [
    {
      id: "add_fincrime",
      label: "Add a Head of Financial Crime",
      summary: "A Head of Financial Crime is added under Risk and Compliance. It takes anti financial crime work out of Compliance and high risk onboarding sign off out of the CRO, and opens oversight lines into Retail and Commercial.",
      newRoles: [
        { id: "head_fc", title: "Head of Financial Crime", short: "Fin Crime Head", person: "Vacant, open req", domain: "risk", x: 980, y: 150, isNew: true,
          purpose: "Owns anti financial crime across the bank.",
          resp: ["AML monitoring", "Sanctions strategy", "SAR reporting", "Financial crime training"],
          mandates: ["Approve high risk onboarding", "Sign off on SAR filings"] },
      ],
      newEdges: [
        { from: "head_fc", to: "cro", type: "reports" },
        { from: "head_fc", to: "head_retail", type: "oversight", label: "AML oversight" },
        { from: "head_fc", to: "head_commercial", type: "oversight", label: "AML oversight" },
        { from: "compliance", to: "head_fc", type: "dependency", label: "case handoff" },
      ],
      migrations: [
        { fromId: "compliance", kind: "resp", item: "AML monitoring", reason: "AML gets a dedicated owner" },
        { fromId: "cro", kind: "mandates", item: "Approve high risk onboarding", reason: "Onboarding risk centralizes" },
      ],
      affected: [
        { id: "head_fc", reason: "New role created" },
        { id: "compliance", reason: "AML work moves out" },
        { id: "cro", reason: "Onboarding sign off moves" },
        { id: "head_retail", reason: "New oversight line" },
        { id: "head_commercial", reason: "New oversight line" },
      ],
      personalEntry: { when: "Just now", title: "Financial crime work moves to a new owner",
        meaning: "AML monitoring moves to the Head of Financial Crime. You keep general compliance and the regulator relationship, with less day to day casework." },
      fallbackNotifications: [
        { toId: "compliance", subject: "AML monitoring moves to Financial Crime",
          body: "Lena, with the new Head of Financial Crime, day to day AML monitoring moves off your desk. You keep regulatory reporting, conduct, and the regulator relationship. Cases now route to the Financial Crime team, and you stay the escalation point for conduct matters." },
        { toId: "cro", subject: "High risk onboarding sign off moves",
          body: "Anders, approval of high risk onboarding moves from you to the Head of Financial Crime. You keep risk appetite and credit risk oversight. This puts onboarding decisions next to the people running the monitoring, and reduces the queue waiting on your desk." },
        { toId: "head_retail", subject: "A new oversight line into Retail",
          body: "Bengt, the Head of Financial Crime will have an oversight line into Retail for anti financial crime. Nothing changes in your reporting to the CEO. Expect onboarding checks on high risk retail customers to route through the new team." },
        { toId: "head_commercial", subject: "A new oversight line into Commercial",
          body: "Nils, the Head of Financial Crime gains an oversight line into Commercial Lending. Your lending decisions are unchanged. High risk client onboarding now gets a financial crime sign off before it completes." },
      ],
    },
  ],
};

export const COMPANIES = [northlight, ostkustBank];
