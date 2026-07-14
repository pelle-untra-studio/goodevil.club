import { useMemo, useState, useEffect } from "react";
import {
  LAYERS, CRITERIA, TEMPLATES, RUBRIC,
  type Criterion, type LayerId,
} from "./catalogue";
import {
  resolveTemplate, applyOverrides, candidatesFor, cardOf, slotMeta,
  slotStates, functionTest, strongestWeakest, postureBalance, composite,
  type Slotting,
} from "./derive";

/*
  ACT 2 — shape the stack.
  Built alongside v1 (still the default). Reach this at ?v2.
  The seven layers lead; slots are secondary until a layer is opened, which is
  the mobile-first structure. Removing a card runs the real dependency cascade
  in derive.ts, so "irreducible" is demonstrated, not asserted.
*/

const critLabel = (c: Criterion) => CRITERIA.find((x) => x.id === c)!.short;
const critFull = (c: Criterion) => CRITERIA.find((x) => x.id === c)!.label;
const postureColor = { buy: "#E8B83A", generate: "#3FB6A8", own: "#9B86C4" } as const;

export default function IrreducibleStackV2() {
  const [templateId, setTemplateId] = useState(TEMPLATES[1].id); // b2b-saas: rich board to interact with
  const [overrides, setOverrides] = useState<Slotting>({});
  const [selected, setSelected] = useState<string | null>(null); // slot id open in the panel
  const [narrow, setNarrow] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const template = TEMPLATES.find((t) => t.id === templateId)!;

  // Responsive default: on a phone the layers lead and only the first is open.
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 719px)");
    const apply = () => {
      setNarrow(mq.matches);
      setOpen(Object.fromEntries(LAYERS.map((l, i) => [l.id, mq.matches ? i === 0 : true])));
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const base = useMemo(() => resolveTemplate(template), [template]);
  const slotting = useMemo(() => applyOverrides(base, overrides), [base, overrides]);
  const states = useMemo(() => slotStates(slotting), [slotting]);
  const fn = useMemo(() => functionTest(slotting), [slotting]);
  const sw = useMemo(() => strongestWeakest(slotting), [slotting]);
  const pb = useMemo(() => postureBalance(slotting), [slotting]);
  const score = useMemo(() => composite(slotting, template.weights), [slotting, template]);

  const setTemplate = (id: string) => { setTemplateId(id); setOverrides({}); setSelected(null); };
  const swap = (slot: string, cardId: string) => setOverrides((o) => ({ ...o, [slot]: cardId }));
  const remove = (slot: string) => setOverrides((o) => ({ ...o, [slot]: null }));
  const toggle = (layer: LayerId) => setOpen((o) => ({ ...o, [layer]: !o[layer] }));

  const selCard = selected ? cardOf(slotting[selected]) : null;
  const selMeta = selected ? slotMeta.get(selected) : null;

  return (
    <div className="v2-root">
      <style>{CSS}</style>

      <header className="v2-head">
        <div>
          <span className="v2-kicker">Good Evil Club · probe · v2 preview</span>
          <h1>The Irreducible Stack</h1>
        </div>
        <label className="v2-tmpl">
          <span>Template</span>
          <select value={templateId} onChange={(e) => setTemplate(e.target.value)}>
            {TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
      </header>

      {/* Meters lead with the axis story, not the number. */}
      <div className="v2-meters">
        <div className="v2-readout">
          {sw ? (
            <p className="v2-story">
              Strong on <b style={{ color: "#3FB6A8" }}>{critFull(sw.strong)}</b>.{" "}
              Weak on <b style={{ color: "#E2553A" }}>{critFull(sw.weak)}</b>.
            </p>
          ) : <p className="v2-story">Empty stack. Fill a slot to begin.</p>}
          <div className="v2-score" title="Composite AI readiness. Deliberately secondary.">
            <span className="n">{score}</span><span className="l">readiness</span>
          </div>
        </div>
        <div className="v2-posture">
          {(["buy", "generate", "own"] as const).map((p) =>
            pb[p] > 0 ? (
              <span key={p} className="seg" style={{ flexGrow: pb[p], background: postureColor[p] }}>
                {p} {pb[p]}
              </span>
            ) : null,
          )}
        </div>
      </div>

      {!fn.functional && (
        <div className="v2-alarm">
          {fn.failedRequired.length > 0 && (
            <span>This company cannot function: no {fn.failedRequired.map((s) => slotMeta.get(s)!.label).join(", ")}.</span>
          )}
          {fn.brokenCount > 0 && <span> {fn.brokenCount} capabilit{fn.brokenCount === 1 ? "y" : "ies"} broken downstream.</span>}
        </div>
      )}

      <div className="v2-body">
        <div className="v2-board">
          {LAYERS.map((l) => {
            const filled = l.slots.filter((s) => states[s.id].covered).length;
            const brokenInLayer = l.slots.some((s) => states[s.id].covered && !states[s.id].operational);
            return (
              <section className="v2-layer" key={l.id}>
                <button className="v2-layer-head" onClick={() => toggle(l.id)} style={{ ["--g0" as string]: l.grad[0], ["--g1" as string]: l.grad[1] }}>
                  <span className="v2-layer-name">{l.name}</span>
                  <span className="v2-dots">
                    {l.slots.map((s) => {
                      const st = states[s.id];
                      const cls = !st.covered ? "empty" : !st.operational ? "broken" : "on";
                      return <i key={s.id} className={"dot " + cls} title={s.label} />;
                    })}
                  </span>
                  <span className="v2-layer-meta">
                    {brokenInLayer && <span className="v2-warn">broken</span>}
                    {filled}/{l.slots.length}
                    <span className={"chev" + (open[l.id] ? " up" : "")}>▾</span>
                  </span>
                </button>

                {open[l.id] && (
                  <div className="v2-slots">
                    {l.slots.map((s) => {
                      const st = states[s.id];
                      const card = cardOf(slotting[s.id]);
                      const broken = st.covered && !st.operational;
                      const reason = st.missingDeps.concat(st.downDeps).map((d) => slotMeta.get(d)!.label);
                      return (
                        <button
                          key={s.id}
                          className={"v2-slot" + (card ? "" : " ghost") + (broken ? " broken" : "") + (selected === s.id ? " sel" : "")}
                          onClick={() => setSelected(s.id)}
                          style={card ? { ["--g0" as string]: l.grad[0], ["--g1" as string]: l.grad[1] } : undefined}
                        >
                          <span className="v2-slot-cap">{s.label}{s.required && <em>core</em>}</span>
                          {card ? (
                            <>
                              <span className="v2-slot-name">{card.name}</span>
                              <span className="v2-slot-tags">
                                <span className="tag" style={{ background: postureColor[card.posture] }}>{card.posture}</span>
                                {broken && <span className="tag red">needs {reason.join(", ")}</span>}
                              </span>
                            </>
                          ) : (
                            <span className={"v2-slot-empty" + (st.required ? " req" : "")}>
                              <span className="plus">＋</span>{st.required ? "required, empty" : "add one"}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>

        {/* Panel: card detail, six-axis profile, swap, remove. */}
        {selected && selMeta && narrow && <div className="v2-scrim" onClick={() => setSelected(null)} />}
        {selected && selMeta && (
          <aside className={"v2-panel" + (narrow ? " sheet" : "")}>
            <div className="v2-panel-in">
              <div className="v2-panel-top">
                <span className="v2-eyebrow">{selMeta.label}{selMeta.required && " · core"}</span>
                <button className="v2-x" onClick={() => setSelected(null)}>×</button>
              </div>

              {selCard ? (
                <>
                  <h2>{selCard.name}</h2>
                  <p className="v2-vendor">{selCard.vendor} · {selCard.region} · <b style={{ color: postureColor[selCard.posture] }}>{selCard.posture}</b></p>
                  <p className="v2-rationale">{selCard.rationale}</p>

                  <div className="v2-axes">
                    {CRITERIA.map((c) => {
                      const v = selCard.readiness[c.id];
                      const col = v >= 4 ? "#3FB6A8" : v >= 2 ? "#E8B83A" : "#E2553A";
                      return (
                        <div className="v2-axis" key={c.id} title={anchorFor(c.id, v)}>
                          <span className="ax-l">{critLabel(c.id)}</span>
                          <span className="ax-track">
                            {[1, 2, 3, 4, 5].map((n) => <i key={n} className="pip" style={{ background: n <= v ? col : "#2a2521" }} />)}
                          </span>
                          <span className="ax-v">{v}</span>
                        </div>
                      );
                    })}
                  </div>

                  {states[selected].covered && !states[selected].operational && (
                    <p className="v2-panel-broken">Broken: waiting on {states[selected].missingDeps.concat(states[selected].downDeps).map((d) => slotMeta.get(d)!.label).join(", ")}.</p>
                  )}

                  <div className="v2-actions">
                    <button className="v2-btn danger" onClick={() => remove(selected)}>Remove, show what breaks</button>
                  </div>
                </>
              ) : (
                <>
                  <h2>Empty slot</h2>
                  <p className="v2-rationale">Nothing fills {selMeta.label} yet. Pick one below.</p>
                </>
              )}

              <div className="v2-swap">
                <p className="v2-swap-l">{selCard ? "Swap for" : "Fill with"}</p>
                {candidatesFor(selected).filter((c) => c.id !== slotting[selected]).map((c) => (
                  <button key={c.id} className="v2-cand" onClick={() => swap(selected, c.id)}>
                    <span className="cand-name">{c.name}</span>
                    <span className="cand-tag" style={{ background: postureColor[c.posture] }}>{c.posture}</span>
                    <span className="cand-total">{CRITERIA.reduce((s, x) => s + c.readiness[x.id], 0)}/30</span>
                  </button>
                ))}
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

function anchorFor(c: Criterion, v: number): string {
  const r = RUBRIC[c];
  return v >= 4 ? r.a5 : v >= 2 ? r.a3 : r.a1;
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800&family=Inter:wght@400;500;600&family=Space+Mono:wght@400;700&display=swap');
html, body { cursor: auto; }
.v2-root{
  --bg:#14100E; --panel:#1E1916; --card:#211C18; --ink:#F1EADD; --muted:#8A8175;
  --hair:#3A342E; --gold:#B57A12; --gap:#E2553A; --ok:#3FB6A8;
  --display:'Archivo',system-ui,sans-serif; --ui:'Inter',system-ui,sans-serif; --mono:'Space Mono',ui-monospace,monospace;
  background:var(--bg); color:var(--ink); font-family:var(--ui);
  min-height:100vh; max-width:1180px; margin:0 auto; padding:22px 18px 96px; box-sizing:border-box;
}
.v2-root *{box-sizing:border-box;}
.v2-head{display:flex; justify-content:space-between; align-items:flex-end; gap:16px; flex-wrap:wrap; border-bottom:1px solid var(--hair); padding-bottom:16px;}
.v2-kicker{font-family:var(--mono); font-size:10.5px; letter-spacing:.16em; text-transform:uppercase; color:var(--gold);}
.v2-head h1{font-family:var(--display); font-weight:800; font-size:27px; letter-spacing:-.02em; margin:4px 0 0;}
.v2-tmpl{display:flex; flex-direction:column; gap:5px; font-family:var(--mono); font-size:9.5px; letter-spacing:.12em; text-transform:uppercase; color:var(--muted);}
.v2-tmpl select{background:#14100E; border:1px solid var(--hair); color:var(--ink); border-radius:8px; padding:9px 11px; font-family:var(--ui); font-size:13px;}

.v2-meters{display:flex; flex-direction:column; gap:10px; margin:16px 0 0;}
.v2-readout{display:flex; align-items:center; justify-content:space-between; gap:14px;}
.v2-story{margin:0; font-family:var(--display); font-weight:700; font-size:19px; line-height:1.3;}
.v2-score{display:flex; flex-direction:column; align-items:flex-end; flex:none;}
.v2-score .n{font-family:var(--mono); font-size:15px; color:var(--muted);}
.v2-score .l{font-family:var(--mono); font-size:8px; letter-spacing:.12em; text-transform:uppercase; color:var(--muted);}
.v2-posture{display:flex; gap:3px; height:26px; border-radius:7px; overflow:hidden;}
.v2-posture .seg{display:flex; align-items:center; justify-content:center; color:#14100E; font-family:var(--mono); font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; min-width:52px; transition:flex-grow .32s cubic-bezier(.16,1,.3,1), background .3s ease;}
.v2-score .n{transition:color .25s ease;}

.v2-alarm{margin-top:12px; background:#3a201a; border:1px solid #5a3026; color:#f0a98f; border-radius:9px; padding:10px 13px; font-size:13px; font-weight:600;}

.v2-body{display:grid; grid-template-columns:1fr; gap:16px; margin-top:16px; align-items:start;}
@media (min-width:900px){ .v2-body.has-panel, .v2-body{grid-template-columns:1fr;} }

.v2-board{display:flex; flex-direction:column; gap:9px;}
.v2-layer{background:var(--panel); border:1px solid #2a2521; border-radius:12px; overflow:hidden;}
.v2-layer-head{width:100%; display:flex; align-items:center; gap:12px; background:none; border:none; cursor:pointer; padding:13px 15px; color:var(--ink); text-align:left; border-left:3px solid var(--g0);}
.v2-layer-name{font-family:var(--display); font-weight:700; font-size:15px; flex:none;}
.v2-dots{display:flex; gap:5px; flex:1; flex-wrap:wrap;}
.v2-dots .dot{width:9px; height:9px; border-radius:50%; background:#2a2521;}
.v2-dots .dot.on{background:linear-gradient(135deg,var(--g0),var(--g1));}
.v2-dots .dot.empty{background:none; border:1.5px dashed var(--hair);}
.v2-dots .dot.broken{background:var(--gap); box-shadow:0 0 0 2px rgba(226,85,58,.25);}
.v2-layer-meta{display:flex; align-items:center; gap:8px; font-family:var(--mono); font-size:11px; color:var(--muted); flex:none;}
.v2-warn{color:var(--gap); font-size:9px; letter-spacing:.08em; text-transform:uppercase;}
.chev{display:inline-block; transition:transform .18s;}
.chev.up{transform:rotate(180deg);}

.v2-slots{display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:8px; padding:0 12px 13px;}
.v2-slot{display:flex; flex-direction:column; gap:5px; text-align:left; background:var(--card); border:1px solid var(--hair); border-radius:10px; padding:10px 11px; cursor:pointer; color:var(--ink); border-left:3px solid var(--g0); min-height:74px; transition:border-color .15s ease, box-shadow .15s ease, background .2s ease, transform .12s ease;}
.v2-slot:hover{border-color:var(--ink);}
.v2-slot:active{transform:scale(.988);}
.v2-slot.sel{border-color:var(--ink); box-shadow:0 0 0 1px var(--ink);}
.v2-slot.ghost{border-style:dashed; border-left-style:solid; border-left-color:var(--hair); opacity:.75;}
.v2-slot.ghost:hover{opacity:1; border-color:var(--muted);}
.v2-slot.broken{border-color:#5a3026; border-left-color:var(--gap); background:#26130f; animation:v2-flash .55s ease;}
.v2-slot-cap{font-family:var(--mono); font-size:9px; letter-spacing:.09em; text-transform:uppercase; color:var(--muted);}
.v2-slot-cap em{font-style:normal; color:var(--gap); margin-left:5px; font-size:8px;}
.v2-slot-name{font-family:var(--display); font-weight:700; font-size:14px;}
.v2-slot-empty{font-size:12px; color:var(--muted); display:flex; align-items:center; gap:6px;}
.v2-slot-empty.req{color:#a05a44;}
.v2-slot-empty .plus{font-size:13px; line-height:1; opacity:.8;}
.v2-slot-tags{display:flex; gap:5px; flex-wrap:wrap; margin-top:auto;}
.tag{font-family:var(--mono); font-size:8.5px; font-weight:700; text-transform:uppercase; letter-spacing:.04em; color:#14100E; padding:2px 6px; border-radius:4px;}
.tag.red{background:#5a3026; color:#f0a98f;}

.v2-scrim{position:fixed; inset:0; background:rgba(10,8,6,.55); z-index:39; animation:v2-fade .2s ease;}
.v2-panel{position:fixed; top:0; right:0; height:100vh; width:360px; background:var(--panel); border-left:1px solid #2a2521; z-index:40; overflow-y:auto; box-shadow:-16px 0 40px rgba(0,0,0,.4); animation:v2-slide-in .24s cubic-bezier(.16,1,.3,1);}
.v2-panel.sheet{top:auto; bottom:0; right:0; left:0; width:auto; height:auto; max-height:82vh; border-left:none; border-top:1px solid #2a2521; border-radius:16px 16px 0 0; box-shadow:0 -16px 40px rgba(0,0,0,.45); animation:v2-slide-up .28s cubic-bezier(.16,1,.3,1);}
@keyframes v2-slide-in{from{transform:translateX(22px); opacity:0;} to{transform:none; opacity:1;}}
@keyframes v2-slide-up{from{transform:translateY(28px); opacity:0;} to{transform:none; opacity:1;}}
@keyframes v2-fade{from{opacity:0;} to{opacity:1;}}
@keyframes v2-flash{0%{box-shadow:0 0 0 0 rgba(226,85,58,.5);} 100%{box-shadow:0 0 0 7px rgba(226,85,58,0);}}
.v2-panel-in{padding:18px;}
.v2-panel-top{display:flex; align-items:center; justify-content:space-between;}
.v2-eyebrow{font-family:var(--mono); font-size:10px; letter-spacing:.12em; text-transform:uppercase; color:var(--gold);}
.v2-x{background:none; border:none; color:var(--muted); font-size:22px; line-height:1; cursor:pointer;}
.v2-x:hover{color:var(--ink);}
.v2-panel h2{font-family:var(--display); font-weight:800; font-size:21px; margin:6px 0 2px;}
.v2-vendor{font-family:var(--mono); font-size:11px; color:var(--muted); margin:0;}
.v2-rationale{font-size:13.5px; line-height:1.55; color:#cdbfa9; margin:12px 0 0;}
.v2-axes{display:flex; flex-direction:column; gap:7px; margin:16px 0 0; border-top:1px solid #2a2521; padding-top:14px;}
.v2-axis{display:flex; align-items:center; gap:10px;}
.ax-l{font-family:var(--mono); font-size:10px; text-transform:uppercase; color:var(--muted); width:78px; flex:none;}
.ax-track{display:flex; gap:3px; flex:1;}
.ax-track .pip{height:8px; flex:1; border-radius:2px;}
.ax-v{font-family:var(--mono); font-size:12px; color:var(--ink); width:14px; text-align:right;}
.v2-panel-broken{margin:12px 0 0; background:#3a201a; border:1px solid #5a3026; color:#f0a98f; border-radius:8px; padding:9px 11px; font-size:12.5px;}
.v2-actions{margin-top:16px;}
.v2-btn{width:100%; font-family:var(--ui); font-weight:600; font-size:13px; border:1px solid var(--hair); background:transparent; color:var(--ink); padding:11px; border-radius:9px; cursor:pointer;}
.v2-btn.danger{border-color:#5a3026; color:#f0a98f;}
.v2-btn.danger:hover{background:#3a201a;}
.v2-swap{margin-top:18px; border-top:1px solid #2a2521; padding-top:14px;}
.v2-swap-l{font-family:var(--mono); font-size:10px; letter-spacing:.12em; text-transform:uppercase; color:var(--muted); margin:0 0 9px;}
.v2-cand{width:100%; display:flex; align-items:center; gap:9px; background:var(--card); border:1px solid var(--hair); border-radius:9px; padding:9px 11px; cursor:pointer; color:var(--ink); margin-bottom:7px;}
.v2-cand:hover{border-color:var(--ink);}
.cand-name{font-family:var(--display); font-weight:700; font-size:13.5px; flex:1; text-align:left;}
.cand-tag{font-family:var(--mono); font-size:8.5px; font-weight:700; text-transform:uppercase; color:#14100E; padding:2px 6px; border-radius:4px;}
.cand-total{font-family:var(--mono); font-size:11px; color:var(--muted); width:38px; text-align:right;}

@media (max-width:719px){
  .v2-root{padding:18px 12px 90px;}
  .v2-head h1{font-size:23px;}
  .v2-story{font-size:16px;}
  .v2-slots{grid-template-columns:1fr;}
}
@media (prefers-reduced-motion:reduce){
  .v2-panel, .v2-panel.sheet, .v2-scrim, .v2-slot.broken{animation:none;}
  .v2-posture .seg, .v2-slot, .chev, .v2-score .n{transition:none;}
}
`;
