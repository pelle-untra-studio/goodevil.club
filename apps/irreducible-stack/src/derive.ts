// ============================================================
// THE IRREDUCIBLE STACK — derive
// Pure functions over a slotting. No React, no side effects, so every
// number the UI shows is traceable to the catalogue and reproducible.
// ============================================================
import {
  CARDS, LAYERS, DEPENDENCIES, CRITERIA, AMBITION_PREFERENCE,
  type Card, type Criterion, type LayerId, type Template,
} from "./catalogue";

// A slotting maps every slot id to a card id, or null when the slot is empty.
export type Slotting = Record<string, string | null>;

const cardById = new Map<string, Card>(CARDS.map((c) => [c.id, c]));
export const cardOf = (id: string | null | undefined): Card | null =>
  (id ? cardById.get(id) ?? null : null);

export const CRIT_IDS: Criterion[] = CRITERIA.map((c) => c.id);
export const MAX_TOTAL = CRIT_IDS.length * 5; // 30

export interface SlotRef { id: string; label: string; required: boolean; layer: LayerId }
export const ALL_SLOTS: SlotRef[] = LAYERS.flatMap((l) =>
  l.slots.map((s) => ({ id: s.id, label: s.label, required: !!s.required, layer: l.id })),
);
export const slotMeta = new Map<string, SlotRef>(ALL_SLOTS.map((s) => [s.id, s]));
export const candidatesFor = (slotId: string): Card[] => CARDS.filter((c) => c.slot === slotId);

// ---- Template resolution ---------------------------------------------------
// Explicit template slots win. Remaining slots auto-fill by the ambition's
// posture preference, respecting region constraints and an optional card
// budget. Slots with no eligible card stay empty, which is an honest gap.
export function resolveTemplate(t: Template): Slotting {
  const regionOk = (c: Card) => !t.constraints?.region || t.constraints.region.includes(c.region);
  const slotting: Slotting = {};
  for (const s of ALL_SLOTS) {
    const explicit = t.slots[s.id];
    const card = explicit ? cardById.get(explicit) : undefined;
    slotting[s.id] = card && regionOk(card) ? card.id : null;
  }
  const pref = AMBITION_PREFERENCE[t.ambition];
  const pick = (slot: SlotRef) => {
    const cands = candidatesFor(slot.id).filter(regionOk);
    if (!cands.length) return; // no eligible card (e.g. region-constrained) => honest gap
    cands.sort((a, b) => pref.indexOf(a.posture) - pref.indexOf(b.posture));
    slotting[slot.id] = cands[0].id;
  };
  // Required slots are always filled, even past a lean card budget. A company
  // that skips an irreducible capability is not lean, it is broken.
  for (const s of ALL_SLOTS) if (s.required && !slotting[s.id]) pick(s);
  // Optional slots fill by ambition preference until the budget is spent.
  const budget = t.cardBudget ?? Infinity;
  for (const s of ALL_SLOTS) {
    if (s.required || slotting[s.id]) continue;
    if (Object.values(slotting).filter(Boolean).length >= budget) break;
    pick(s);
  }
  return slotting;
}

export const applyOverrides = (base: Slotting, overrides: Slotting): Slotting => ({ ...base, ...overrides });

// ---- Readiness -------------------------------------------------------------
const cardTotal = (c: Card) => CRIT_IDS.reduce((s, k) => s + c.readiness[k], 0);

export function axisAverages(slotting: Slotting): Record<Criterion, number> {
  const filled = filledCards(slotting);
  const out = {} as Record<Criterion, number>;
  for (const k of CRIT_IDS) out[k] = filled.length ? filled.reduce((s, c) => s + c.readiness[k], 0) / filled.length : 0;
  return out;
}

export function layerReadiness(slotting: Slotting): Record<LayerId, number> {
  const out = {} as Record<LayerId, number>;
  for (const l of LAYERS) {
    const cards = l.slots.map((s) => cardOf(slotting[s.id])).filter(Boolean) as Card[];
    out[l.id] = cards.length ? cards.reduce((sum, c) => sum + cardTotal(c) / MAX_TOTAL, 0) / cards.length : 0;
  }
  return out;
}

// The composite is deliberately secondary. It is also monotonic: removing any
// card can never raise it. Two rules make that true.
//   1. The denominator is FIXED over the required slot set, never the filled
//      set. A shrinking denominator could let the score rise when a below-mean
//      capability disappears, and a meter that goes up when you break things is
//      worse than one that shrugs.
//   2. A capability that is empty OR broken scores zero, not "excluded". So an
//      unconfigured stack scores zero instead of perfect-by-having-nothing.
export const REQUIRED_SLOTS: SlotRef[] = ALL_SLOTS.filter((s) => s.required);

function slotScore(slotId: string, slotting: Slotting, states: Record<string, SlotState>): number {
  const st = states[slotId];
  if (!st || !st.covered || !st.operational) return 0; // empty or broken => zero
  const card = cardOf(slotting[slotId]);
  return card ? cardTotal(card) / MAX_TOTAL : 0;
}

export function composite(slotting: Slotting, weights: Record<LayerId, number>): number {
  const states = slotStates(slotting);
  let num = 0, den = 0;
  for (const s of REQUIRED_SLOTS) {
    const w = weights[s.layer] ?? 1;
    den += w;                                  // fixed: independent of what is filled
    num += w * slotScore(s.id, slotting, states);
  }
  return den ? Math.round(100 * num / den) : 0;
}

// The headline readout: what the stack is strong and weak at. This leads, not the number.
export function strongestWeakest(slotting: Slotting): { strong: Criterion; weak: Criterion; averages: Record<Criterion, number> } | null {
  if (!filledCards(slotting).length) return null;
  const avg = axisAverages(slotting);
  const sorted = [...CRIT_IDS].sort((a, b) => avg[b] - avg[a]);
  return { strong: sorted[0], weak: sorted[sorted.length - 1], averages: avg };
}

export interface PostureBalance { buy: number; generate: number; own: number; total: number }
export function postureBalance(slotting: Slotting): PostureBalance {
  const filled = filledCards(slotting);
  const b: PostureBalance = { buy: 0, generate: 0, own: 0, total: filled.length };
  filled.forEach((c) => { b[c.posture]++; });
  return b;
}

const filledCards = (slotting: Slotting): Card[] =>
  ALL_SLOTS.map((s) => cardOf(slotting[s.id])).filter(Boolean) as Card[];

// ---- Irreducibility engine -------------------------------------------------
// This is the proof, not a decoration. A slot is operational only when it is
// filled AND every slot it depends on is itself operational. So emptying one
// slot cascades: remove version control and CI, hosting and IaC go down, then
// everything that depends on hosting goes down after them.
export interface SlotState {
  covered: boolean;
  operational: boolean;
  required: boolean;
  missingDeps: string[]; // dependency slots that are empty
  downDeps: string[];    // dependency slots that are filled but themselves not operational
}

export function slotStates(slotting: Slotting): Record<string, SlotState> {
  const memo = new Map<string, boolean>();
  const visiting = new Set<string>();
  const operational = (slotId: string): boolean => {
    const cached = memo.get(slotId);
    if (cached !== undefined) return cached;
    if (visiting.has(slotId)) return true; // guard against a dependency cycle
    visiting.add(slotId);
    let ok = !!slotting[slotId];
    if (ok) for (const dep of DEPENDENCIES[slotId] || []) if (!operational(dep)) ok = false;
    visiting.delete(slotId);
    memo.set(slotId, ok);
    return ok;
  };
  const states: Record<string, SlotState> = {};
  for (const s of ALL_SLOTS) {
    const deps = DEPENDENCIES[s.id] || [];
    states[s.id] = {
      covered: !!slotting[s.id],
      operational: operational(s.id),
      required: s.required,
      missingDeps: deps.filter((d) => !slotting[d]),
      downDeps: deps.filter((d) => slotting[d] && !operational(d)),
    };
  }
  return states;
}

export interface FunctionTest { functional: boolean; failedRequired: string[]; brokenRequired: string[]; brokenCount: number }
export function functionTest(slotting: Slotting): FunctionTest {
  const st = slotStates(slotting);
  const failedRequired = ALL_SLOTS.filter((s) => s.required && !st[s.id].covered).map((s) => s.id);
  const brokenRequired = ALL_SLOTS.filter((s) => s.required && st[s.id].covered && !st[s.id].operational).map((s) => s.id);
  const brokenCount = ALL_SLOTS.filter((s) => st[s.id].covered && !st[s.id].operational).length;
  return { functional: failedRequired.length === 0 && brokenRequired.length === 0, failedRequired, brokenRequired, brokenCount };
}
