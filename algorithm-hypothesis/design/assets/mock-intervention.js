/*
 * Mockup 2 — Cell intervention (Visualizer 1).
 * Two prompts, two grids. Drag a cell of the source grid onto the target
 * grid; the algorithm recomputes and the counterfactual grid shows what changed.
 */
(function () {
  "use strict";
  const E = window.ALEngine;
  const G = window.ALGrid;
  const S = window.ALStore;
  const host = document.getElementById("mock-cell-intervention");
  if (!host) return;
  const esc = G.esc;

  const PAIRS = {
    fig1: { label: "Figure 1 pair", source: E.PROMPTS.source, target: E.PROMPTS.target },
    cod: { label: "§3.4 pair (cod)", source: E.PROMPTS.source_cod, target: E.PROMPTS.target },
  };

  const state = {
    algId: "positional",
    pair: "fig1",
    picked: null,
    intervention: { src: { layer: 5, tok: 16 }, tgt: { layer: 5, tok: 16 } },
    message: null,
  };

  let ctl = { source: null, target: null, result: null };

  function alg() {
    return S.get(state.algId) || S.get("positional");
  }
  function srcTokens() {
    return E.tokenize(PAIRS[state.pair].source);
  }
  function tgtTokens() {
    return E.tokenize(PAIRS[state.pair].target);
  }

  function cellLabel(c, tokens) {
    return `${G.layerLabel(c.layer)} · “${tokens[c.tok]}”`;
  }

  // Algorithm names get a neutral chip with the paper's symbol; glyphs are for types.
  function algChip(a) {
    return `<span class="alg-chip">${a.symbol ? `<span class="sym">${esc(a.symbol)}</span>` : ""}${esc(a.name)}</span>`;
  }

  function distBars(v, base) {
    if (!v || v.kind !== "dist") return "";
    const baseMap = {};
    if (base && base.kind === "dist") base.items.forEach((x) => (baseMap[x.label] = x.p));
    return `<div class="dist" role="img" aria-label="Output distribution">${v.items
      .map(
        (x) =>
          `<div class="dist-row"><span class="mono dist-label">${esc(x.label)}</span><span class="dist-track"><span class="dist-base" style="width:${((baseMap[x.label] || 0) * 100).toFixed(1)}%"></span><span class="dist-bar" style="width:${(x.p * 100).toFixed(1)}%"></span></span><span class="mono dist-p">${Math.round(x.p * 100)}%</span></div>`
      )
      .join("")}<div class="dist-legend"><span class="sw-base"></span>before <span class="sw-after"></span>after</div></div>`;
  }

  function shell() {
    host.innerHTML = `
      <div class="panel-header">
        <h3>Cell intervention</h3>
        <div class="hdr-controls">
          <label class="sr-only" for="ci-pair">Prompt pair</label>
          <select id="ci-pair" class="select">${Object.entries(PAIRS).map(([k, p]) => `<option value="${k}">${esc(p.label)}</option>`).join("")}</select>
          <button type="button" class="btn" data-act="reset">Reset</button>
        </div>
      </div>
      <div class="mock-toolbar"><span class="tb-label">Algorithm</span><div class="seg" role="group" aria-label="Algorithm" data-slot="algs"></div><span class="tb-note" data-slot="blurb"></span></div>
      <div class="ci-stack" data-slot="stack">
        <section class="ci-block source" aria-label="Source prompt">
          <div class="ci-label"><span class="role-dot source"></span><strong>Source</strong><span class="muted">drag from here</span></div>
          <p class="ci-prompt mono" data-slot="src-prompt"></p>
          <div data-slot="src-grid"></div>
        </section>
        <section class="ci-block target" aria-label="Target prompt">
          <div class="ci-label"><span class="role-dot target"></span><strong>Target</strong><span class="muted">drop here</span></div>
          <p class="ci-prompt mono" data-slot="tgt-prompt"></p>
          <div data-slot="tgt-grid"></div>
        </section>
        <div class="intervention-overlay" data-slot="overlay" aria-hidden="true"></div>
      </div>
      <div class="ci-hint" data-slot="hint" role="status" aria-live="polite"></div>
      <div class="ci-result" data-slot="result"></div>
    `;
  }

  function renderAlgs() {
    const list = S.list();
    const slot = host.querySelector('[data-slot="algs"]');
    slot.innerHTML = list
      .map((a) => `<button type="button" data-alg="${esc(a.id)}" aria-pressed="${a.id === state.algId}">${a.symbol ? `<span class="sym">${esc(a.symbol)}</span>` : ""}${esc(a.name)}</button>`)
      .join("");
    host.querySelector('[data-slot="blurb"]').textContent = alg().blurb || "";
  }

  function render() {
    renderAlgs();
    host.querySelector("#ci-pair").value = state.pair;
    const a = alg();
    // Colors are for editing; the intervention view draws every variable black.
    const plain = { ...a, vars: a.vars.map(({ color, ...v }) => v) };
    const st = srcTokens();
    const tt = tgtTokens();
    host.querySelector('[data-slot="src-prompt"]').textContent = PAIRS[state.pair].source;
    host.querySelector('[data-slot="tgt-prompt"]').textContent = PAIRS[state.pair].target;

    let res = null;
    if (state.intervention) res = E.interchangeIntervention(a, st, tt, state.intervention.src, state.intervention.tgt);
    if (res && !res.ok) state.message = res.reason;

    Object.values(ctl).forEach((c) => c && c.destroy());
    ctl.source = G.render(host.querySelector('[data-slot="src-grid"]'), {
      alg: plain,
      tokens: st,
      role: "source",
      compact: true,
      arrows: "none",
      pickedCell: state.picked,
      interventionCell: res && res.ok ? state.intervention.src : null,
    });
    ctl.target = G.render(host.querySelector('[data-slot="tgt-grid"]'), {
      alg: plain,
      tokens: tt,
      role: "target",
      compact: true,
      arrows: "none",
      interventionCell: res && res.ok ? state.intervention.tgt : null,
    });

    const hint = host.querySelector('[data-slot="hint"]');
    if (state.picked) hint.textContent = `Picked ${cellLabel(state.picked, st)}. Now click a target cell to intervene on it.`;
    else if (state.message) hint.innerHTML = `<span class="warn-text">${esc(state.message)}</span>`;
    else if (!state.intervention) hint.textContent = "Drag a cell from the source grid onto the target grid, or click one and then the other. Try the last token at L5.";
    else hint.textContent = "";

    const out = host.querySelector('[data-slot="result"]');
    if (!res || !res.ok) {
      out.innerHTML = "";
      ctl.result = null;
      drawArrow();
      return;
    }

    const before = E.output(a, res.target);
    const after = E.output(a, res.counterfactual);
    const vm = E.varMap(a);
    const pairsHtml = res.pairs
      .map(([s, t]) => {
        const name = t.kind === "tok" ? `token “${tt[t.tok ?? Number(t.key.slice(2))]}”` : vm[t.id].name;
        const from = E.valueAt(a, res.target, t.key, state.intervention.tgt.layer).value;
        const to = res.interventions[0].values[t.key];
        const srcName = s.key === t.key ? "" : ` from ${s.kind === "tok" ? "token" : vm[s.id].name}`;
        return `<li><span class="mono">${esc(name)}</span>: <span class="mono">${esc(E.show(from))}</span> → <span class="mono intervened-val">${esc(E.show(to))}</span>${esc(srcName)}</li>`;
      })
      .join("");

    // Same cells, every algorithm.
    const rows = S.list()
      .map((b) => {
        const r = E.interchangeIntervention(b, st, tt, state.intervention.src, state.intervention.tgt);
        const base = E.outputLabel(E.output(b, r.target));
        let cell;
        if (!r.ok) cell = `<span class="muted">${r.empty ? "Nothing here: stays " + esc(base) : "No shared variables"}</span>`;
        else {
          const o = E.outputLabel(E.output(b, r.counterfactual));
          cell = o === base ? `<span class="mono">${esc(o)}</span> <span class="muted">unchanged</span>` : `<span class="mono">${esc(base)}</span> → <span class="mono strong-val">${esc(o)}</span>`;
        }
        return `<tr${b.id === a.id ? ' class="current"' : ""}><th scope="row">${algChip(b)}</th><td>${cell}</td></tr>`;
      })
      .join("");

    out.innerHTML = `
      <div class="ci-result-head">
        <div class="ci-label"><span class="role-dot blend"></span><strong>Counterfactual</strong><span class="muted">the target run after the intervention ${esc(cellLabel(state.intervention.src, st))} → ${esc(cellLabel(state.intervention.tgt, tt))}</span></div>
      </div>
      <div data-slot="res-grid"></div>
      <div class="ci-summary">
        <div class="ci-card">
          <span class="field-label">Target output → counterfactual output</span>
          <p class="big-out"><span class="mono">${esc(E.outputLabel(before))}</span> <span class="arrow-glyph">→</span> <span class="mono strong-val">${esc(E.outputLabel(after))}</span></p>
          ${distBars(after, before)}
          <span class="field-label">Swapped values</span>
          <ul class="intervened-list">${pairsHtml}</ul>
        </div>
        <div class="ci-card">
          <span class="field-label">Same intervention, every algorithm</span>
          <table class="cmp"><tbody>${rows}</tbody></table>
        </div>
      </div>
    `;
    ctl.result = G.render(out.querySelector('[data-slot="res-grid"]'), {
      alg: plain,
      tokens: tt,
      ev: res.counterfactual,
      baseEv: res.target,
      role: "result",
      compact: true,
      arrows: "none",
      interventionCell: state.intervention.tgt,
    });
    syncScroll();
    drawArrow();
  }

  function drawArrow() {
    const overlay = host.querySelector('[data-slot="overlay"]');
    if (!state.intervention || !ctl.source || !ctl.target) return (overlay.innerHTML = "");
    const a = ctl.source.cell(state.intervention.src.layer, state.intervention.src.tok);
    const b = ctl.target.cell(state.intervention.tgt.layer, state.intervention.tgt.tok);
    const res = E.interchangeIntervention(alg(), srcTokens(), tgtTokens(), state.intervention.src, state.intervention.tgt);
    if (!res.ok) return (overlay.innerHTML = "");
    requestAnimationFrame(() => G.drawInterventionArrow(overlay, a, b));
  }

  function syncScroll() {
    const scrollers = Object.values(ctl)
      .filter(Boolean)
      .map((c) => c.scroller);
    let lock = false;
    scrollers.forEach((s) =>
      s.addEventListener("scroll", () => {
        if (lock) return;
        lock = true;
        scrollers.forEach((o) => {
          if (o !== s) o.scrollLeft = s.scrollLeft;
        });
        lock = false;
        drawArrow();
      })
    );
  }

  function applyIntervention(src, tgt) {
    state.picked = null;
    state.message = null;
    state.intervention = { src, tgt };
    render();
  }

  shell();
  render();
  S.subscribe(render);
  window.addEventListener("resize", drawArrow);

  G.dragController(host.querySelector('[data-slot="stack"]'), {
    sourceSelector: '.cell[data-role="source"]',
    dropSelector: '.cell[data-role="target"]',
    canDrag: (el) => el.classList.contains("has-nodes"),
    ghostHtml: (el) => `<span class="mono">${esc(G.layerLabel(Number(el.dataset.layer)))} · ${esc(srcTokens()[Number(el.dataset.tok)])}</span>`,
    onDrop: (s, t) => applyIntervention({ layer: Number(s.dataset.layer), tok: Number(s.dataset.tok) }, { layer: Number(t.dataset.layer), tok: Number(t.dataset.tok) }),
  });

  host.addEventListener("click", (e) => {
    const t = e.target;
    const algBtn = t.closest("[data-alg]");
    if (algBtn) {
      state.algId = algBtn.dataset.alg;
      state.message = null;
      return render();
    }
    if (t.closest('[data-act="reset"]')) {
      state.intervention = null;
      state.picked = null;
      state.message = null;
      return render();
    }
    const cell = t.closest(".cell");
    if (!cell) return;
    const c = { layer: Number(cell.dataset.layer), tok: Number(cell.dataset.tok) };
    if (cell.dataset.role === "source") {
      if (!cell.classList.contains("has-nodes")) {
        state.picked = null;
        state.message = "That source cell is empty. Pick a cell that carries a variable or a token.";
        return render();
      }
      state.picked = state.picked && state.picked.layer === c.layer && state.picked.tok === c.tok ? null : c;
      state.message = null;
      return render();
    }
    if (cell.dataset.role === "target" && state.picked) return applyIntervention(state.picked, c);
  });

  host.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && e.target.classList.contains("cell")) {
      e.preventDefault();
      e.target.click();
    }
  });

  host.addEventListener("change", (e) => {
    if (e.target.id === "ci-pair") {
      state.pair = e.target.value;
      state.message = null;
      render();
    }
  });
})();
