// ============================================================
// THE IRREDUCIBLE STACK — catalogue
// The single human-editable source of truth for the whole tool:
// capability layers, slots, the readiness rubric, tool cards, the
// dependency graph, and the industry templates.
//
// Add a tool by adding one CARD. Add a starting point by adding one
// TEMPLATE. Nothing else in the app hard-codes a product name.
//
// NOTE ON VOICE: every `rationale` and `blurb` is GoodEvil copy.
// Direct, contrast-driven, no em dashes, no hedging. One sentence.
// ============================================================

// ---- Postures --------------------------------------------------------------
// The three ways to fill a slot. The thesis is that generate+own should grow,
// but the rubric below decides whether that is earned, not the thesis.
export type Posture = "buy" | "generate" | "own";
//   buy      = rent it as SaaS, someone else runs it and prices it
//   generate = you generated it and own it as versioned code in your repo
//   own      = you self-host it, managed as infrastructure-as-code

// ---- Readiness criteria ----------------------------------------------------
// AI readiness is measurable, not a vibe. Six criteria, each scored 0-5.
// Every criterion is higher-is-better. `operationalBurden` is phrased so a
// high score means LOW burden, keeping it aligned with the other five.
export type Criterion =
  | "openApi"
  | "dataPortability"
  | "agentOperability"
  | "integrationSurface"
  | "automationCostModel"
  | "operationalBurden";

export const CRITERIA: { id: Criterion; label: string; short: string; question: string }[] = [
  { id: "openApi",             label: "Open API",             short: "API",         question: "Is there a documented, self-serve API covering the real product surface?" },
  { id: "dataPortability",     label: "Data portability",     short: "Portability", question: "Can you get all your data out, in an open format, without a fight?" },
  { id: "agentOperability",    label: "Agent operability",    short: "Agent ops",   question: "Can an autonomous agent drive it end to end, not just a human?" },
  { id: "integrationSurface",  label: "Integration surface",  short: "Integration", question: "How many first-class ways does it connect to the stack, MCP included?" },
  { id: "automationCostModel", label: "Cost survives automation", short: "Cost",    question: "When usage goes up 100x under automation, does the price stay sane?" },
  { id: "operationalBurden",   label: "Operational burden",   short: "Ops",         question: "Who keeps it running, who fixes it at 2am, and what happens when the builder leaves?" },
];

// ---- Scoring rubric --------------------------------------------------------
// Read this before scoring a card. 5 / 3 / 1 are the defensible anchors;
// 4 / 2 / 0 interpolate. The score has to trace to a sentence here, because
// the composite is the thing users will argue with.
export const RUBRIC: Record<Criterion, { a5: string; a3: string; a1: string }> = {
  openApi: {
    a5: "Full public REST or GraphQL over the whole product, self-serve keys, versioned, webhooks, open spec. No sales call.",
    a3: "Public API covers the common cases but has gaps, some actions are UI-only, access is tiered or rate-limited.",
    a1: "API is enterprise-tier only, partial, undocumented, or gated behind a partnership.",
  },
  dataPortability: {
    a5: "One-click or scriptable full export in open formats, or the data simply is yours because you host it.",
    a3: "Export exists but is partial, misses history or attachments, or is a proprietary format you must reshape.",
    a1: "Export is a thin CSV, support-ticket-gated, or leaves the data that actually matters behind.",
  },
  agentOperability: {
    a5: "Machine-first: service-account auth, deterministic idempotent actions, structured read-back, no CAPTCHA, a sandbox exists.",
    a3: "Scriptable with friction: human OAuth dances, some steps need the UI, responses are unstructured and brittle.",
    a1: "Effectively human-only, so automating it means scraping a browser and hoping.",
  },
  integrationSurface: {
    a5: "Ships an MCP server or equivalent agent-native surface, plus broad native integrations, webhooks, and events. It is a hub.",
    a3: "A solid catalogue of native integrations and webhooks, but no agent-native surface, so you glue it with Zapier-grade tape.",
    a1: "A handful of one-directional integrations and no webhooks, so it barely talks to anything.",
  },
  automationCostModel: {
    a5: "Flat, capacity-priced, or self-hosted, so driving it 100x harder costs you close to nothing extra.",
    a3: "Usage-based but linear and predictable, so automation raises cost in proportion, not in punishment.",
    a1: "Per-seat that counts bots as seats, or per-action pricing that spikes the moment you automate.",
  },
  operationalBurden: {
    a5: "A vendor runs it with an SLA and an on-call team that is not you, so patches and 2am pages are their problem and no one person is the point of failure.",
    a3: "A well-trodden self-host with community support and a documented runbook, so you own uptime but the path is known and the knowledge is shared.",
    a1: "Bespoke or lightly owned code that only its author understands, so you are the on-call, the patch, and the single point of failure when they leave.",
  },
};

// Composite math (implemented in derive.ts, documented here so the file is
// self-contained). cardTotal = sum of the 6 criteria (0-30). The number is
// deliberately SECONDARY. The card panel leads with the six-axis profile and
// the stack readout leads with the strongest and weakest axis, because
// "strong on agent operability, weak on data portability" is the useful
// sentence, not "73/100". slotReadiness = cardTotal / 30. layerReadiness =
// mean of its filled slots. The small composite = 100 * weighted mean of
// layerReadiness using the active template weights.

// ---- Capability layers and slots -------------------------------------------
// Seven layers, twenty-nine slots. Every required slot must be filled for the
// company to function. That is what irreducible means, and the dependency
// graph below makes it testable.
export type LayerId =
  | "identity" | "data" | "comms" | "build" | "intelligence" | "surface" | "money";

export interface Slot { id: string; label: string; required?: boolean }
export interface Layer { id: LayerId; name: string; blurb: string; grad: [string, string]; slots: Slot[] }

export const LAYERS: Layer[] = [
  {
    id: "identity", name: "Identity & Security", grad: ["#E2553A", "#B5301B"],
    blurb: "Who is allowed to do what. Get this wrong and nothing else matters.",
    slots: [
      { id: "sso",              label: "SSO",               required: true },
      { id: "accessControl",    label: "Access control" },
      { id: "secrets",          label: "Secrets" },
      { id: "deviceManagement", label: "Device management" },
    ],
  },
  {
    id: "data", name: "Data & Knowledge", grad: ["#2F9FA8", "#177A80"],
    blurb: "What the company knows and where it keeps it.",
    slots: [
      { id: "storage",       label: "Storage",        required: true },
      { id: "database",      label: "Database",       required: true },
      { id: "knowledgeBase", label: "Knowledge base" },
      { id: "search",        label: "Search" },
      { id: "dataPipeline",  label: "Data pipeline" },
    ],
  },
  {
    id: "comms", name: "Communication & Coordination", grad: ["#3E7BD6", "#27509E"],
    blurb: "How work talks to itself and decides what happens next.",
    slots: [
      { id: "messaging",         label: "Messaging",  required: true },
      { id: "meetings",          label: "Meetings" },
      { id: "projectManagement", label: "Project management" },
      { id: "docs",              label: "Docs" },
    ],
  },
  {
    id: "build", name: "Build & Deploy", grad: ["#2FA86A", "#177A48"],
    blurb: "How code becomes something running in the world.",
    slots: [
      { id: "versionControl", label: "Version control", required: true },
      { id: "cicd",           label: "CI/CD" },
      { id: "hosting",        label: "Hosting",         required: true },
      { id: "iac",            label: "Infra as code" },
    ],
  },
  {
    id: "intelligence", name: "Intelligence", grad: ["#D6952A", "#A5680F"],
    blurb: "The layer that did not exist five years ago and now reprices the rest.",
    slots: [
      { id: "llmGateway",      label: "LLM gateway", required: true },
      { id: "agentRuntime",    label: "Agent runtime" },
      { id: "retrieval",       label: "RAG / retrieval" },
      { id: "aiObservability", label: "AI evals & observability" },
    ],
  },
  {
    id: "surface", name: "Customer Surface", grad: ["#9B86C4", "#67519B"],
    blurb: "Everywhere a customer touches you and forms an opinion.",
    slots: [
      { id: "website",          label: "Website",          required: true },
      { id: "productInterface", label: "Product interface" },
      { id: "crm",              label: "CRM" },
      { id: "support",          label: "Support" },
    ],
  },
  {
    id: "money", name: "Money & Operations", grad: ["#C46A86", "#8E3E58"],
    blurb: "The plumbing that turns work into revenue and keeps you legal.",
    slots: [
      { id: "invoicing",   label: "Invoicing", required: true },
      { id: "accounting",  label: "Accounting" },
      { id: "hr",          label: "HR" },
      { id: "procurement", label: "Procurement" },
    ],
  },
];

// ---- Dependency graph ------------------------------------------------------
// Slot -> the slots it needs to exist. Empty a dependency and every dependent
// slot greys out. Empty a required slot and the company fails the function
// test. This is how the tool proves irreducibility instead of asserting it.
export const DEPENDENCIES: Record<string, string[]> = {
  cicd:             ["versionControl"],
  hosting:          ["versionControl"],
  iac:              ["versionControl"],
  agentRuntime:     ["llmGateway"],
  retrieval:        ["llmGateway", "database"],
  aiObservability:  ["agentRuntime"],
  productInterface: ["hosting"],
  website:          ["hosting"],
  search:           ["storage"],
  knowledgeBase:    ["storage"],
  support:          ["messaging"],
  crm:              ["database"],
  accessControl:    ["sso"],
};

// ---- Tool card -------------------------------------------------------------
export type Region = "us" | "eu" | "global" | "self";
export type Score = 0 | 1 | 2 | 3 | 4 | 5;
export type Readiness = Record<Criterion, Score>;

export interface Card {
  id: string;
  name: string;
  layer: LayerId;
  slot: string;
  posture: Posture;
  vendor: string;
  region: Region;
  readiness: Readiness;
  rationale: string;                                            // GoodEvil voice, one sentence, no em dashes
  iac?: { provider: string; resource: string; note?: string }; // own / generate cards feed the Terraform skeleton
}

// Readiness order for reference: openApi, dataPortability, agentOperability,
// integrationSurface, automationCostModel, operationalBurden.
// swapsWith is derived at runtime from every card sharing layer + slot.
export const CARDS: Card[] = [
  // ---------- Identity & Security ----------
  { id: "okta", name: "Okta", layer: "identity", slot: "sso", posture: "buy", vendor: "Okta", region: "us",
    readiness: { openApi: 5, dataPortability: 3, agentOperability: 4, integrationSurface: 5, automationCostModel: 2, operationalBurden: 5 },
    rationale: "Okta is the identity everyone integrates with, so it is easy to adopt and expensive to outgrow." },
  { id: "keycloak", name: "Keycloak", layer: "identity", slot: "sso", posture: "own", vendor: "Self-host", region: "self",
    readiness: { openApi: 5, dataPortability: 5, agentOperability: 4, integrationSurface: 4, automationCostModel: 5, operationalBurden: 2 },
    rationale: "Keycloak makes identity something you run, not a subscription that can lock you out of your own front door.",
    iac: { provider: "docker", resource: "quay.io/keycloak/keycloak", note: "Production mode with an external Postgres, TLS terminated at the proxy." } },
  { id: "authentik", name: "Authentik", layer: "identity", slot: "sso", posture: "own", vendor: "Self-host", region: "self",
    readiness: { openApi: 4, dataPortability: 5, agentOperability: 4, integrationSurface: 3, automationCostModel: 5, operationalBurden: 2 },
    rationale: "Authentik gives you Okta's job on your own server, so the login page answers to you and not a vendor roadmap.",
    iac: { provider: "docker", resource: "ghcr.io/goauthentik/server", note: "Server plus worker plus Postgres and Redis, fronted by your proxy." } },
  { id: "cerbos", name: "Cerbos", layer: "identity", slot: "accessControl", posture: "own", vendor: "Self-host", region: "self",
    readiness: { openApi: 5, dataPortability: 5, agentOperability: 5, integrationSurface: 3, automationCostModel: 5, operationalBurden: 3 },
    rationale: "Cerbos keeps authorization as versioned policy in your repo, so who can do what is reviewed like code instead of clicked in a console.",
    iac: { provider: "docker", resource: "ghcr.io/cerbos/cerbos", note: "Stateless policy engine, mount your policy repo as the source of truth." } },
  { id: "jumpcloud", name: "JumpCloud", layer: "identity", slot: "accessControl", posture: "buy", vendor: "JumpCloud", region: "us",
    readiness: { openApi: 4, dataPortability: 3, agentOperability: 3, integrationSurface: 4, automationCostModel: 2, operationalBurden: 5 },
    rationale: "JumpCloud rents you a whole directory so you skip running one, and you inherit its pricing every time you hire." },
  { id: "vault", name: "HashiCorp Vault", layer: "identity", slot: "secrets", posture: "own", vendor: "Self-host", region: "self",
    readiness: { openApi: 5, dataPortability: 4, agentOperability: 5, integrationSurface: 4, automationCostModel: 5, operationalBurden: 2 },
    rationale: "Vault turns secrets into infrastructure you control, and the price of that control is that you are the one keeping it up.",
    iac: { provider: "docker", resource: "hashicorp/vault", note: "Run with an unseal strategy and audit device, never in dev mode." } },
  { id: "doppler", name: "Doppler", layer: "identity", slot: "secrets", posture: "buy", vendor: "Doppler", region: "us",
    readiness: { openApi: 5, dataPortability: 4, agentOperability: 5, integrationSurface: 4, automationCostModel: 3, operationalBurden: 5 },
    rationale: "Doppler syncs your secrets everywhere with a clean API, and bills you for the convenience of never running it yourself." },
  { id: "jamf", name: "Jamf", layer: "identity", slot: "deviceManagement", posture: "buy", vendor: "Jamf", region: "us",
    readiness: { openApi: 4, dataPortability: 2, agentOperability: 2, integrationSurface: 4, automationCostModel: 2, operationalBurden: 5 },
    rationale: "Jamf runs your fleet of Apple devices well, as long as you accept per-device pricing and a console built for humans not agents." },
  { id: "fleet", name: "Fleet", layer: "identity", slot: "deviceManagement", posture: "own", vendor: "Self-host", region: "self",
    readiness: { openApi: 5, dataPortability: 5, agentOperability: 4, integrationSurface: 3, automationCostModel: 5, operationalBurden: 3 },
    rationale: "Fleet puts device management on open osquery you host, so you see every endpoint without shipping that inventory to anyone.",
    iac: { provider: "docker", resource: "fleetdm/fleet", note: "Fleet server with MySQL and Redis, agents enrolled via your MDM cert." } },

  // ---------- Data & Knowledge ----------
  { id: "s3", name: "Amazon S3", layer: "data", slot: "storage", posture: "buy", vendor: "AWS", region: "us",
    readiness: { openApi: 5, dataPortability: 4, agentOperability: 5, integrationSurface: 5, automationCostModel: 4, operationalBurden: 5 },
    rationale: "S3 is the storage the rest of the industry is written against, so everything speaks it, including your egress bill." },
  { id: "r2", name: "Cloudflare R2", layer: "data", slot: "storage", posture: "buy", vendor: "Cloudflare", region: "global",
    readiness: { openApi: 5, dataPortability: 5, agentOperability: 5, integrationSurface: 4, automationCostModel: 5, operationalBurden: 5 },
    rationale: "Cloudflare R2 speaks S3 without charging you to read your own files, so automation that reads a lot stays cheap." },
  { id: "minio", name: "MinIO", layer: "data", slot: "storage", posture: "own", vendor: "Self-host", region: "self",
    readiness: { openApi: 5, dataPortability: 5, agentOperability: 5, integrationSurface: 4, automationCostModel: 5, operationalBurden: 3 },
    rationale: "MinIO gives you the S3 API on your own disks, so portability is not a migration project, it is the default.",
    iac: { provider: "docker", resource: "minio/minio", note: "Distributed mode across four volumes for real durability." } },
  { id: "supabase", name: "Supabase", layer: "data", slot: "database", posture: "buy", vendor: "Supabase", region: "global",
    readiness: { openApi: 5, dataPortability: 5, agentOperability: 4, integrationSurface: 4, automationCostModel: 3, operationalBurden: 4 },
    rationale: "Supabase is Postgres with the boring parts done, and because it is really Postgres, leaving is a connection string away." },
  { id: "postgres-own", name: "Self-hosted Postgres", layer: "data", slot: "database", posture: "own", vendor: "Self-host", region: "self",
    readiness: { openApi: 4, dataPortability: 5, agentOperability: 4, integrationSurface: 3, automationCostModel: 5, operationalBurden: 2 },
    rationale: "Self-hosted Postgres is the database that owes you nothing and charges you nothing, once you accept you are the DBA.",
    iac: { provider: "docker", resource: "postgres", note: "Pin the major version, wire streaming backups, never skip point-in-time recovery." } },
  { id: "notion", name: "Notion", layer: "data", slot: "knowledgeBase", posture: "buy", vendor: "Notion", region: "us",
    readiness: { openApi: 3, dataPortability: 2, agentOperability: 3, integrationSurface: 4, automationCostModel: 2, operationalBurden: 5 },
    rationale: "Notion is where knowledge goes to feel organized, then stays because its export hands you back a worse version of it." },
  { id: "outline", name: "Outline", layer: "data", slot: "knowledgeBase", posture: "own", vendor: "Self-host", region: "self",
    readiness: { openApi: 4, dataPortability: 5, agentOperability: 4, integrationSurface: 3, automationCostModel: 5, operationalBurden: 3 },
    rationale: "Outline is a wiki you host, so the company memory lives on your server instead of behind someone's paywall.",
    iac: { provider: "docker", resource: "outlinewiki/outline", note: "Needs Postgres, Redis, and an S3-compatible bucket for attachments." } },
  { id: "gen-knowledgebase", name: "Generated knowledge base", layer: "data", slot: "knowledgeBase", posture: "generate", vendor: "Your repo", region: "self",
    readiness: { openApi: 5, dataPortability: 5, agentOperability: 5, integrationSurface: 4, automationCostModel: 5, operationalBurden: 1 },
    rationale: "A generated knowledge base is retrieval over your own documents, owned as code, and it is yours to keep running at 2am.",
    iac: { provider: "repo", resource: "apps/knowledge", note: "Indexer plus retrieval endpoint, deploys with your intelligence layer." } },
  { id: "algolia", name: "Algolia", layer: "data", slot: "search", posture: "buy", vendor: "Algolia", region: "us",
    readiness: { openApi: 5, dataPortability: 3, agentOperability: 4, integrationSurface: 4, automationCostModel: 1, operationalBurden: 5 },
    rationale: "Algolia makes search instant and delightful until the per-query bill meets an automated workload." },
  { id: "typesense", name: "Typesense", layer: "data", slot: "search", posture: "own", vendor: "Self-host", region: "self",
    readiness: { openApi: 5, dataPortability: 5, agentOperability: 4, integrationSurface: 3, automationCostModel: 5, operationalBurden: 3 },
    rationale: "Typesense gives you fast search you host, so query volume is a hardware question, not an invoice question.",
    iac: { provider: "docker", resource: "typesense/typesense", note: "Single node to start, add peers when the index outgrows one box." } },
  { id: "fivetran", name: "Fivetran", layer: "data", slot: "dataPipeline", posture: "buy", vendor: "Fivetran", region: "us",
    readiness: { openApi: 4, dataPortability: 3, agentOperability: 3, integrationSurface: 5, automationCostModel: 1, operationalBurden: 5 },
    rationale: "Fivetran moves your data for you and prices it by the row, so the more you sync the more it stings." },
  { id: "airbyte", name: "Airbyte", layer: "data", slot: "dataPipeline", posture: "own", vendor: "Self-host", region: "self",
    readiness: { openApi: 4, dataPortability: 5, agentOperability: 4, integrationSurface: 4, automationCostModel: 5, operationalBurden: 2 },
    rationale: "Airbyte is the connectors without the meter, as long as you are willing to operate the pipeline yourself.",
    iac: { provider: "helm", resource: "airbyte/airbyte", note: "Runs its own Postgres and workers, give it room and a real object store." } },

  // ---------- Communication & Coordination ----------
  { id: "slack", name: "Slack", layer: "comms", slot: "messaging", posture: "buy", vendor: "Salesforce", region: "us",
    readiness: { openApi: 5, dataPortability: 2, agentOperability: 4, integrationSurface: 5, automationCostModel: 1, operationalBurden: 5 },
    rationale: "Slack is where work talks, but it bills per human even when the bots do the talking, so automation inflates the invoice." },
  { id: "mattermost", name: "Mattermost", layer: "comms", slot: "messaging", posture: "own", vendor: "Self-host", region: "self",
    readiness: { openApi: 4, dataPortability: 5, agentOperability: 4, integrationSurface: 4, automationCostModel: 5, operationalBurden: 2 },
    rationale: "Mattermost is Slack you host, so conversations stay on your infrastructure and off someone else's balance sheet.",
    iac: { provider: "docker", resource: "mattermost/mattermost-team-edition", note: "Postgres plus a file store, put it behind SSO from the identity layer." } },
  { id: "zoom", name: "Zoom", layer: "comms", slot: "meetings", posture: "buy", vendor: "Zoom", region: "us",
    readiness: { openApi: 4, dataPortability: 2, agentOperability: 3, integrationSurface: 4, automationCostModel: 3, operationalBurden: 5 },
    rationale: "Zoom just works for meetings, and asks in return that you never look too hard at its API or its per-host pricing." },
  { id: "jitsi", name: "Jitsi", layer: "comms", slot: "meetings", posture: "own", vendor: "Self-host", region: "self",
    readiness: { openApi: 3, dataPortability: 5, agentOperability: 3, integrationSurface: 2, automationCostModel: 5, operationalBurden: 2 },
    rationale: "Jitsi is video you run yourself, cheap on licenses and honest about the fact that uptime is now your problem.",
    iac: { provider: "docker", resource: "jitsi/web", note: "The full stack is web, prosody, jicofo, and jvb, and the JVB wants UDP and bandwidth." } },
  { id: "linear", name: "Linear", layer: "comms", slot: "projectManagement", posture: "buy", vendor: "Linear", region: "us",
    readiness: { openApi: 5, dataPortability: 4, agentOperability: 5, integrationSurface: 4, automationCostModel: 2, operationalBurden: 5 },
    rationale: "Linear is the fastest way teams track work, with a real API and an agent-ready surface, priced per seat you keep adding." },
  { id: "plane", name: "Plane", layer: "comms", slot: "projectManagement", posture: "own", vendor: "Self-host", region: "self",
    readiness: { openApi: 4, dataPortability: 5, agentOperability: 4, integrationSurface: 3, automationCostModel: 5, operationalBurden: 2 },
    rationale: "Plane is Linear you can host, so your roadmap lives in your stack and scales by server, not by seat.",
    iac: { provider: "docker", resource: "makeplane/plane", note: "Compose stack of api, worker, Postgres, Redis, and a MinIO bucket." } },
  { id: "google-docs", name: "Google Docs", layer: "comms", slot: "docs", posture: "buy", vendor: "Google", region: "global",
    readiness: { openApi: 3, dataPortability: 3, agentOperability: 2, integrationSurface: 4, automationCostModel: 3, operationalBurden: 5 },
    rationale: "Google Docs is where documents actually get written, in exchange for an API that treats automation as an afterthought." },
  { id: "cryptpad", name: "CryptPad", layer: "comms", slot: "docs", posture: "own", vendor: "Self-host", region: "eu",
    readiness: { openApi: 2, dataPortability: 5, agentOperability: 2, integrationSurface: 2, automationCostModel: 5, operationalBurden: 2 },
    rationale: "CryptPad keeps documents encrypted on European servers you can run, trading slick features for sovereignty you can prove.",
    iac: { provider: "docker", resource: "cryptpad/cryptpad", note: "Set your two domains for sandboxing, persist the datastore volume." } },

  // ---------- Build & Deploy ----------
  { id: "github", name: "GitHub", layer: "build", slot: "versionControl", posture: "buy", vendor: "Microsoft", region: "global",
    readiness: { openApi: 5, dataPortability: 4, agentOperability: 4, integrationSurface: 5, automationCostModel: 3, operationalBurden: 5 },
    rationale: "GitHub owns the network your code already lives on, so leaving it costs more than staying." },
  { id: "gitea", name: "Gitea", layer: "build", slot: "versionControl", posture: "own", vendor: "Self-host", region: "self",
    readiness: { openApi: 4, dataPortability: 5, agentOperability: 4, integrationSurface: 3, automationCostModel: 5, operationalBurden: 3 },
    rationale: "Gitea is GitHub minus the landlord: you hold the repo, so nobody can reprice or deplatform your history.",
    iac: { provider: "docker", resource: "gitea/gitea", note: "One container plus a Postgres volume, behind your own reverse proxy." } },
  { id: "github-actions", name: "GitHub Actions", layer: "build", slot: "cicd", posture: "buy", vendor: "Microsoft", region: "global",
    readiness: { openApi: 4, dataPortability: 3, agentOperability: 4, integrationSurface: 5, automationCostModel: 3, operationalBurden: 5 },
    rationale: "GitHub Actions puts CI right next to your code, then meters the minutes so heavy pipelines quietly add up." },
  { id: "woodpecker", name: "Woodpecker CI", layer: "build", slot: "cicd", posture: "own", vendor: "Self-host", region: "self",
    readiness: { openApi: 4, dataPortability: 5, agentOperability: 4, integrationSurface: 3, automationCostModel: 5, operationalBurden: 2 },
    rationale: "Woodpecker runs your pipelines on your own runners, so build minutes cost electricity instead of credits.",
    iac: { provider: "docker", resource: "woodpeckerci/woodpecker-server", note: "Server plus one agent per host, wired to your Git provider's OAuth." } },
  { id: "vercel", name: "Vercel", layer: "build", slot: "hosting", posture: "buy", vendor: "Vercel", region: "us",
    readiness: { openApi: 5, dataPortability: 3, agentOperability: 4, integrationSurface: 4, automationCostModel: 2, operationalBurden: 5 },
    rationale: "Vercel makes shipping a frontend effortless, and makes leaving, or scaling, a conversation with its pricing page." },
  { id: "cloudflare-pages", name: "Cloudflare Pages", layer: "build", slot: "hosting", posture: "buy", vendor: "Cloudflare", region: "global",
    readiness: { openApi: 5, dataPortability: 4, agentOperability: 4, integrationSurface: 4, automationCostModel: 4, operationalBurden: 5 },
    rationale: "Cloudflare Pages hosts at the edge with a flat story, so traffic spikes do not become billing spikes." },
  { id: "hetzner", name: "Hetzner", layer: "build", slot: "hosting", posture: "own", vendor: "Self-host", region: "eu",
    readiness: { openApi: 4, dataPortability: 5, agentOperability: 4, integrationSurface: 3, automationCostModel: 5, operationalBurden: 2 },
    rationale: "Hetzner rents you real servers at honest prices, so you trade managed convenience for control and a much smaller bill.",
    iac: { provider: "hcloud", resource: "hcloud_server", note: "Provision the server, attach a volume and firewall, hand off to your config layer." } },
  { id: "opentofu", name: "OpenTofu", layer: "build", slot: "iac", posture: "own", vendor: "Self-host", region: "self",
    readiness: { openApi: 5, dataPortability: 5, agentOperability: 5, integrationSurface: 4, automationCostModel: 5, operationalBurden: 3 },
    rationale: "OpenTofu makes your infrastructure a file in your repo, so the whole stack can be reviewed, diffed, and rebuilt from scratch.",
    iac: { provider: "repo", resource: "infra/", note: "The state backend is the one thing to run, use object storage with locking." } },
  { id: "pulumi", name: "Pulumi", layer: "build", slot: "iac", posture: "buy", vendor: "Pulumi", region: "us",
    readiness: { openApi: 5, dataPortability: 4, agentOperability: 5, integrationSurface: 4, automationCostModel: 3, operationalBurden: 4 },
    rationale: "Pulumi lets you write infrastructure in a real language, and keeps the state service close so you do not have to babysit it." },

  // ---------- Intelligence ----------
  { id: "anthropic-api", name: "Claude API", layer: "intelligence", slot: "llmGateway", posture: "buy", vendor: "Anthropic", region: "us",
    readiness: { openApi: 5, dataPortability: 4, agentOperability: 5, integrationSurface: 5, automationCostModel: 3, operationalBurden: 5 },
    rationale: "The Claude API is the intelligence layer with a first-class agent surface, priced by tokens so cost tracks use, not seats." },
  { id: "litellm", name: "LiteLLM", layer: "intelligence", slot: "llmGateway", posture: "own", vendor: "Self-host", region: "self",
    readiness: { openApi: 5, dataPortability: 5, agentOperability: 5, integrationSurface: 4, automationCostModel: 5, operationalBurden: 2 },
    rationale: "LiteLLM puts one gateway in front of every model you run, so you swap providers without rewriting a line of product.",
    iac: { provider: "docker", resource: "ghcr.io/berriai/litellm", note: "Proxy plus a Postgres for keys and spend, front it with your own auth." } },
  { id: "claude-agent-sdk", name: "Claude Agent SDK", layer: "intelligence", slot: "agentRuntime", posture: "own", vendor: "Anthropic", region: "self",
    readiness: { openApi: 5, dataPortability: 5, agentOperability: 5, integrationSurface: 5, automationCostModel: 5, operationalBurden: 2 },
    rationale: "The Claude Agent SDK is an agent runtime you own and operate, powerful and yours to keep running when it matters.",
    iac: { provider: "repo", resource: "apps/agent", note: "A service in your repo, give it tool credentials and a sandbox to act in." } },
  { id: "gen-agent", name: "Generated agent", layer: "intelligence", slot: "agentRuntime", posture: "generate", vendor: "Your repo", region: "self",
    readiness: { openApi: 5, dataPortability: 5, agentOperability: 5, integrationSurface: 4, automationCostModel: 5, operationalBurden: 1 },
    rationale: "A generated agent is workflow logic as code in your repo, agent-native by design and maintained by whoever owns that repo.",
    iac: { provider: "repo", resource: "apps/agent", note: "Generated runtime, versioned like any service and deployed with the build layer." } },
  { id: "pinecone", name: "Pinecone", layer: "intelligence", slot: "retrieval", posture: "buy", vendor: "Pinecone", region: "us",
    readiness: { openApi: 5, dataPortability: 3, agentOperability: 5, integrationSurface: 4, automationCostModel: 2, operationalBurden: 5 },
    rationale: "Pinecone makes vector search someone else's problem, until the managed bill scales with every embedding you store." },
  { id: "pgvector", name: "pgvector", layer: "intelligence", slot: "retrieval", posture: "own", vendor: "Self-host", region: "self",
    readiness: { openApi: 4, dataPortability: 5, agentOperability: 4, integrationSurface: 3, automationCostModel: 5, operationalBurden: 2 },
    rationale: "pgvector puts retrieval inside the Postgres you already run, so your vectors live next to your data, not in another vendor.",
    iac: { provider: "docker", resource: "pgvector/pgvector", note: "An extension on your existing Postgres, no new service to babysit." } },
  { id: "gen-rag", name: "Generated RAG pipeline", layer: "intelligence", slot: "retrieval", posture: "generate", vendor: "Your repo", region: "self",
    readiness: { openApi: 5, dataPortability: 5, agentOperability: 5, integrationSurface: 4, automationCostModel: 5, operationalBurden: 1 },
    rationale: "A generated RAG pipeline is retrieval you assembled and own, tuned to your data and answerable only to your repo.",
    iac: { provider: "repo", resource: "apps/retrieval", note: "Chunker, embedder, and query path as code over your own vector store." } },
  { id: "langfuse", name: "Langfuse", layer: "intelligence", slot: "aiObservability", posture: "own", vendor: "Self-host", region: "self",
    readiness: { openApi: 5, dataPortability: 5, agentOperability: 5, integrationSurface: 4, automationCostModel: 5, operationalBurden: 3 },
    rationale: "Langfuse gives you evals and tracing for your AI on infrastructure you host, so your prompts and outputs stay yours.",
    iac: { provider: "docker", resource: "langfuse/langfuse", note: "Web plus worker plus Postgres and Clickhouse, point your SDKs at it." } },
  { id: "braintrust", name: "Braintrust", layer: "intelligence", slot: "aiObservability", posture: "buy", vendor: "Braintrust", region: "us",
    readiness: { openApi: 5, dataPortability: 3, agentOperability: 5, integrationSurface: 4, automationCostModel: 2, operationalBurden: 5 },
    rationale: "Braintrust makes AI evaluation polished and managed, in exchange for sending your traces to one more outside service." },
  { id: "gen-evals", name: "Generated eval harness", layer: "intelligence", slot: "aiObservability", posture: "generate", vendor: "Your repo", region: "self",
    readiness: { openApi: 5, dataPortability: 5, agentOperability: 5, integrationSurface: 3, automationCostModel: 5, operationalBurden: 1 },
    rationale: "A generated eval harness is your quality bar written as code, so what good looks like is versioned, not remembered.",
    iac: { provider: "repo", resource: "evals/", note: "Datasets and scorers in the repo, run in CI on every prompt change." } },

  // ---------- Customer Surface ----------
  { id: "webflow", name: "Webflow", layer: "surface", slot: "website", posture: "buy", vendor: "Webflow", region: "us",
    readiness: { openApi: 3, dataPortability: 2, agentOperability: 2, integrationSurface: 4, automationCostModel: 2, operationalBurden: 5 },
    rationale: "Webflow builds beautiful marketing sites fast, then holds the export hostage so the design is easier to admire than to move." },
  { id: "gen-website", name: "Generated marketing site", layer: "surface", slot: "website", posture: "generate", vendor: "Your repo", region: "self",
    readiness: { openApi: 5, dataPortability: 5, agentOperability: 4, integrationSurface: 4, automationCostModel: 5, operationalBurden: 2 },
    rationale: "A generated marketing site is your front page as code you own, so a redesign is a commit, not a subscription.",
    iac: { provider: "repo", resource: "apps/web", note: "Static build in the repo, ships through the same hosting slot as everything else." } },
  { id: "retool", name: "Retool", layer: "surface", slot: "productInterface", posture: "buy", vendor: "Retool", region: "us",
    readiness: { openApi: 4, dataPortability: 2, agentOperability: 3, integrationSurface: 5, automationCostModel: 2, operationalBurden: 5 },
    rationale: "Retool assembles internal tools quickly, then charges per builder and keeps the app locked inside Retool." },
  { id: "gen-dashboard", name: "Generated internal dashboard", layer: "surface", slot: "productInterface", posture: "generate", vendor: "Your repo", region: "self",
    readiness: { openApi: 5, dataPortability: 5, agentOperability: 5, integrationSurface: 4, automationCostModel: 5, operationalBurden: 1 },
    rationale: "A generated dashboard is code you own, not a seat you rent, so it bends to your data instead of your data bending to it.",
    iac: { provider: "repo", resource: "apps/internal-dashboard", note: "Generated app in your monorepo, deploys with the rest of the build layer." } },
  { id: "appsmith", name: "Appsmith", layer: "surface", slot: "productInterface", posture: "own", vendor: "Self-host", region: "self",
    readiness: { openApi: 4, dataPortability: 5, agentOperability: 4, integrationSurface: 4, automationCostModel: 5, operationalBurden: 2 },
    rationale: "Appsmith is the internal-tool builder you can self-host, so the admin panel stays in your stack and off a per-seat meter.",
    iac: { provider: "docker", resource: "appsmith/appsmith-ce", note: "Single container with an embedded Mongo, mount the data volume." } },
  { id: "hubspot", name: "HubSpot", layer: "surface", slot: "crm", posture: "buy", vendor: "HubSpot", region: "us",
    readiness: { openApi: 4, dataPortability: 2, agentOperability: 3, integrationSurface: 4, automationCostModel: 2, operationalBurden: 5 },
    rationale: "HubSpot makes starting easy and leaving expensive, because your funnel, your data, and your automations all speak only HubSpot." },
  { id: "salesforce", name: "Salesforce", layer: "surface", slot: "crm", posture: "buy", vendor: "Salesforce", region: "us",
    readiness: { openApi: 5, dataPortability: 3, agentOperability: 3, integrationSurface: 5, automationCostModel: 1, operationalBurden: 5 },
    rationale: "Salesforce integrates with everything and negotiates with everyone, so it is powerful, unavoidable, and never cheap." },
  { id: "twenty", name: "Twenty", layer: "surface", slot: "crm", posture: "own", vendor: "Self-host", region: "self",
    readiness: { openApi: 5, dataPortability: 5, agentOperability: 4, integrationSurface: 3, automationCostModel: 5, operationalBurden: 2 },
    rationale: "Twenty is an open CRM you host, so the customer list that runs your company is not renting space in someone else's.",
    iac: { provider: "docker", resource: "twentycrm/twenty", note: "Server plus worker plus Postgres and Redis, behind your identity layer." } },
  { id: "intercom", name: "Intercom", layer: "surface", slot: "support", posture: "buy", vendor: "Intercom", region: "us",
    readiness: { openApi: 4, dataPortability: 2, agentOperability: 3, integrationSurface: 4, automationCostModel: 1, operationalBurden: 5 },
    rationale: "Intercom answers your customers well and prices AI support by resolution, so success with it makes it cost more." },
  { id: "chatwoot", name: "Chatwoot", layer: "surface", slot: "support", posture: "own", vendor: "Self-host", region: "self",
    readiness: { openApi: 4, dataPortability: 5, agentOperability: 4, integrationSurface: 3, automationCostModel: 5, operationalBurden: 2 },
    rationale: "Chatwoot is support you run yourself, so conversation history and automation live on your side of the login.",
    iac: { provider: "docker", resource: "chatwoot/chatwoot", note: "Rails app plus Sidekiq, Postgres, and Redis, wire in your channels." } },

  // ---------- Money & Operations ----------
  { id: "stripe-invoicing", name: "Stripe Invoicing", layer: "money", slot: "invoicing", posture: "buy", vendor: "Stripe", region: "us",
    readiness: { openApi: 5, dataPortability: 4, agentOperability: 5, integrationSurface: 5, automationCostModel: 4, operationalBurden: 5 },
    rationale: "Stripe turns invoicing into a clean API that agents can drive, and takes its cut whether a human is involved or not." },
  { id: "fortnox", name: "Fortnox", layer: "money", slot: "invoicing", posture: "buy", vendor: "Fortnox", region: "eu",
    readiness: { openApi: 3, dataPortability: 3, agentOperability: 3, integrationSurface: 3, automationCostModel: 3, operationalBurden: 5 },
    rationale: "Fortnox keeps Swedish invoicing compliant and local, trading a global-grade API for the paperwork actually being right." },
  { id: "quickbooks", name: "QuickBooks", layer: "money", slot: "accounting", posture: "buy", vendor: "Intuit", region: "us",
    readiness: { openApi: 4, dataPortability: 2, agentOperability: 3, integrationSurface: 4, automationCostModel: 2, operationalBurden: 5 },
    rationale: "QuickBooks is the accounting everyone's accountant knows, with an API that reminds you it was built for bookkeepers first." },
  { id: "xero", name: "Xero", layer: "money", slot: "accounting", posture: "buy", vendor: "Xero", region: "global",
    readiness: { openApi: 4, dataPortability: 3, agentOperability: 3, integrationSurface: 4, automationCostModel: 3, operationalBurden: 5 },
    rationale: "Xero makes accounting almost pleasant, as long as your automation lives within the shapes its API decides to expose." },
  { id: "gusto", name: "Gusto", layer: "money", slot: "hr", posture: "buy", vendor: "Gusto", region: "us",
    readiness: { openApi: 4, dataPortability: 2, agentOperability: 3, integrationSurface: 3, automationCostModel: 2, operationalBurden: 5 },
    rationale: "Gusto runs payroll so you never think about it, and prices per person because people are exactly what it counts." },
  { id: "ramp", name: "Ramp", layer: "money", slot: "procurement", posture: "buy", vendor: "Ramp", region: "us",
    readiness: { openApi: 4, dataPortability: 3, agentOperability: 4, integrationSurface: 4, automationCostModel: 4, operationalBurden: 5 },
    rationale: "Ramp handles cards and procurement for free by taking interchange, so the tool is cheap and your spend is the product." },
  { id: "pleo", name: "Pleo", layer: "money", slot: "procurement", posture: "buy", vendor: "Pleo", region: "eu",
    readiness: { openApi: 3, dataPortability: 3, agentOperability: 3, integrationSurface: 3, automationCostModel: 3, operationalBurden: 5 },
    rationale: "Pleo gives European teams company cards with real controls, priced per user and hosted where your finance team needs it." },
  { id: "gen-procurement", name: "Generated approval workflow", layer: "money", slot: "procurement", posture: "generate", vendor: "Your repo", region: "self",
    readiness: { openApi: 5, dataPortability: 5, agentOperability: 5, integrationSurface: 3, automationCostModel: 5, operationalBurden: 1 },
    rationale: "A generated approval workflow is your buying rules as code, so the process bends to your policy instead of a vendor's form.",
    iac: { provider: "repo", resource: "apps/approvals", note: "State machine in the repo, triggered from the messaging and money layers." } },
];

// ---- Ambition --------------------------------------------------------------
// Ambition shifts the auto-slotter's preference when a slot has several
// candidate cards. Conservative reaches for what everyone already buys.
// AI-native reaches for what you can generate and own.
export type Ambition = "conservative" | "progressive" | "ai-native";
export const AMBITION_PREFERENCE: Record<Ambition, Posture[]> = {
  conservative: ["buy", "own", "generate"],
  progressive:  ["own", "buy", "generate"],
  "ai-native":  ["generate", "own", "buy"],
};

// ---- Industry templates ----------------------------------------------------
// Five starting configurations, not five products. Each sets layer weights
// (which layers matter most for the composite), a default ambition, optional
// region constraints, and a pre-slotting. The user always lands in one, then
// diverges. Unset slots (and constrained-out slots) are filled by the
// ambition preference at runtime, or left as an honest gap.
export interface Template {
  id: string;
  name: string;
  size: string;
  blurb: string;
  ambition: Ambition;
  weights: Record<LayerId, number>;
  constraints?: { region?: Region[] };
  cardBudget?: number;                       // keep the slot count lean when set
  slots: Record<string, string>;             // slotId -> cardId
}

export const TEMPLATES: Template[] = [
  {
    id: "creative-agency", name: "Creative agency", size: "30-60 people",
    blurb: "Ideas are the product, so knowledge and coordination outrank infrastructure.",
    ambition: "progressive",
    weights: { data: 1.3, comms: 1.3, surface: 1.1, intelligence: 1.0, identity: 0.8, build: 0.7, money: 0.9 },
    slots: {
      sso: "okta", accessControl: "jumpcloud", secrets: "doppler", deviceManagement: "jamf",
      storage: "r2", database: "supabase", knowledgeBase: "notion", search: "algolia", dataPipeline: "fivetran",
      messaging: "slack", meetings: "zoom", projectManagement: "linear", docs: "google-docs",
      versionControl: "github", cicd: "github-actions", hosting: "vercel", iac: "pulumi",
      llmGateway: "anthropic-api", agentRuntime: "gen-agent", retrieval: "gen-rag", aiObservability: "braintrust",
      website: "webflow", productInterface: "gen-dashboard", crm: "hubspot", support: "intercom",
      invoicing: "stripe-invoicing", accounting: "xero", hr: "gusto", procurement: "ramp",
    },
  },
  {
    id: "b2b-saas", name: "B2B SaaS", size: "100-300 people",
    blurb: "The product is the company, so shipping and intelligence carry the weight.",
    ambition: "ai-native",
    weights: { build: 1.4, intelligence: 1.3, identity: 1.1, data: 1.1, surface: 1.0, comms: 0.9, money: 0.8 },
    slots: {
      sso: "keycloak", accessControl: "cerbos", secrets: "vault", deviceManagement: "fleet",
      storage: "s3", database: "postgres-own", knowledgeBase: "outline", search: "typesense", dataPipeline: "airbyte",
      messaging: "slack", meetings: "zoom", projectManagement: "linear", docs: "google-docs",
      versionControl: "github", cicd: "github-actions", hosting: "cloudflare-pages", iac: "opentofu",
      llmGateway: "litellm", agentRuntime: "claude-agent-sdk", retrieval: "pgvector", aiObservability: "langfuse",
      website: "gen-website", productInterface: "gen-dashboard", crm: "twenty", support: "chatwoot",
      invoicing: "stripe-invoicing", accounting: "xero", hr: "gusto", procurement: "gen-procurement",
    },
  },
  {
    id: "professional-services", name: "Professional services", size: "50-150 people",
    blurb: "Billable expertise lives in documents and client relationships, not in servers.",
    ambition: "conservative",
    weights: { data: 1.3, surface: 1.2, comms: 1.1, money: 1.0, identity: 0.9, intelligence: 0.9, build: 0.7 },
    slots: {
      sso: "okta", accessControl: "jumpcloud", secrets: "doppler", deviceManagement: "jamf",
      storage: "s3", database: "supabase", knowledgeBase: "notion", search: "algolia", dataPipeline: "fivetran",
      messaging: "slack", meetings: "zoom", projectManagement: "linear", docs: "google-docs",
      versionControl: "github", cicd: "github-actions", hosting: "vercel", iac: "pulumi",
      llmGateway: "anthropic-api", agentRuntime: "gen-agent", retrieval: "pinecone", aiObservability: "braintrust",
      website: "webflow", productInterface: "retool", crm: "salesforce", support: "intercom",
      invoicing: "stripe-invoicing", accounting: "quickbooks", hr: "gusto", procurement: "ramp",
    },
  },
  {
    id: "public-sector", name: "Public sector", size: "200-1000 people",
    blurb: "Sovereignty is not a feature request, so identity and hosting come first and stay in the EU.",
    ambition: "conservative",
    weights: { identity: 1.4, data: 1.3, money: 1.0, comms: 1.0, surface: 0.9, build: 0.9, intelligence: 0.7 },
    constraints: { region: ["eu", "self"] },
    // accounting and hr are left empty on purpose: no EU-hosted option in the
    // catalogue yet, so the tool shows the gap instead of hiding it.
    slots: {
      sso: "keycloak", accessControl: "cerbos", secrets: "vault", deviceManagement: "fleet",
      storage: "minio", database: "postgres-own", knowledgeBase: "outline", search: "typesense", dataPipeline: "airbyte",
      messaging: "mattermost", meetings: "jitsi", projectManagement: "plane", docs: "cryptpad",
      versionControl: "gitea", cicd: "woodpecker", hosting: "hetzner", iac: "opentofu",
      llmGateway: "litellm", agentRuntime: "claude-agent-sdk", retrieval: "pgvector", aiObservability: "langfuse",
      website: "gen-website", productInterface: "appsmith", crm: "twenty", support: "chatwoot",
      invoicing: "fortnox", procurement: "pleo",
    },
  },
  {
    id: "bootstrapped-startup", name: "Bootstrapped startup", size: "2-10 people",
    blurb: "Few hands means the stack has to generate itself, so own and generate beat buy.",
    ambition: "ai-native",
    weights: { intelligence: 1.3, build: 1.2, surface: 1.1, comms: 1.0, data: 0.9, identity: 0.8, money: 0.7 },
    cardBudget: 12,
    // Deliberately lean: fill the required slots plus the few that earn their
    // keep, and leave the rest as gaps a two-person company can live with.
    slots: {
      sso: "keycloak",
      storage: "r2", database: "supabase",
      messaging: "slack",
      versionControl: "github", hosting: "cloudflare-pages",
      llmGateway: "anthropic-api", agentRuntime: "gen-agent", retrieval: "gen-rag",
      website: "gen-website", productInterface: "gen-dashboard",
      invoicing: "stripe-invoicing",
    },
  },
];
