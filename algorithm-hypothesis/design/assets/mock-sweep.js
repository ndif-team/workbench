/*
 * Mockup 3 — Token sweep (Visualizer 2).
 * Drag a source token onto a target token. For every layer, swap whatever
 * the algorithm carries at that (layer, token) and record the output.
 * With equal-length prompts, "Full grid" runs every token at once.
 */
(function () {
  "use strict";
  const E = window.ALEngine;
  const G = window.ALGrid;
  const S = window.ALStore;
  const host = document.getElementById("mock-sweep");
  if (!host) return;
  const esc = G.esc;

  const PAIRS = {
    fig1: { label: "Figure 1 pair", source: E.PROMPTS.source, target: E.PROMPTS.target },
    cod: { label: "§3.4 pair (cod)", source: E.PROMPTS.source_cod, target: E.PROMPTS.target },
  };
  const PALETTE = ["o1", "o2", "o3", "o4", "o5", "o6"];

  const state = { pair: "fig1", view: "token", src: 16, tgt: 16, picked: null, readout: null };

  function srcTokens() {
    return E.tokenize(PAIRS[state.pair].source);
  }
  function tgtTokens() {
    return E.tokenize(PAIRS[state.pair].target);
  }
  // Algorithm names get a neutral chip with the paper's symbol; glyphs are for types.
  function algChip(a) {
    return `<span class="alg-chip">${a.symbol ? `<span class="sym">${esc(a.symbol)}</span>` : ""}${esc(a.name)}</span>`;
  }
  function layersOf(a) {
    const out = [];
    for (let l = a.layers - 1; l >= E.EMB; l--) out.push(l);
    return out;
  }

  // Reference predictions that give each output color its meaning.
  function legendFor(algs, st, tt) {
    const base = E.outputLabel(E.output(algs[0], E.evaluate(algs[0], tt)));
    const entries = [];
    const seen = new Map();
    const add = (label, note) => {
      if (label === base) return;
      if (!seen.has(label)) {
        seen.set(label, { label, notes: [] });
        entries.push(seen.get(label));
      }
      if (note && !seen.get(label).notes.includes(note)) seen.get(label).notes.push(note);
    };
    for (const id of ["positional", "lexical", "reflexive"]) {
      const a = algs.find((x) => x.id === id);
      if (!a) continue;
      const r = E.interchangeIntervention(a, st, tt, { layer: 5, tok: 16 }, { layer: 5, tok: 16 });
      if (r.ok) add(E.outputLabel(E.output(a, r.counterfactual)), `${a.name} prediction`);
    }
    const srcAns = E.outputLabel(E.output(algs[0], E.evaluate(algs[0], st)));
    add(srcAns, "source answer");
    return { base, entries };
  }

  function makeColorer(legend) {
    const map = new Map();
    legend.entries.forEach((e, i) => map.set(e.label, PALETTE[i % PALETTE.length]));
    let next = legend.entries.length;
    return (label) => {
      if (label === legend.base) return "base";
      if (label === "∅") return "none";
      if (!map.has(label)) map.set(label, PALETTE[next++ % PALETTE.length]);
      return map.get(label);
    };
  }

  function shell() {
    host.innerHTML = `
      <div class="panel-header">
        <h3>Token sweep</h3>
        <div class="hdr-controls">
          <label class="sr-only" for="sw-pair">Prompt pair</label>
          <select id="sw-pair" class="select">${Object.entries(PAIRS).map(([k, p]) => `<option value="${k}">${esc(p.label)}</option>`).join("")}</select>
          <div class="seg" role="group" aria-label="View" data-slot="view"></div>
        </div>
      </div>
      <div class="sw-tokens" data-slot="tokens"></div>
      <div class="ci-hint" data-slot="hint" role="status" aria-live="polite"></div>
      <div class="sw-body" data-slot="body"></div>
      <div class="sw-legend" data-slot="legend"></div>
    `;
  }

  function renderTokens(st, tt) {
    const row = (toks, role, sel) =>
      `<div class="sw-row"><span class="ci-label"><span class="role-dot ${role}"></span><strong>${role === "source" ? "Source" : "Target"}</strong></span><div class="tok-strip" role="list">${toks
        .map(
          (t, i) =>
            `<button type="button" role="listitem" class="tokchip ${role}${i === sel ? " selected" : ""}${role === "source" && state.picked === i ? " picked" : ""}" data-role="${role}" data-tok="${i}" title="${esc(t)} (${i})"><span class="tok-text">${esc(t)}</span><span class="tok-idx">${i}</span></button>`
        )
        .join("")}</div></div>`;
    host.querySelector('[data-slot="tokens"]').innerHTML = row(st, "source", state.src) + row(tt, "target", state.tgt);
  }

  function render() {
    const st = srcTokens();
    const tt = tgtTokens();
    const algs = S.list().filter((a) => a.output);
    const equal = st.length === tt.length;
    if (state.view === "grid" && !equal) state.view = "token";
    host.querySelector("#sw-pair").value = state.pair;
    host.querySelector('[data-slot="view"]').innerHTML = [
      ["token", "One token"],
      ["grid", "Full grid"],
    ]
      .map(([k, l]) => `<button type="button" data-view="${k}" aria-pressed="${state.view === k}"${k === "grid" && !equal ? " disabled title=\"Needs prompts of equal length\"" : ""}>${l}</button>`)
      .join("");
    renderTokens(st, tt);

    const legend = legendFor(algs, st, tt);
    const color = makeColorer(legend);
    const hint = host.querySelector('[data-slot="hint"]');
    const body = host.querySelector('[data-slot="body"]');

    if (state.view === "token") {
      hint.innerHTML = state.picked !== null
        ? `Picked source “${esc(st[state.picked])}”. Click a target token.`
        : `Interchange interventions from source “${esc(st[state.src])}” (${state.src}) into target “${esc(tt[state.tgt])}” (${state.tgt}), one per layer. Each cell is the counterfactual output. Drag a source token onto a target token to change it.`;
      const sweeps = algs.map((a) => E.tokenSweep(a, st, tt, state.src, state.tgt));
      const layers = layersOf(algs[0]);
      const head = algs
        .map((a) => `<th scope="col">${algChip(a)}</th>`)
        .join("");
      const rows = layers
        .map((l, ri) => {
          const cells = sweeps
            .map((sw) => {
              const r = sw.find((x) => x.layer === l);
              if (!r) return `<td></td>`;
              const lab = E.outputLabel(r.value);
              const cls = !r.ok && !r.empty ? "na" : color(lab);
              const title = !r.ok ? r.reason : `${G.layerLabel(l)} → ${lab}`;
              return `<td><span class="out out-${cls}${r.empty ? " quiet" : ""}" title="${esc(title)}">${!r.ok && !r.empty ? "n/a" : esc(lab)}</span></td>`;
            })
            .join("");
          const net = ri === 0 ? `<td class="net-col" rowspan="${layers.length}"><span>Network sweep from Patch Lens</span><span class="muted">Phase 7</span></td>` : "";
          return `<tr><th scope="row" class="axis-layer">${G.layerLabel(l)}</th>${cells}${net}</tr>`;
        })
        .join("");
      body.innerHTML = `<div class="sweep-scroll"><table class="sweep"><thead><tr><th></th>${head}<th scope="col" class="net-head">Network</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    } else {
      hint.textContent = "Each cell is the counterfactual output of one interchange intervention: that (layer, token) of the source into the same position of the target. Click or focus a cell to read it; columns match the token strip above.";
      body.innerHTML = `<div class="heat-grid">${algs
        .map((a) => {
          const full = E.fullSweep(a, st, tt);
          const layers = layersOf(a);
          const cells = layers
            .map((l, ri) =>
              full
                .map((col, t) => {
                  const r = col[l + 1];
                  const lab = E.outputLabel(r.value);
                  const cls = !r.ok && !r.empty ? "na" : color(lab);
                  return `<button type="button" class="hcell out-${cls}${t === state.tgt ? " in-col" : ""}" style="grid-row:${ri + 1};grid-column:${t + 2}" data-alg="${esc(a.name)}" data-layer="${l}" data-tok="${t}" data-out="${esc(lab)}" aria-label="${esc(`${a.name}, ${G.layerLabel(l)}, ${tt[t]}: ${lab}`)}"></button>`;
                })
                .join("")
            )
            .join("");
          const ylabels = layers.map((l, ri) => `<span class="hy" style="grid-row:${ri + 1};grid-column:1">${G.layerLabel(l)}</span>`).join("");
          const xlabels = tt.map((t, i) => `<span class="hx mono" style="grid-row:${layers.length + 1};grid-column:${i + 2}" title="${esc(t)}">${esc(t)}</span>`).join("");
          return `<figure class="heat"><figcaption>${algChip(a)}</figcaption><div class="heat-scroll"><div class="heat-cells" style="grid-template-columns: 2.4rem repeat(${tt.length}, var(--hc)); grid-template-rows: repeat(${layers.length}, var(--hc)) auto">${ylabels}${cells}${xlabels}</div></div></figure>`;
        })
        .join("")}</div><p class="readout mono" data-slot="readout" aria-live="polite">${esc(state.readout || "Select a cell to read its output.")}</p>`;
    }

    host.querySelector('[data-slot="legend"]').innerHTML = `
      <span class="lg-item"><span class="out out-base">${esc(legend.base)}</span> unchanged (target's own answer)</span>
      ${legend.entries.map((e) => `<span class="lg-item"><span class="out out-${color(e.label)}">${esc(e.label)}</span> ${esc(e.notes.join(" · "))}</span>`).join("")}
      <span class="lg-item"><span class="out out-none">∅</span> no output (pointer can't be dereferenced)</span>
      <span class="lg-item"><span class="out out-base quiet">tea</span> lighter: nothing lives in that cell</span>
    `;
  }

  shell();
  render();
  S.subscribe(render);

  G.dragController(host, {
    sourceSelector: '.tokchip[data-role="source"]',
    dropSelector: '.tokchip[data-role="target"]',
    ghostHtml: (el) => `<span class="mono">${esc(srcTokens()[Number(el.dataset.tok)])}</span>`,
    onDrop: (s, t) => {
      state.src = Number(s.dataset.tok);
      state.tgt = Number(t.dataset.tok);
      state.picked = null;
      state.view = "token";
      render();
    },
  });

  host.addEventListener("click", (e) => {
    const t = e.target;
    const v = t.closest("[data-view]");
    if (v && !v.disabled) {
      state.view = v.dataset.view;
      return render();
    }
    const chip = t.closest(".tokchip");
    if (chip) {
      const i = Number(chip.dataset.tok);
      if (chip.dataset.role === "source") {
        state.picked = state.picked === i ? null : i;
        return render();
      }
      if (state.picked !== null) {
        state.src = state.picked;
        state.picked = null;
      } else if (srcTokens().length === tgtTokens().length) {
        state.src = i;
      }
      state.tgt = i;
      return render();
    }
    const hc = t.closest(".hcell");
    if (hc) {
      const tt = tgtTokens();
      state.readout = `${hc.dataset.alg} · ${G.layerLabel(Number(hc.dataset.layer))} · “${tt[Number(hc.dataset.tok)]}” (${hc.dataset.tok}) → ${hc.dataset.out}`;
      const ro = host.querySelector('[data-slot="readout"]');
      if (ro) ro.textContent = state.readout;
    }
  });

  host.addEventListener("focusin", (e) => {
    const hc = e.target.closest && e.target.closest(".hcell");
    if (!hc) return;
    const tt = tgtTokens();
    state.readout = `${hc.dataset.alg} · ${G.layerLabel(Number(hc.dataset.layer))} · “${tt[Number(hc.dataset.tok)]}” (${hc.dataset.tok}) → ${hc.dataset.out}`;
    const ro = host.querySelector('[data-slot="readout"]');
    if (ro) ro.textContent = state.readout;
  });

  host.addEventListener("mouseover", (e) => {
    const hc = e.target.closest && e.target.closest(".hcell");
    if (!hc) return;
    const tt = tgtTokens();
    const ro = host.querySelector('[data-slot="readout"]');
    if (ro) ro.textContent = `${hc.dataset.alg} · ${G.layerLabel(Number(hc.dataset.layer))} · “${tt[Number(hc.dataset.tok)]}” (${hc.dataset.tok}) → ${hc.dataset.out}`;
  });

  host.addEventListener("change", (e) => {
    if (e.target.id === "sw-pair") {
      state.pair = e.target.value;
      render();
    }
  });
})();
