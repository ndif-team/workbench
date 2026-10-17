/*
 * Algorithm Hypothesis — grid renderer shared by every mockup.
 *
 * Draws one prompt's layers × tokens grid for an algorithm, with the
 * variables in their cells, their residual spans, and argument arrows.
 * Chips take their glyph from the variable's type and their color from the
 * variable itself (black by default). An argument
 * arrow leaves from where the value is recalled: the copy one layer below
 * the reader, at the top of the value's span when the reader is above it.
 * Two orientations:
 *   "fig1"      tokens across, layers going up (Figure 1 of the paper)
 *   "patchlens" tokens down, layers across (workbench Patch Lens)
 */
(function (root) {
  "use strict";
  const E = root.ALEngine;
  const SVGNS = "http://www.w3.org/2000/svg";

  // Glyphs by type, after Figure 1 of the paper: a diamond for a position ID,
  // a circle for a string or int, key : value for a pair (◇ : ●).
  const MARKS = {
    position: '<svg viewBox="0 0 12 12" class="mark ty-position" aria-hidden="true"><path d="M6 1 11 6 6 11 1 6Z" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
    string: '<svg viewBox="0 0 12 12" class="mark ty-string" aria-hidden="true"><circle cx="6" cy="6" r="4" fill="currentColor"/></svg>',
    int: '<svg viewBox="0 0 12 12" class="mark ty-int" aria-hidden="true"><circle cx="6" cy="6" r="4" fill="currentColor"/></svg>',
    unknown: '<svg viewBox="0 0 12 12" class="mark ty-unknown" aria-hidden="true"><rect x="2" y="2" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.2" stroke-dasharray="2 1.5"/></svg>',
  };

  function glyph(t) {
    if (!t || t.kind !== "pair") return MARKS[t ? t.kind : "unknown"] || MARKS.unknown;
    const side = (x) => (x.kind === "pair" ? `<span class="glyph-paren">(</span>${glyph(x)}<span class="glyph-paren">)</span>` : glyph(x));
    return `<span class="glyph-pair" aria-hidden="true">${side(t.key)}<span class="glyph-colon">:</span>${side(t.value)}</span>`;
  }

  

  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  }

  function layerLabel(l) {
    return l === E.EMB ? "Emb" : "L" + l;
  }

  function displayLayers(nLayers, step) {
    const out = [];
    for (let l = 0; l < nLayers; l++) if (l % step === 0 || l === nLayers - 1) out.push(l);
    return out;
  }

  // Columns to draw: every token, or focused tokens with runs of unfocused
  // tokens collapsed into a single gap column.
  function displayTokens(n, focus, collapse) {
    const cols = [];
    if (!collapse || !focus || !focus.size) {
      for (let t = 0; t < n; t++) cols.push({ tok: t });
      return cols;
    }
    let gap = [];
    for (let t = 0; t < n; t++) {
      if (focus.has(t)) {
        if (gap.length) cols.push({ gap });
        gap = [];
        cols.push({ tok: t });
      } else gap.push(t);
    }
    if (gap.length) cols.push({ gap });
    return cols;
  }

  function chipHtml(v, value, opts) {
    const type = opts.type || null;
    const label = opts.chipLabel === "name" ? v.name : E.show(value);
    const title = `${v.name} = ${E.show(value)} (${E.describeType(type)})`;
    return `<span class="chip${v.color ? " c-" + esc(v.color) : ""}${opts.isOutput ? " is-output" : ""}${opts.ghost ? " ghost" : ""}${opts.selected ? " selected" : ""}${opts.intervened ? " intervened" : ""}${opts.changed ? " changed" : ""}" data-var="${esc(v.id)}" title="${esc(title)}">${glyph(type)}<span class="chip-text">${esc(label)}</span></span>`;
  }

  // A chip for an algorithm or variable name, outside the grid.
  function nameChip(name, type, extra, color) {
    return `<span class="chip${color ? " c-" + esc(color) : ""}${extra ? " " + extra : ""}">${glyph(type)}<span class="chip-text">${esc(name)}</span></span>`;
  }

  /**
   * render(host, opts) → controller
   *
   * opts: alg, tokens, ev (evaluation to display), orientation, layerStep,
   *   focus (Set), collapse (bool), role ("editor"|"source"|"target"|"result"),
   *   selectedVar, pickedCell {layer,tok}, interventionCell {layer,tok},
   *   pendingCell {layer,tok}, baseEv (to mark changed values), argKeys (Set
   *   of node keys to ring), arrows ("auto"|"all"|"none"), chipLabel,
   *   showEmbRow, compact
   */
  function render(host, opts) {
    const alg = opts.alg;
    const tokens = opts.tokens;
    const nL = alg.layers;
    const orient = opts.orientation || "fig1";
    const step = opts.layerStep || 1;
    const layers = displayLayers(nL, step);
    const cols = displayTokens(tokens.length, opts.focus, opts.collapse);
    const ev = opts.ev || E.evaluate(alg, tokens);
    const vm = E.varMap(alg);
    const rd = E.readers(alg);
    const types = opts.types || E.inferTypes(alg).types;

    host.innerHTML = "";
    const scroller = el("div", "grid-scroll" + (opts.compact ? " compact" : ""));
    const grid = el("div", "grid orient-" + orient);
    grid.dataset.role = opts.role || "editor";
    scroller.appendChild(grid);
    host.appendChild(scroller);

    // Bucket: a displayed layer row r covers layers [r, next displayed row).
    const bucketOf = (l) => {
      let b = layers[0];
      for (const r of layers) if (r <= l) b = r;
      return b;
    };

    const colIndex = {}; // tok -> grid column/row index
    const nCols = cols.length;
    const rowsCount = layers.length;

    // Place helper: (layerRowIdx, colIdx) → CSS grid coords.
    // fig1: column 1 is the layer gutter; rows go top (highest layer) to
    //       bottom, with the token row last.
    // patchlens: row 1 is the layer header; column 1 is the token gutter.
    const place = (e, layerIdx, colIdx) => {
      if (orient === "fig1") {
        e.style.gridColumn = String(colIdx + 2);
        e.style.gridRow = String(rowsCount - layerIdx);
      } else {
        e.style.gridColumn = String(layerIdx + 2);
        e.style.gridRow = String(colIdx + 2);
      }
    };

    if (orient === "fig1") {
      // Columns grow to fit their widest chip, so pairs such as 1:ale aren't cut off.
      grid.style.gridTemplateColumns = `var(--gutter) ` + cols.map((c) => (c.gap ? "var(--gap-col)" : "minmax(var(--col), max-content)")).join(" ");
      grid.style.gridTemplateRows = `repeat(${rowsCount}, minmax(var(--row), auto)) auto`;
    } else {
      grid.style.gridTemplateColumns = `var(--tok-gutter) repeat(${rowsCount}, minmax(var(--col), max-content))`;
      grid.style.gridTemplateRows = `auto ` + cols.map((c) => (c.gap ? "var(--gap-row)" : "minmax(var(--row), auto)")).join(" ");
    }

    // Layer labels.
    layers.forEach((l, i) => {
      const lab = el("div", "axis-layer", esc(layerLabel(l)) + (step > 1 && l < nL - 1 ? `<span class="axis-sub">–${Math.min(l + step - 1, nL - 1)}</span>` : ""));
      if (orient === "fig1") {
        lab.style.gridColumn = "1";
        lab.style.gridRow = String(rowsCount - i);
      } else {
        lab.style.gridColumn = String(i + 2);
        lab.style.gridRow = "1";
      }
      grid.appendChild(lab);
    });

    // Token labels and gap columns.
    cols.forEach((c, ci) => {
      if (c.gap) {
        const g = el("div", "gap-col", `<span title="${esc(c.gap.map((t) => tokens[t]).join(" "))}">…</span>`);
        if (orient === "fig1") {
          g.style.gridColumn = String(ci + 2);
          g.style.gridRow = `1 / span ${rowsCount + 1}`;
        } else {
          g.style.gridRow = String(ci + 2);
          g.style.gridColumn = `1 / span ${rowsCount + 1}`;
        }
        grid.appendChild(g);
        return;
      }
      colIndex[c.tok] = ci;
      const t = c.tok;
      const lab = el("div", "toklabel", `<span class="tok-text">${esc(tokens[t])}</span><span class="tok-idx">${t}</span>`);
      lab.dataset.tok = t;
      lab.dataset.role = grid.dataset.role;
      lab.tabIndex = opts.onTokenClick ? 0 : -1;
      if (opts.focus && opts.focus.has(t)) lab.classList.add("focused");
      if (opts.argKeys && opts.argKeys.has("t:" + t)) lab.classList.add("is-arg");
      if (opts.tokenHighlight && opts.tokenHighlight.has(t)) lab.classList.add("tok-hl");
      if (orient === "fig1") {
        lab.style.gridColumn = String(ci + 2);
        lab.style.gridRow = String(rowsCount + 1);
      } else {
        lab.style.gridColumn = "1";
        lab.style.gridRow = String(ci + 2);
      }
      grid.appendChild(lab);
    });

    // Cells.
    const cellEls = {};
    const chipEls = {};
    layers.forEach((l, li) => {
      const next = layers[li + 1] ?? nL;
      cols.forEach((c, ci) => {
        if (c.gap) return;
        const t = c.tok;
        const cell = el("div", "cell");
        cell.dataset.layer = l;
        cell.dataset.tok = t;
        cell.dataset.role = grid.dataset.role;
        cell.tabIndex = 0;
        cell.setAttribute("role", "button");
        place(cell, li, ci);

        // Variables born in this bucket (solid) or carried through it (ghost).
        const born = alg.vars.filter((v) => v.tok === t && v.layer >= l && v.layer < next);
        const carried = alg.vars.filter((v) => {
          if (v.tok !== t || (v.layer >= l && v.layer < next)) return false;
          const end = E.spanEnd(alg, "v:" + v.id, rd, vm);
          return v.layer < l && end >= l;
        });
        const tokCarried = rd["t:" + t] && E.spanEnd(alg, "t:" + t, rd, vm) >= l;

        let html = "";
        let anyChanged = false;
        for (const v of born) {
          const { value, intervened } = E.valueAt(alg, ev, "v:" + v.id, Math.min(next - 1, nL - 1));
          let changed = false;
          if (opts.baseEv) {
            const b = E.valueAt(alg, opts.baseEv, "v:" + v.id, Math.min(next - 1, nL - 1)).value;
            changed = E.keyOf(b) !== E.keyOf(value);
          }
          anyChanged = anyChanged || changed;
          html += chipHtml(v, value, { type: types[v.id], isOutput: alg.output === v.id, chipLabel: opts.chipLabel, selected: opts.selectedVar === v.id, intervened, changed });
        }
        if (opts.showGhosts !== false) {
          for (const v of carried) {
            const { value, intervened } = E.valueAt(alg, ev, "v:" + v.id, l);
            let changed = false;
            if (opts.baseEv) {
              const b = E.valueAt(alg, opts.baseEv, "v:" + v.id, l).value;
              changed = E.keyOf(b) !== E.keyOf(value);
            }
            anyChanged = anyChanged || changed;
            html += chipHtml(v, value, { type: types[v.id], isOutput: alg.output === v.id, chipLabel: opts.chipLabel, ghost: true, selected: opts.selectedVar === v.id, intervened, changed });
          }
        }
        cell.innerHTML = html;
        if (tokCarried) cell.classList.add("carries-token");
        if (!born.length && !carried.length) cell.classList.add("empty");
        if (anyChanged) cell.classList.add("changed");

        const nodes = E.nodesAt(alg, l, t);
        const desc = nodes.map((n) => (n.kind === "tok" ? `token “${tokens[t]}”` : vm[n.id].name)).join(", ");
        cell.title = `${layerLabel(l)} · “${tokens[t]}” (${t})` + (desc ? `\nCarries: ${desc}` : "\nEmpty");
        cell.setAttribute("aria-label", `${layerLabel(l)}, token ${tokens[t]} (${t})` + (desc ? `, carries ${desc}` : ", empty"));
        if (nodes.length) cell.classList.add("has-nodes");

        const pc = opts.pickedCell;
        if (pc && pc.layer === l && pc.tok === t) cell.classList.add("picked");
        const pt = opts.interventionCell;
        if (pt && bucketOf(pt.layer) === l && pt.tok === t) cell.classList.add("intervention-site");
        const pend = opts.pendingCell;
        if (pend && bucketOf(pend.layer) === l && pend.tok === t) cell.classList.add("pending");

        cellEls[l + ":" + t] = cell;
        grid.appendChild(cell);
      });
    });

    grid.querySelectorAll(".chip:not(.ghost)").forEach((c) => {
      chipEls[c.dataset.var] = c;
    });

    // Arrows overlay.
    const svg = document.createElementNS(SVGNS, "svg");
    svg.classList.add("arrows");
    svg.setAttribute("aria-hidden", "true");
    grid.appendChild(svg);

    function anchor(elm, gridRect, side) {
      const r = elm.getBoundingClientRect();
      const x = r.left - gridRect.left;
      const y = r.top - gridRect.top;
      if (side === "top") return [x + r.width / 2, y];
      if (side === "bottom") return [x + r.width / 2, y + r.height];
      if (side === "left") return [x, y + r.height / 2];
      if (side === "right") return [x + r.width, y + r.height / 2];
      return [x + r.width / 2, y + r.height / 2];
    }

    function drawArrows() {
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      const mode = opts.arrows || "auto";
      if (mode === "none") return;
      const gr = grid.getBoundingClientRect();
      svg.setAttribute("width", grid.scrollWidth);
      svg.setAttribute("height", grid.scrollHeight);
      svg.setAttribute("viewBox", `0 0 ${grid.scrollWidth} ${grid.scrollHeight}`);
      const sel = opts.selectedVar;
      const fig1 = orient === "fig1";
      for (const v of alg.vars) {
        const target = chipEls[v.id];
        if (!target) continue;
        // A value is read from the layer just below its reader.
        const recall = v.layer - 1;
        for (const a of v.args) {
          let p0;
          let start = null; // where a token's rise up its column begins
          let tone = "tok";
          const isTok = a.t !== undefined;
          if (!isTok) {
            const src = vm[a.v];
            if (!src) continue;
            const end = E.spanEnd(alg, "v:" + src.id, rd, vm);
            const row = bucketOf(Math.max(src.layer, Math.min(recall, end)));
            const cellEl = cellEls[row + ":" + src.tok];
            const copy = (cellEl && cellEl.querySelector(`.chip[data-var="${CSS.escape(src.id)}"]`)) || chipEls[src.id];
            if (!copy) continue;
            p0 = anchor(copy, gr, fig1 ? "top" : "right");
            tone = src.color ? "c-" + src.color : "var";
          } else {
            if (colIndex[a.t] === undefined) continue;
            const near = Math.abs(a.t - v.tok) <= 2;
            if (mode === "auto" && !near && sel !== v.id) continue;
            const label = grid.querySelector(`.toklabel[data-tok="${a.t}"]`);
            if (!label) continue;
            start = anchor(label, gr, fig1 ? "top" : "right");
            // Carried up the token's column to the recall layer, then read.
            const cellEl = recall >= 0 ? cellEls[bucketOf(recall) + ":" + a.t] : null;
            if (cellEl) {
              const r = cellEl.getBoundingClientRect();
              p0 = fig1 ? [start[0], r.top - gr.top] : [r.right - gr.left, start[1]];
            } else p0 = start;
          }
          const p1 = anchor(target, gr, fig1 ? "bottom" : "left");
          const dimmed = sel && sel !== v.id && !(a.v !== undefined && a.v === sel);
          const strong = sel && (sel === v.id || a.v === sel);
          drawCurve(p0, p1, tone, { dimmed, strong, token: isTok, start });
        }
      }
    }

    function drawCurve(p0, p1, tone, o) {
      const [x0, y0] = p0;
      const [x1, y1] = p1;
      let c0, c1;
      if (orient === "fig1") {
        const dy = Math.max(18, Math.abs(y1 - y0) * 0.5);
        c0 = [x0, y0 - dy];
        c1 = [x1, y1 + dy];
      } else {
        const dx = Math.max(18, Math.abs(x1 - x0) * 0.5);
        c0 = [x0 + dx, y0];
        c1 = [x1 - dx, y1];
      }
      const path = document.createElementNS(SVGNS, "path");
      const rise = o.start && (o.start[0] !== x0 || o.start[1] !== y0) ? `M${o.start[0]},${o.start[1]} L${x0},${y0} ` : `M${x0},${y0} `;
      path.setAttribute("d", `${rise}C${c0[0]},${c0[1]} ${c1[0]},${c1[1]} ${x1},${y1}`);
      path.setAttribute("class", `arrow ${tone}${o.dimmed ? " dimmed" : ""}${o.strong ? " strong" : ""}${o.token ? " from-token" : ""}`);
      svg.appendChild(path);
      // Arrowhead along the end tangent.
      const ang = Math.atan2(y1 - c1[1], x1 - c1[0]);
      const s = 5;
      const hx = x1 - Math.cos(ang) * 1;
      const hy = y1 - Math.sin(ang) * 1;
      const a1 = [hx - s * Math.cos(ang - 0.45), hy - s * Math.sin(ang - 0.45)];
      const a2 = [hx - s * Math.cos(ang + 0.45), hy - s * Math.sin(ang + 0.45)];
      const head = document.createElementNS(SVGNS, "path");
      head.setAttribute("d", `M${hx},${hy} L${a1[0]},${a1[1]} L${a2[0]},${a2[1]} Z`);
      head.setAttribute("class", `arrowhead ${tone}${o.dimmed ? " dimmed" : ""}${o.strong ? " strong" : ""}${o.token ? " from-token" : ""}`);
      svg.appendChild(head);
    }

    let raf = 0;
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(drawArrows);
    };
    schedule();
    const ro = new ResizeObserver(schedule);
    ro.observe(grid);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);

    return {
      scroller,
      grid,
      cell: (l, t) => cellEls[bucketOf(l) + ":" + t],
      tokenLabel: (t) => grid.querySelector(`.toklabel[data-tok="${t}"]`),
      redraw: schedule,
      bucketOf,
      layers,
      destroy() {
        ro.disconnect();
      },
    };
  }

  // Pointer-based drag that also supports click-to-pick, click-to-drop.
  // onPick(sourceEl), onDrop(sourceEl, targetEl), canDrag(el), dropSelector
  function dragController(container, o) {
    let start = null;
    let ghost = null;
    let dragging = false;
    let srcEl = null;

    container.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      const s = e.target.closest(o.sourceSelector);
      if (!s || !container.contains(s) || (o.canDrag && !o.canDrag(s))) return;
      start = { x: e.clientX, y: e.clientY, pointerType: e.pointerType };
      srcEl = s;
      dragging = false;
    });

    window.addEventListener("pointermove", (e) => {
      if (!start || start.pointerType === "touch") return;
      if (!dragging && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 5) {
        dragging = true;
        ghost = el("div", "drag-ghost", o.ghostHtml ? o.ghostHtml(srcEl) : "");
        document.body.appendChild(ghost);
        container.classList.add("is-dragging");
        o.onDragStart && o.onDragStart(srcEl);
      }
      if (dragging && ghost) {
        ghost.style.transform = `translate(${e.clientX + 10}px, ${e.clientY + 10}px)`;
        const over = document.elementFromPoint(e.clientX, e.clientY);
        container.querySelectorAll(".drop-hover").forEach((x) => x.classList.remove("drop-hover"));
        const tgt = over && over.closest(o.dropSelector);
        if (tgt && container.contains(tgt)) tgt.classList.add("drop-hover");
      }
    });

    window.addEventListener("pointerup", (e) => {
      if (!start) return;
      const wasDragging = dragging;
      const s = srcEl;
      start = null;
      dragging = false;
      srcEl = null;
      if (ghost) ghost.remove();
      ghost = null;
      container.classList.remove("is-dragging");
      container.querySelectorAll(".drop-hover").forEach((x) => x.classList.remove("drop-hover"));
      if (!wasDragging) return; // clicks are handled by the click listener
      const over = document.elementFromPoint(e.clientX, e.clientY);
      const tgt = over && over.closest(o.dropSelector);
      if (tgt && container.contains(tgt)) o.onDrop(s, tgt);
      // Swallow the click that follows a drag.
      const swallow = (ev) => {
        ev.stopPropagation();
        ev.preventDefault();
      };
      window.addEventListener("click", swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0);
    });
  }

  // Curved intervention arrow between two elements inside `layer` (an absolutely
  // positioned overlay that covers the mockup).
  function drawInterventionArrow(overlay, fromEl, toEl) {
    overlay.innerHTML = "";
    if (!fromEl || !toEl) return;
    const box = overlay.getBoundingClientRect();
    const a = fromEl.getBoundingClientRect();
    const b = toEl.getBoundingClientRect();
    const x0 = a.left + a.width / 2 - box.left;
    const y0 = a.top + a.height / 2 - box.top;
    const x1 = b.left + b.width / 2 - box.left;
    const y1 = b.top + b.height / 2 - box.top;
    const svg = document.createElementNS(SVGNS, "svg");
    svg.setAttribute("width", box.width);
    svg.setAttribute("height", box.height);
    svg.innerHTML = `<defs><linearGradient id="pg-${Math.random().toString(36).slice(2, 7)}" gradientUnits="userSpaceOnUse" x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}"><stop offset="0" stop-color="var(--source)"/><stop offset="1" stop-color="var(--target)"/></linearGradient></defs>`;
    const gid = svg.querySelector("linearGradient").id;
    const bend = Math.max(60, Math.abs(y1 - y0) * 0.35);
    const side = x1 >= x0 ? 1 : -1;
    const path = document.createElementNS(SVGNS, "path");
    path.setAttribute("d", `M${x0},${y0} C${x0 + side * bend},${y0 + (y1 - y0) * 0.25} ${x1 + side * bend},${y1 - (y1 - y0) * 0.25} ${x1},${y1}`);
    path.setAttribute("class", "intervention-arrow");
    path.setAttribute("stroke", `url(#${gid})`);
    svg.appendChild(path);
    const dot0 = document.createElementNS(SVGNS, "circle");
    dot0.setAttribute("cx", x0);
    dot0.setAttribute("cy", y0);
    dot0.setAttribute("r", 4);
    dot0.setAttribute("class", "intervention-dot source");
    const dot1 = document.createElementNS(SVGNS, "circle");
    dot1.setAttribute("cx", x1);
    dot1.setAttribute("cy", y1);
    dot1.setAttribute("r", 4);
    dot1.setAttribute("class", "intervention-dot target");
    svg.appendChild(dot0);
    svg.appendChild(dot1);
    overlay.appendChild(svg);
  }

  // Colors for output values in sweeps: unchanged = neutral, others get
  // mechanism colors when a mechanism predicts them.
  function outputPalette(baseLabel, assignments) {
    const map = { [baseLabel]: "base" };
    const fallbacks = ["c5", "c6", "c7", "c8"];
    let fi = 0;
    return (label) => {
      if (label in map) return map[label];
      if (assignments && assignments[label]) return (map[label] = assignments[label]);
      if (label === "∅") return (map[label] = "none");
      return (map[label] = fallbacks[fi++ % fallbacks.length]);
    };
  }

  root.ALGrid = { render, dragController, drawInterventionArrow, outputPalette, layerLabel, esc, el, glyph, nameChip, displayLayers };
})(window);
