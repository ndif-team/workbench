/*
 * Mockup 1 — Algorithm editor.
 * Prompt → layers × tokens grid → click a cell → "New variable" panel →
 * function (a primitive, shown as its Python source, or your own Python),
 * typed argument slots, output → save.
 */
(function () {
  "use strict";
  const E = window.ALEngine;
  const G = window.ALGrid;
  const S = window.ALStore;
  const host = document.getElementById("mock-editor");
  if (!host) return;
  const esc = G.esc;

  const state = {
    algId: "positional",
    alg: S.get("positional"),
    prompt: E.PROMPTS.target,
    tokens: E.tokenize(E.PROMPTS.target),
    orientation: "fig1",
    layerStep: 1,
    arrows: "auto",
    focus: new Set(),
    collapse: false,
    mode: "idle", // idle | form | export | save
    draft: null,
    selectedVar: null,
    hint: null,
    confirmDelete: false,
    saveName: "",
  };

  let gridCtl = null;
  let toastTimer = 0;

  // ---------------------------------------------------------------- helpers

  function templateLength() {
    return E.tokenize(state.alg.template || state.prompt).length;
  }

  function lastLayer() {
    return state.alg.layers - 1;
  }

  function lastTok() {
    return state.tokens.length - 1;
  }

  function cellName(layer, tok) {
    return `${G.layerLabel(layer)} · “${state.tokens[tok] ?? "?"}” (${tok})`;
  }

  function argLabel(a) {
    if (a.t !== undefined) return `“${state.tokens[a.t] ?? "?"}” (${a.t})`;
    const v = E.varMap(state.alg)[a.v];
    return v ? v.name : "?";
  }

  function pyIdent(label, used) {
    let s = String(label)
      .replace(/[“”()]/g, "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "");
    if (!s || /^[0-9]/.test(s)) s = "arg_" + s;
    let name = s;
    let i = 2;
    while (used.has(name)) name = `${s}_${i++}`;
    used.add(name);
    return name;
  }

  const PY_TYPES = { string: "str", int: "int", position: "Position" };
  function pyType(t) {
    if (!t) return "object";
    if (t.kind === "pair") return `Pair[${pyType(t.key)}, ${pyType(t.value)}]`;
    return PY_TYPES[t.kind] || "object";
  }

  function pythonStub(d) {
    const params = d.slots.map((sl) => sl.name);
    return `def compute(${params.join(", ")}) -> ${pyType(d.type)}:\n    # Return this cell's value. An argument with several\n    # references arrives as a list.\n    return None`;
  }

  // The primitive's Python source with the current option values as defaults,
  // renamed to compute() so it can be edited as a custom function.
  function bakedSource(fn, params, asCompute) {
    let src = E.pySource(fn);
    const spec = E.PRIMS[fn].params || {};
    for (const [k, o] of Object.entries(spec)) {
      const val = params[k] ?? o.default;
      const lit = typeof o.default === "number" ? String(Number(val)) : JSON.stringify(String(val));
      src = src.replace(new RegExp(`(\\b${k}: [^=,)]+= )([^,)\\n]+)`), `$1${lit}`);
    }
    if (asCompute) src = src.replace(/def\s+\w+\s*\(/, "def compute(");
    return src;
  }

  // Slots for a primitive, filled from a flat argument list.
  // Position ID's specials follow the algorithm's special tokens up to its cell.
  const isAuto = (fn, name) => fn === "position_id" && name === "specials";
  function fillSpecials(d) {
    if (d.fn !== "position_id") return d;
    const refs = (state.alg.specials || []).filter((t) => t <= d.tok).map((t) => ({ t }));
    d.slots = d.slots.map((sl) => (sl.name === "specials" ? { ...sl, args: refs } : sl));
    return d;
  }

  function primSlots(fn, args) {
    const split = E.splitArgs(fn, args || []);
    return E.slotsOf(fn).map((s, i) => ({ name: s.name, list: E.isList(s), args: split ? split[i].map((a) => ({ ...a })) : [] }));
  }

  function flatArgs(d) {
    return d.slots.flatMap((sl) => sl.args);
  }

  function firstOpenSlot(d) {
    const i = d.slots.findIndex((sl) => !sl.args.length && !isAuto(d.fn, sl.name));
    return i < 0 ? null : i;
  }

  // Slot labels and the type error the draft's arguments raise, if any.
  function draftTyping(d) {
    if (d.fn === "python") return { slots: d.slots.map((sl) => ({ ...sl, type: "" })), error: null, returns: d.type };
    return E.slotsFor(draftBase(), d.fn, d.slots.map((sl) => sl.args), d.params);
  }

  // The algorithm without the draft, which the draft's arguments come from.
  function draftBase() {
    const d = state.draft;
    return d && d.origId ? { ...state.alg, vars: state.alg.vars.filter((v) => v.id !== d.origId) } : state.alg;
  }

  function uniqueId(name, exceptId) {
    const base = String(name || "var").replace(/[^A-Za-z0-9_]/g, "_") || "var";
    let id = base;
    let i = 2;
    while (state.alg.vars.some((v) => v.id === id && v.id !== exceptId)) id = `${base}_${i++}`;
    return id;
  }

  function readersOf(id) {
    return state.alg.vars.filter((v) => v.args.some((a) => a.v === id));
  }

  function draftVar(d, id) {
    const v = {
      id,
      name: d.name || "new",
      layer: d.layer,
      tok: d.tok,
      fn: d.fn,
      params: d.fn === "python" ? {} : { ...d.params },
      args: flatArgs(d),
    };
    if (d.color) v.color = d.color;
    if (d.tags && d.tags.length) v.tags = d.tags.slice();
    if (d.fn === "python") {
      v.code = d.code || pythonStub(d);
      v.type = d.type;
      v.pySlots = d.slots.map((sl) => ({ name: sl.name, n: sl.args.length }));
    }
    return v;
  }

  function draftAlg() {
    // The algorithm with the draft applied, for previews and validation.
    const d = state.draft;
    const alg = JSON.parse(JSON.stringify(state.alg));
    const v = draftVar(d, d.origId || "__draft__");
    if (d.origId) alg.vars = alg.vars.map((x) => (x.id === d.origId ? v : x));
    else alg.vars.push(v);
    return { alg, id: v.id };
  }

  // Placement problems with the draft's arguments: [slot, index, message].
  function argErrors(d) {
    const errs = [];
    d.slots.forEach((sl, si) =>
      sl.args.forEach((a, i) => {
        const msg = E.validateArg(state.alg, { layer: d.layer, tok: d.tok }, a);
        if (msg) errs.push([si, i, msg]);
        if (a.v !== undefined && a.v === d.origId) errs.push([si, i, "A variable can't read itself."]);
      })
    );
    return errs;
  }

  function readerErrors(d) {
    if (!d.origId) return [];
    return readersOf(d.origId)
      .filter((r) => r.layer <= d.layer || r.tok < d.tok)
      .map((r) => `${r.name} reads this variable at ${G.layerLabel(r.layer)}; it must stay below and at or before that cell.`);
  }

  function toast(msg) {
    const t = host.querySelector(".mock-toast");
    if (!t) return;
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      t.hidden = true;
    }, 3200);
  }

  // ---------------------------------------------------------------- actions

  function loadAlgorithm(id) {
    if (id === "blank") {
      state.alg = { id: "untitled", name: "Untitled", layers: 8, template: state.prompt, specials: E.ALGORITHMS.positional.specials.slice(), output: null, vars: [] };
    } else {
      state.alg = S.get(id);
    }
    state.algId = id;
    state.mode = "idle";
    state.draft = null;
    state.selectedVar = null;
    state.hint = id === "blank" ? "Click any cell to place your first variable. Try the cell above “ale” at L0." : null;
    renderAll();
  }

  function setPrompt(text) {
    state.prompt = text;
    state.tokens = E.tokenize(text);
    if (!state.alg.vars.length) state.alg.template = text;
    state.focus = new Set([...state.focus].filter((t) => t < state.tokens.length));
    renderAll();
  }

  function openNew(layer, tok) {
    const isOutputCell = layer === lastLayer() && tok === lastTok();
    state.mode = "form";
    state.confirmDelete = false;
    state.selectedVar = null;
    state.draft = {
      isNew: true,
      origId: null,
      name: isOutputCell && !state.alg.output ? "answer" : "",
      layer,
      tok,
      fn: "position_id",
      slots: primSlots("position_id", []),
      active: 0,
      params: {},
      code: "",
      codeTouched: false,
      type: null,
      color: null,
      tags: [],
      isOutput: isOutputCell && !state.alg.output,
      error: null,
      pickError: null,
    };
    fillSpecials(state.draft);
    state.hint = null;
    renderAll();
    const name = host.querySelector("#ed-name");
    if (name) name.focus();
  }

  function openEdit(id) {
    const v = E.varMap(state.alg)[id];
    if (!v) return;
    state.mode = "form";
    state.confirmDelete = false;
    state.selectedVar = id;
    let slots;
    if (v.fn === "python") {
      let i = 0;
      slots = (v.pySlots || v.args.map((_, k) => ({ name: "arg" + k, n: 1 }))).map((ps) => {
        const args = v.args.slice(i, i + ps.n).map((a) => ({ ...a }));
        i += ps.n;
        return { name: ps.name, list: false, custom: true, args };
      });
    } else slots = primSlots(v.fn, v.args);
    state.draft = {
      isNew: false,
      origId: id,
      name: v.name,
      layer: v.layer,
      tok: v.tok,
      fn: v.fn,
      slots,
      active: null,
      params: { ...(v.params || {}) },
      code: v.code || "",
      codeTouched: !!v.code,
      type: v.type || null,
      color: v.color || null,
      tags: (v.tags || []).slice(),
      isOutput: state.alg.output === id,
      error: null,
      pickError: null,
    };
    state.hint = null;
    renderAll();
  }

  function closeForm() {
    state.mode = "idle";
    state.draft = null;
    state.selectedVar = null;
    state.confirmDelete = false;
    renderAll();
  }

  // A grid click: fill the active slot (or, for Python, a new argument) if
  // the placement rules and the slot's type allow it.
  function addArg(a) {
    const d = state.draft;
    if (!d) return;
    const msg = E.validateArg(state.alg, { layer: d.layer, tok: d.tok }, a);
    if (a.v !== undefined && a.v === d.origId) d.pickError = "A variable can't read itself.";
    else if (msg) d.pickError = msg;
    else {
      let i = d.active;
      if (d.fn === "python" && i === null) {
        const used = new Set(d.slots.map((sl) => sl.name));
        d.slots.push({ name: pyIdent(argLabel(a), used), list: false, custom: true, args: [] });
        i = d.slots.length - 1;
      }
      if (i === null) {
        d.pickError = "Choose an argument to fill first.";
        return renderAll();
      }
      const before = draftTyping(d).error;
      const prev = d.slots[i].args;
      d.slots[i].args = d.slots[i].list || d.fn === "python" ? [...prev, a] : [a];
      const after = draftTyping(d).error;
      if (after && after !== before) {
        d.slots[i].args = prev;
        d.pickError = after;
      } else {
        d.pickError = null;
        if (d.fn === "python") {
          if (!d.codeTouched) d.code = pythonStub(d);
        } else if (!d.slots[i].list) d.active = firstOpenSlot(d);
      }
    }
    renderAll();
  }

  function setFunction(fn) {
    const d = state.draft;
    if (fn === d.fn) return;
    if (fn === "python") {
      d.type = d.type || draftTyping(d).returns || { kind: "string" };
      d.slots = d.slots.filter((sl) => sl.args.length).map((sl) => ({ ...sl, list: false, custom: true }));
      d.fn = "python";
      d.code = pythonStub(d);
      d.codeTouched = false;
      d.active = null;
    } else {
      const old = d.slots;
      d.fn = fn;
      d.slots = E.slotsOf(fn).map((s) => {
        const same = old.find((o) => o.name === s.name);
        const list = E.isList(s);
        return { name: s.name, list, args: same ? (list ? same.args : same.args.slice(0, 1)) : [] };
      });
      d.params = {};
      for (const [k, spec] of Object.entries(E.PRIMS[fn].params || {})) d.params[k] = spec.default;
      d.type = null;
      fillSpecials(d);
      d.active = firstOpenSlot(d);
    }
    d.error = null;
    d.pickError = null;
    renderAll();
  }

  // Double-click on a primitive's code: edit it as your own Python function,
  // with the same arguments and type.
  function toPython() {
    const d = state.draft;
    if (!d || d.fn === "python") return;
    d.type = draftTyping(d).returns || { kind: "string" };
    d.code = bakedSource(d.fn, d.params, true);
    d.slots = d.slots.map((sl) => ({ ...sl, custom: true }));
    d.fn = "python";
    d.codeTouched = true;
    d.active = null;
    d.pickError = null;
    renderAll();
    const ta = host.querySelector("#ed-code");
    if (ta) ta.focus();
  }

  function saveDraft() {
    const d = state.draft;
    if (!d) return;
    const name = (d.name || "").trim();
    if (!name) {
      d.error = "Give the variable a name.";
      return renderAll();
    }
    if (state.alg.vars.some((v) => v.name === name && v.id !== d.origId)) {
      d.error = `Another variable is already called ${name}.`;
      return renderAll();
    }
    if (argErrors(d).length || readerErrors(d).length) {
      d.error = "Fix the highlighted problems first.";
      return renderAll();
    }
    if (d.fn !== "python") {
      const empty = d.slots.find((sl) => !sl.args.length);
      const chk = empty ? `${empty.name} is empty.` : E.arityProblem(d.fn, flatArgs(d).length);
      if (chk) {
        d.error = `${E.PRIMS[d.fn].label}: ${chk}`;
        return renderAll();
      }
      const typeErr = draftTyping(d).error;
      if (typeErr) {
        d.error = typeErr;
        return renderAll();
      }
    }
    const v = draftVar({ ...d, name }, d.origId || uniqueId(name));
    if (d.origId) state.alg.vars = state.alg.vars.map((x) => (x.id === d.origId ? v : x));
    else state.alg.vars.push(v);
    if (!state.alg.vars.some((x) => x.id !== v.id)) state.alg.template = state.prompt;
    if (d.isOutput) state.alg.output = v.id;
    else if (state.alg.output === v.id) state.alg.output = null;
    state.mode = "idle";
    state.draft = null;
    state.selectedVar = v.id;
    renderAll();
    toast(`${d.isNew ? "Added" : "Updated"} ${name} at ${cellName(v.layer, v.tok)}.`);
  }

  function deleteVar() {
    const d = state.draft;
    if (!d || !d.origId) return;
    const id = d.origId;
    const name = d.name;
    state.alg.vars = state.alg.vars
      .filter((v) => v.id !== id)
      .map((v) => ({ ...v, args: v.args.filter((a) => a.v !== id) }));
    if (state.alg.output === id) state.alg.output = null;
    closeForm();
    toast(`Deleted ${name}.`);
  }

  function saveAlgorithm() {
    const name = (state.saveName || "").trim();
    if (!name) {
      state.saveError = "Name the algorithm to save it.";
      return renderAll();
    }
    const problems = validity();
    const id = S.isPreset(state.algId) || state.algId === "blank" ? "user-" + Date.now().toString(36) : state.algId;
    const alg = { ...JSON.parse(JSON.stringify(state.alg)), id, name, symbol: "", blurb: "Saved from the editor mockup.", template: state.alg.template || state.prompt };
    S.save(alg);
    state.algId = id;
    state.alg = S.get(id);
    state.mode = "idle";
    state.saveError = null;
    renderAll();
    toast(problems.length ? `Saved “${name}”. It still needs an output before the visualizers can run it.` : `Saved “${name}”. It now appears in the visualizers below.`);
  }

  function validity() {
    const out = [];
    const o = state.alg.output && E.varMap(state.alg)[state.alg.output];
    if (!o) out.push("No output variable yet.");
    else if (o.layer !== lastLayer() || o.tok !== lastTok()) out.push(`The output must sit at ${cellName(lastLayer(), lastTok())}.`);
    return out;
  }

  // ---------------------------------------------------------------- render

  function seg(name, options, value, labelText) {
    return `<div class="seg" role="group" aria-label="${esc(labelText)}">${options
      .map(([v, l]) => `<button type="button" data-seg="${name}" data-val="${v}" aria-pressed="${String(v) === String(value)}">${esc(l)}</button>`)
      .join("")}</div>`;
  }

  function algOptions() {
    const list = S.list();
    return (
      list.map((a) => `<option value="${esc(a.id)}"${a.id === state.algId ? " selected" : ""}>${esc(a.name)}${S.isPreset(a.id) ? " (paper)" : ""}</option>`).join("") +
      `<option value="blank"${state.algId === "blank" ? " selected" : ""}>Blank algorithm</option>`
    );
  }

  function renderShell() {
    host.innerHTML = `
      <div class="panel-header">
        <h3>Algorithm editor</h3>
        <div class="hdr-controls">
          <label class="sr-only" for="ed-alg">Algorithm</label>
          <select id="ed-alg" class="select">${algOptions()}</select>
          <button type="button" class="btn" data-act="save-open">Save as…</button>
          <button type="button" class="btn" data-act="export">Export to causalab</button>
        </div>
      </div>
      <div class="mock-toolbar prompt-bar">
        <label for="ed-prompt" class="tb-label">Prompt</label>
        <input id="ed-prompt" class="input mono" type="text" spellcheck="false" />
        <div class="presets" role="group" aria-label="Example prompts">
          <button type="button" class="btn btn-ghost" data-preset="target">What does Tim love?</button>
          <button type="button" class="btn btn-ghost" data-preset="source">What does Ann love?</button>
          <button type="button" class="btn btn-ghost" data-preset="source_cod">Ann, with cod</button>
        </div>
      </div>
      <div class="mock-toolbar controls-bar" data-slot="controls"></div>
      <div class="banner" data-slot="banner" hidden></div>
      <div class="editor-body">
        <div class="editor-grid" data-slot="grid"></div>
        <aside class="side-panel" data-slot="panel" aria-label="Variable panel"></aside>
      </div>
      <div class="status-bar" data-slot="status"></div>
      <div class="mock-toast" role="status" aria-live="polite" hidden></div>
    `;
    host.querySelector("#ed-prompt").value = state.prompt;
  }

  function renderControls() {
    const c = host.querySelector('[data-slot="controls"]');
    c.innerHTML = `
      <span class="tb-group"><span class="tb-label">Layer step</span>${seg("step", [[1, "1"], [2, "2"], [4, "4"]], state.layerStep, "Layer step")}</span>
      <span class="tb-group"><span class="tb-label">Layout</span>${seg("orient", [["fig1", "Figure 1"], ["patchlens", "Patch Lens"]], state.orientation, "Layout")}</span>
      <span class="tb-group"><span class="tb-label">Arrows</span>${seg("arrows", [["auto", "Nearby"], ["all", "All"], ["none", "None"]], state.arrows, "Arrows")}</span>
      <span class="tb-group">
        <label class="switch"><input type="checkbox" id="ed-collapse" ${state.collapse ? "checked" : ""} ${state.focus.size ? "" : "disabled"}/><span class="switch-track" aria-hidden="true"></span><span>Collapse unfocused</span></label>
        <span class="tb-note">${state.focus.size ? `${state.focus.size} focused · <button type="button" class="linklike" data-act="clear-focus">Clear</button>` : "Click tokens to focus them"}</span>
      </span>
    `;
  }

  function renderBanner() {
    const b = host.querySelector('[data-slot="banner"]');
    const n = state.tokens.length;
    const m = templateLength();
    if (state.alg.vars.length && n !== m) {
      b.hidden = false;
      b.innerHTML = `This prompt has ${n} tokens, but the algorithm was placed on a ${m}-token prompt. Variables are anchored by token index, so some may sit on the wrong tokens or off the grid (see <a href="#q-anchor">Q1</a>).`;
    } else if (state.hint) {
      b.hidden = false;
      b.innerHTML = esc(state.hint);
    } else {
      b.hidden = true;
    }
  }

  function renderGrid() {
    const slot = host.querySelector('[data-slot="grid"]');
    const alg = { ...state.alg, vars: state.alg.vars.filter((v) => v.tok < state.tokens.length) };
    let shown = alg;
    let argKeys = null;
    let pending = null;
    if (state.mode === "form" && state.draft) {
      const da = draftAlg();
      shown = { ...da.alg, vars: da.alg.vars.filter((v) => v.tok < state.tokens.length) };
      argKeys = new Set(flatArgs(state.draft).map(E.argKey));
      pending = { layer: state.draft.layer, tok: state.draft.tok };
    }
    const ev = E.evaluate(shown, state.tokens);
    if (gridCtl) gridCtl.destroy();
    gridCtl = G.render(slot, {
      alg: shown,
      tokens: state.tokens,
      ev,
      orientation: state.orientation,
      layerStep: state.layerStep,
      focus: state.focus,
      collapse: state.collapse,
      role: "editor",
      selectedVar: state.mode === "form" && state.draft ? state.draft.origId || "__draft__" : state.selectedVar,
      pendingCell: pending,
      argKeys,
      arrows: state.arrows,
      onTokenClick: true,
    });
    if (state.mode === "form") slot.classList.add("picking");
    else slot.classList.remove("picking");
  }

  function typeName(t) {
    return `<span class="type-name">${G.glyph(t)}<span class="mono">${esc(E.describeType(t))}</span></span>`;
  }

  // Python's declared type: a kind, and for a pair a key and value type,
  // nested (up to two levels).
  function typePicker(t, path, depth) {
    const kinds = [["string", "string"], ["int", "int"], ["position", "position ID"]];
    if (depth < 3) kinds.push(["pair", "key : value pair"]);
    const sel = `<select class="select" data-type-path="${path}" aria-label="${path === "type" ? "Type" : path.endsWith("key") ? "Key type" : "Value type"}">${kinds
      .map(([k, l]) => `<option value="${k}"${t && t.kind === k ? " selected" : ""}>${l}</option>`)
      .join("")}</select>`;
    if (!t || t.kind !== "pair") return sel;
    return `${sel}<div class="type-tree">
      <div class="type-row"><span>key</span>${typePicker(t.key, path + ".key", depth + 1)}</div>
      <div class="type-row"><span>value</span>${typePicker(t.value, path + ".value", depth + 1)}</div>
    </div>`;
  }

  function argChip(a, si, i, err) {
    const types = E.inferTypes(draftBase()).types;
    const t = a.t !== undefined ? { kind: "string" } : types[a.v] || null;
    return `<span class="ref-chip${err ? " invalid" : ""}" title="${esc(err ? err[2] : E.describeType(t))}">${G.glyph(t)}<span class="mono">${esc(argLabel(a))}</span><button type="button" class="icon-btn sm" data-rm-ref="${si}:${i}" aria-label="Remove ${esc(argLabel(a))}">×</button></span>`;
  }

  function renderPanel() {
    const p = host.querySelector('[data-slot="panel"]');
    if (state.mode === "export") return renderExport(p);
    if (state.mode === "save") return renderSave(p);
    if (state.mode !== "form" || !state.draft) return renderIdle(p);
    const d = state.draft;
    const isPy = d.fn === "python";
    const prim = isPy ? null : E.PRIMS[d.fn];
    const aErr = argErrors(d);
    const rErr = readerErrors(d);
    const typing = draftTyping(d);
    const { alg: dAlg, id: dId } = draftAlg();
    let preview = "—";
    let previewNote = "";
    try {
      const ev = E.evaluate(dAlg, state.tokens);
      preview = E.show(ev.vals[dId]);
      if (isPy) previewNote = "Python isn't executed in this mockup.";
      else if (d.slots.some((sl) => !sl.args.length) || E.arityProblem(d.fn, flatArgs(d).length)) previewNote = "Waiting for arguments.";
    } catch (e) {
      preview = "error";
      previewNote = String(e.message || e);
    }

    const layerOpts = [];
    for (let l = 0; l < state.alg.layers; l++) layerOpts.push(l);

    const params =
      prim && prim.params
        ? Object.entries(prim.params)
            .map(([k, spec]) => {
              const val = d.params[k] ?? spec.default;
              if (spec.options)
                return `<label class="field-inline"><span>${esc(spec.label)}</span><select class="select" data-param="${k}">${spec.options.map((o) => `<option${o === val ? " selected" : ""}>${o}</option>`).join("")}</select></label>`;
              return `<label class="field-inline"><span>${esc(spec.label)}</span><input class="input mono narrow" data-param="${k}" value="${esc(val)}" /></label>`;
            })
            .join("")
        : "";

    const codeHtml = isPy
      ? `<label class="sr-only" for="ed-code">Python function</label>
         <textarea id="ed-code" class="code-input mono" rows="9" spellcheck="false">${esc(d.code || pythonStub(d))}</textarea>
         <p class="field-help"><span class="mono">compute</span> takes one parameter per argument; an argument with several references arrives as a list.</p>`
      : `<pre class="code-block py mono" tabindex="0" data-dbl="to-python" title="Double-click to edit as your own Python function">${esc(bakedSource(d.fn, d.params, false))}</pre>
         <div class="code-foot"><p class="field-help">Double-click the code to edit it as your own Python function.</p><button type="button" class="btn btn-ghost" data-act="to-python">Edit as Python</button></div>`;

    const typeHtml = isPy
      ? `<div class="type-picker">${typePicker(d.type || { kind: "string" }, "type", 1)}</div>
         <p class="field-help"><span class="mono">compute</span> returns ${typeName(d.type || { kind: "string" })}</p>`
      : typing.returns
        ? typeName(typing.returns)
        : `<p class="field-help">Fills in once the arguments are chosen.</p>`;

    const slotsHtml = typing.slots.length
      ? `<ul class="slot-list">${typing.slots
          .map((sl, si) => {
            const active = d.active === si;
            const refs = sl.args.length
              ? `<div class="slot-refs">${sl.args.map((a, i) => argChip(a, si, i, aErr.find(([s2, j]) => s2 === si && j === i))).join("")}</div>`
              : `<span class="slot-empty">Empty</span>`;
            const name = isPy
              ? `<input class="input mono slot-name-input" data-slot-name="${si}" value="${esc(sl.name)}" aria-label="Argument name" spellcheck="false" />`
              : `<span class="slot-name mono">${esc(sl.name)}</span>`;
            return `<li class="slot${active ? " active" : ""}">
              <div class="slot-head">${name}${sl.type ? `<span class="slot-type mono">${esc(sl.type)}</span>` : ""}<span class="spacer"></span>
                ${isAuto(d.fn, sl.name) ? "" : `<button type="button" class="btn btn-sm${active ? " btn-primary" : ""}" data-pick="${si}" aria-pressed="${active}">${active ? "Picking" : "Pick"}</button>`}
                ${isPy ? `<button type="button" class="icon-btn" data-rm-slot="${si}" aria-label="Remove argument ${esc(sl.name)}">×</button>` : ""}
              </div>
              ${refs}
              ${isAuto(d.fn, sl.name) ? `<span class="field-help">The algorithm's special tokens (the names) up to this cell.</span>` : ""}
            </li>`;
          })
          .join("")}</ul>`
      : "";
    const activeName = d.active !== null && d.slots[d.active] ? d.slots[d.active].name : null;
    const argHelp = activeName
      ? `Click tokens or variables in the grid to fill <span class="mono">${esc(activeName)}</span>. Each one draws an arrow into this cell.`
      : isPy
        ? "Click a token or variable in the grid to add it as a new argument, or choose an argument to fill."
        : typing.slots.length
          ? "Choose an argument, then click tokens or variables in the grid."
          : "This function takes no arguments.";

    const isOutCell = d.layer === lastLayer() && d.tok === lastTok();
    p.innerHTML = `
      <div class="sp-header">
        <h4>${d.isNew ? "New variable" : "Edit variable"}</h4>
        <button type="button" class="icon-btn" data-act="close" aria-label="Close panel">×</button>
      </div>
      <div class="sp-body">
        <div class="field">
          <label class="field-label" for="ed-name">Name</label>
          <input id="ed-name" class="input mono" type="text" value="${esc(d.name)}" placeholder="e.g. position" spellcheck="false" />
        </div>
        <div class="field">
          <span class="field-label">Location</span>
          <div class="loc">
            <span class="mono loc-cell">“${esc(state.tokens[d.tok] ?? "?")}” (${d.tok})</span>
            <label class="sr-only" for="ed-layer">Layer</label>
            <select id="ed-layer" class="select">${layerOpts.map((l) => `<option value="${l}"${l === d.layer ? " selected" : ""}>${G.layerLabel(l)}</option>`).join("")}</select>
          </div>
          ${rErr.map((m) => `<p class="field-err">${esc(m)}</p>`).join("")}
        </div>
        <div class="field">
          <label class="field-label" for="ed-fn">Function</label>
          <select id="ed-fn" class="select full">${Object.entries(E.PRIMS)
            .map(([k, pr]) => `<option value="${k}"${k === d.fn ? " selected" : ""}>${esc(pr.label)}</option>`)
            .join("")}<option disabled>──────────</option><option value="python"${isPy ? " selected" : ""}>Custom Python</option></select>
          ${params ? `<div class="params">${params}</div>` : ""}
          ${codeHtml}
        </div>
        <div class="field">
          <span class="field-label">Type</span>
          ${typeHtml}
        </div>
        <div class="field">
          <div class="field-row"><span class="field-label">Arguments</span>${isPy ? `<button type="button" class="btn btn-ghost" data-act="add-py-arg">＋ Add argument</button>` : ""}</div>
          <p class="field-help">${argHelp}</p>
          ${slotsHtml}
          ${d.pickError ? `<p class="field-err" role="alert">${esc(d.pickError)}</p>` : ""}
        </div>
        <div class="field">
          <span class="field-label">Color</span>
          <div class="swatches" role="radiogroup" aria-label="Color">${[null, "indigo", "emerald", "amber", "red"]
            .map((c) => `<button type="button" role="radio" class="swatch-btn${(d.color || null) === c ? " on" : ""}" aria-checked="${(d.color || null) === c}" data-color="${c || ""}" title="${c || "Default"}"><span class="swatch${c ? " c-" + c : ""}"></span></button>`)
            .join("")}</div>
        </div>
        <div class="field">
          <label class="field-label" for="ed-tags">Tags</label>
          <input id="ed-tags" class="input" type="text" value="${esc((d.tags || []).join(", "))}" placeholder="e.g. positional" spellcheck="false" />
          <p class="field-help">For your own bookkeeping, such as the algorithm a variable serves. Separate tags with commas.</p>
        </div>
        <label class="check ${isOutCell ? "" : "disabled"}"><input type="checkbox" id="ed-output" ${d.isOutput ? "checked" : ""} ${isOutCell ? "" : "disabled"}/> Output variable</label>
        ${isOutCell ? "" : `<p class="field-help">Only a variable at ${esc(cellName(lastLayer(), lastTok()))} can be the output.</p>`}
        <div class="preview">
          <span class="field-label">Value on this prompt</span>
          <span class="preview-val mono">${esc(preview)}</span>
          ${previewNote ? `<span class="preview-note">${esc(previewNote)}</span>` : ""}
        </div>
        ${d.error ? `<p class="field-err" role="alert">${esc(d.error)}</p>` : ""}
      </div>
      <div class="sp-footer">
        ${
          d.origId
            ? state.confirmDelete
              ? `<span class="confirm">Delete ${esc(d.name)}${readersOf(d.origId).length ? ` and remove it from ${readersOf(d.origId).map((r) => r.name).join(", ")}` : ""}?</span><button type="button" class="btn btn-destructive" data-act="delete-yes">Delete</button><button type="button" class="btn" data-act="delete-no">Keep</button>`
              : `<button type="button" class="btn btn-ghost danger" data-act="delete">Delete</button>`
            : ""
        }
        <span class="spacer"></span>
        ${state.confirmDelete ? "" : `<button type="button" class="btn" data-act="close">Cancel</button><button type="button" class="btn btn-primary" data-act="save-var">${d.isNew ? "Add variable" : "Save"}</button>`}
      </div>
    `;
  }

  function renderIdle(p) {
    const vm = E.varMap(state.alg);
    const types = E.inferTypes(state.alg).types;
    const vars = state.alg.vars.slice().sort((a, b) => a.layer - b.layer || a.tok - b.tok);
    const rows = vars
      .map(
        (v) =>
          `<li><button type="button" class="var-row${state.selectedVar === v.id ? " active" : ""}" data-edit="${esc(v.id)}">${G.nameChip(v.name, types[v.id], state.alg.output === v.id ? "is-output" : "", v.color)}${v.tags && v.tags.length ? `<span class="var-tags">${esc(v.tags.join(", "))}</span>` : ""}<span class="var-meta mono">${esc(G.layerLabel(v.layer))} · ${esc(state.tokens[v.tok] ?? "—")}</span><span class="var-fn">${esc(v.fn === "python" ? "Python" : E.PRIMS[v.fn] ? E.PRIMS[v.fn].label : v.fn)}</span>${state.alg.output === v.id ? '<span class="badge">output</span>' : ""}</button></li>`
      )
      .join("");
    const alg = state.alg;
    p.innerHTML = `
      <div class="sp-header"><h4>${esc(alg.name || "Algorithm")}</h4></div>
      <div class="sp-body">
        ${alg.blurb ? `<p class="fn-doc">${esc(alg.blurb)}</p>` : ""}
        <p class="empty-note">Click an empty cell to add a variable. Click a variable to edit it. Click a token to focus it.</p>
        ${vars.length ? `<ul class="var-list">${rows}</ul>` : `<p class="empty-note">No variables yet.</p>`}
      </div>
    `;
    void vm;
  }

  function renderExport(p) {
    const code = E.toPython(state.alg, state.tokens);
    p.innerHTML = `
      <div class="sp-header"><h4>Export to causalab</h4><button type="button" class="icon-btn" data-act="close" aria-label="Close panel">×</button></div>
      <div class="sp-body">
        <p class="fn-doc">Preview of the generated <span class="mono">@mechanism</span>. Each value carried up the residual stream becomes a relay node, so an interchange intervention at any layer is an ordinary causalab intervention (§4.3).</p>
        <pre class="code-block mono" tabindex="0"><code>${esc(code)}</code></pre>
      </div>
      <div class="sp-footer"><span class="spacer"></span><button type="button" class="btn" data-act="copy-code">Copy</button></div>
    `;
  }

  function renderSave(p) {
    const problems = validity();
    p.innerHTML = `
      <div class="sp-header"><h4>Save algorithm</h4><button type="button" class="icon-btn" data-act="close" aria-label="Close panel">×</button></div>
      <div class="sp-body">
        <div class="field">
          <label class="field-label" for="ed-save-name">Name</label>
          <input id="ed-save-name" class="input" type="text" value="${esc(state.saveName)}" placeholder="e.g. Positional, query via clause" />
        </div>
        ${problems.length ? `<p class="field-help">${problems.map(esc).join(" ")} You can save now and finish later.</p>` : `<p class="field-help">Ready: the output is defined, so the visualizers can run it.</p>`}
        ${state.saveError ? `<p class="field-err" role="alert">${esc(state.saveError)}</p>` : ""}
        <p class="fn-doc">In this mockup, saved algorithms live in this browser only. In workbench they belong to the workspace (§9).</p>
      </div>
      <div class="sp-footer"><span class="spacer"></span><button type="button" class="btn" data-act="close">Cancel</button><button type="button" class="btn btn-primary" data-act="save-alg">Save</button></div>
    `;
    const input = p.querySelector("#ed-save-name");
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }

  function renderStatus() {
    const s = host.querySelector('[data-slot="status"]');
    const problems = validity();
    const n = state.alg.vars.length;
    const out = state.alg.output && E.varMap(state.alg)[state.alg.output];
    s.innerHTML = `
      <span>${n} variable${n === 1 ? "" : "s"} · ${state.alg.layers} layers · ${state.tokens.length} tokens</span>
      <span class="status-out ${problems.length ? "warn" : "ok"}">${
        problems.length
          ? `${esc(problems[0])} <button type="button" class="linklike" data-act="add-output">Add output at ${esc(cellName(lastLayer(), lastTok()))}</button>`
          : `Output: <span class="mono">${esc(out.name)}</span> = <span class="mono">${esc(E.outputLabel(E.output(state.alg, E.evaluate(state.alg, state.tokens))))}</span>`
      }</span>
    `;
  }

  function renderAll() {
    host.querySelector("#ed-alg").innerHTML = algOptions();
    renderControls();
    renderBanner();
    renderGrid();
    renderPanel();
    renderStatus();
  }

  // ---------------------------------------------------------------- events

  renderShell();
  renderAll();
  S.subscribe(() => {
    host.querySelector("#ed-alg").innerHTML = algOptions();
  });

  host.addEventListener("change", (e) => {
    const t = e.target;
    if (t.id === "ed-alg") return loadAlgorithm(t.value);
    if (t.id === "ed-collapse") {
      state.collapse = t.checked;
      return renderAll();
    }
    const d = state.draft;
    if (!d) return;
    if (t.id === "ed-fn") return setFunction(t.value);
    if (t.dataset.typePath) {
      const kind = t.value;
      const fresh = kind === "pair" ? { kind, key: { kind: "position" }, value: { kind: "string" } } : { kind };
      const keys = t.dataset.typePath.split(".").slice(1);
      if (!keys.length) d.type = fresh;
      else {
        let node = d.type;
        for (const k of keys.slice(0, -1)) node = node[k];
        node[keys[keys.length - 1]] = fresh;
      }
      if (!d.codeTouched) d.code = pythonStub(d);
      return renderAll();
    }
    if (t.id === "ed-layer") {
      d.layer = Number(t.value);
      d.error = null;
      if (d.layer !== lastLayer() || d.tok !== lastTok()) d.isOutput = false;
      return renderAll();
    }
    if (t.id === "ed-output") {
      d.isOutput = t.checked;
      return renderAll();
    }
    if (t.dataset.param) {
      d.params[t.dataset.param] = t.value;
      return renderAll();
    }
  });

  host.addEventListener("input", (e) => {
    const t = e.target;
    if (t.id === "ed-name" && state.draft) {
      state.draft.name = t.value;
      state.draft.error = null;
    }
    if (t.id === "ed-code" && state.draft) {
      state.draft.code = t.value;
      state.draft.codeTouched = true;
    }
    if (t.id === "ed-tags" && state.draft) {
      state.draft.tags = t.value
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
    }
    if (t.dataset.slotName !== undefined && state.draft) {
      state.draft.slots[Number(t.dataset.slotName)].name = t.value;
      if (!state.draft.codeTouched) {
        state.draft.code = pythonStub(state.draft);
        const ta = host.querySelector("#ed-code");
        if (ta) ta.value = state.draft.code;
      }
    }
    if (t.id === "ed-save-name") state.saveName = t.value;
  });

  host.addEventListener("keydown", (e) => {
    const t = e.target;
    if (t.id === "ed-prompt" && e.key === "Enter") {
      e.preventDefault();
      setPrompt(t.value);
    }
    if (t.id === "ed-name" && e.key === "Enter") {
      e.preventDefault();
      saveDraft();
    }
    if (t.id === "ed-save-name" && e.key === "Enter") {
      e.preventDefault();
      saveAlgorithm();
    }
    if (t.id === "ed-code" && e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      saveDraft();
    }
    if ((e.key === "Enter" || e.key === " ") && (t.classList.contains("cell") || t.classList.contains("toklabel"))) {
      e.preventDefault();
      t.click();
    }
    if (e.key === "Escape" && state.mode !== "idle") closeForm();
  });

  host.addEventListener("focusout", (e) => {
    if (e.target.id === "ed-prompt" && e.target.value !== state.prompt) setPrompt(e.target.value);
  });

  host.addEventListener("click", (e) => {
    const t = e.target;
    const segBtn = t.closest("[data-seg]");
    if (segBtn) {
      const v = segBtn.dataset.val;
      const k = segBtn.dataset.seg;
      if (k === "step") state.layerStep = Number(v);
      if (k === "orient") state.orientation = v;
      if (k === "arrows") state.arrows = v;
      return renderAll();
    }
    const preset = t.closest("[data-preset]");
    if (preset) {
      const text = E.PROMPTS[preset.dataset.preset];
      host.querySelector("#ed-prompt").value = text;
      return setPrompt(text);
    }
    const rm = t.closest("[data-rm-ref]");
    if (rm && state.draft) {
      const [si, i] = rm.dataset.rmRef.split(":").map(Number);
      state.draft.slots[si].args.splice(i, 1);
      state.draft.pickError = null;
      return renderAll();
    }
    const swatch = t.closest("[data-color]");
    if (swatch && state.draft) {
      state.draft.color = swatch.dataset.color || null;
      return renderAll();
    }
    const pick = t.closest("[data-pick]");
    if (pick && state.draft) {
      const i = Number(pick.dataset.pick);
      state.draft.active = state.draft.active === i ? null : i;
      state.draft.pickError = null;
      return renderAll();
    }
    const rmSlot = t.closest("[data-rm-slot]");
    if (rmSlot && state.draft) {
      const i = Number(rmSlot.dataset.rmSlot);
      state.draft.slots.splice(i, 1);
      if (state.draft.active === i) state.draft.active = null;
      else if (state.draft.active > i) state.draft.active -= 1;
      if (!state.draft.codeTouched) state.draft.code = pythonStub(state.draft);
      return renderAll();
    }
    const edit = t.closest("[data-edit]");
    if (edit) return openEdit(edit.dataset.edit);
    const act = t.closest("[data-act]");
    if (act) {
      const a = act.dataset.act;
      if (a === "close") return closeForm();
      if (a === "save-var") return saveDraft();
      if (a === "delete") {
        state.confirmDelete = true;
        return renderAll();
      }
      if (a === "delete-no") {
        state.confirmDelete = false;
        return renderAll();
      }
      if (a === "delete-yes") return deleteVar();
      if (a === "export") {
        state.mode = "export";
        state.draft = null;
        return renderAll();
      }
      if (a === "save-open") {
        state.mode = "save";
        state.draft = null;
        state.saveError = null;
        state.saveName = S.isPreset(state.algId) ? `${state.alg.name} (my copy)` : state.alg.name || "";
        return renderAll();
      }
      if (a === "save-alg") return saveAlgorithm();
      if (a === "clear-focus") {
        state.focus = new Set();
        state.collapse = false;
        return renderAll();
      }
      if (a === "add-output") return openNew(lastLayer(), lastTok());
      if (a === "to-python") return toPython();
      if (a === "add-py-arg" && state.draft) {
        const used = new Set(state.draft.slots.map((sl) => sl.name));
        state.draft.slots.push({ name: pyIdent("arg", used), list: false, custom: true, args: [] });
        state.draft.active = state.draft.slots.length - 1;
        if (!state.draft.codeTouched) state.draft.code = pythonStub(state.draft);
        return renderAll();
      }
      if (a === "copy-code") {
        const code = E.toPython(state.alg, state.tokens);
        const done = () => toast("Copied the generated Python.");
        try {
          navigator.clipboard.writeText(code).then(done, () => selectCode());
        } catch (err) {
          selectCode();
        }
        return;
      }
    }

    // Grid interactions.
    const gridSlot = host.querySelector('[data-slot="grid"]');
    if (!gridSlot.contains(t)) return;
    const chip = t.closest(".chip");
    const tok = t.closest(".toklabel");
    const cell = t.closest(".cell");
    if (state.mode === "form" && state.draft) {
      if (chip && chip.dataset.var && chip.dataset.var !== "__draft__") return addArg({ v: chip.dataset.var });
      if (tok) return addArg({ t: Number(tok.dataset.tok) });
      if (cell) {
        state.draft.pickError = "Click a token or a variable to add it as an argument. To move this variable, change its layer above.";
        return renderAll();
      }
      return;
    }
    if (chip && chip.dataset.var) return openEdit(chip.dataset.var);
    if (tok) {
      const i = Number(tok.dataset.tok);
      if (state.focus.has(i)) state.focus.delete(i);
      else state.focus.add(i);
      if (!state.focus.size) state.collapse = false;
      return renderAll();
    }
    if (cell) return openNew(Number(cell.dataset.layer), Number(cell.dataset.tok));
  });

  host.addEventListener("dblclick", (e) => {
    if (e.target.closest('[data-dbl="to-python"]')) toPython();
  });

  function selectCode() {
    const pre = host.querySelector(".code-block");
    if (!pre) return;
    const r = document.createRange();
    r.selectNodeContents(pre);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
    toast("Press Ctrl/⌘-C to copy the selected code.");
  }
})();
