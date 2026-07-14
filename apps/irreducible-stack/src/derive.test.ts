import test from "node:test";
import assert from "node:assert/strict";
import { TEMPLATES } from "./catalogue";
import { resolveTemplate, applyOverrides, composite, ALL_SLOTS, type Slotting } from "./derive";

// The central invariant. If this can fail, the scoring model is wrong, not the
// test: a readiness meter that rises when you break the stack is a lie.
test("composite is monotonic under card removal, on every template", () => {
  for (const t of TEMPLATES) {
    const base = resolveTemplate(t);
    const baseScore = composite(base, t.weights);
    for (const s of ALL_SLOTS) {
      if (!base[s.id]) continue; // only filled slots can be removed
      const removed = applyOverrides(base, { [s.id]: null });
      const score = composite(removed, t.weights);
      assert.ok(
        score <= baseScore,
        `${t.id}: removing ${s.id} raised composite ${baseScore} -> ${score}`,
      );
    }
  }
});

// Empty required slots count as zero, so nothing-to-average cannot score high.
test("an unconfigured stack scores zero", () => {
  const empty: Slotting = Object.fromEntries(ALL_SLOTS.map((s) => [s.id, null]));
  for (const t of TEMPLATES) {
    assert.equal(composite(empty, t.weights), 0, `${t.id} empty should be 0`);
  }
});

// A real configuration scores in range, so the meter is actually informative.
test("a resolved template scores between 1 and 100", () => {
  for (const t of TEMPLATES) {
    const sc = composite(resolveTemplate(t), t.weights);
    assert.ok(sc > 0 && sc <= 100, `${t.id} scored ${sc}`);
  }
});

// Breaking a required dependency must visibly drag the number down, so the
// meter and the alarm tell the same story instead of one shrugging.
test("breaking a required dependency drops the composite", () => {
  const t = TEMPLATES.find((x) => x.id === "b2b-saas")!;
  const base = resolveTemplate(t);
  const broken = applyOverrides(base, { versionControl: null });
  assert.ok(
    composite(broken, t.weights) < composite(base, t.weights),
    "removing version control should lower the composite via the cascade",
  );
});
