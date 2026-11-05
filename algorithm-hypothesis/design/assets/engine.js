/*
 * Algorithm Hypothesis — mockup engine.
 *
 * A tiny, dependency-free stand-in for the real execution layer (causalab in a
 * Pyodide worker, see §9 of the design doc). It implements the semantics the
 * doc proposes, so the mockups compute real counterfactual outputs:
 *
 *   - An algorithm is a list of variables, each placed in a grid cell
 *     (layer, token) and computed by a primitive from its arguments.
 *   - Arguments must come from strictly lower layers and from tokens at or
 *     before the variable's own position (the transformer's causal mask).
 *   - Residual-stream semantics: a value is carried up its token's column
 *     from its birth layer to just below its last reader (its "span").
 *     An interchange intervention on cell (l, t) replaces every value whose
 *     span covers (l, t),
 *     and only readers above layer l see the donor value.
 *   - Tokens are inputs born on the embedding row (layer -1) and carried
 *     the same way, so they can be intervened on too. Only values with the
 *     same name are swapped.
 *
 * Works in the browser (window.ALEngine) and in Node (module.exports).
 */
(function (root) {
  "use strict";

  const EMB = -1; // embedding row

  // ------------------------------------------------------------------
  // Prompts
  // ------------------------------------------------------------------

  // Word-level tokenizer for the mockup. Drops commas and periods so the
  // grid matches Figure 1 of the paper; keeps "?" as its own token. The
  // real tool uses the selected model's tokenizer.
  function tokenize(text) {
    const out = [];
    for (const w of String(text).trim().split(/\s+/)) {
      if (!w) continue;
      const m = w.match(/^([^.,?!;:]*)([.,?!;:]*)$/);
      const word = m ? m[1] : w;
      const punct = m ? m[2] : "";
      if (word) out.push(word);
      if (punct.includes("?")) out.push("?");
    }
    return out;
  }

  // Entity groups ("clauses") of the "{person} loves {food}" template:
  // every "loves" before the question word anchors one clause.
  function clauses(tokens) {
    const q = tokens.findIndex((t) => /^(what|who|which|where)$/i.test(t));
    const end = q < 0 ? tokens.length : q;
    const out = [];
    for (let j = 1; j < end - 1; j++) {
      if (tokens[j] === "loves") out.push([j - 1, j, j + 1]);
    }
    return out;
  }

  function clauseOf(tokens, i) {
    const cs = clauses(tokens);
    for (let k = 0; k < cs.length; k++) if (cs[k].includes(i)) return k + 1;
    return null;
  }

  function tokenValue(tokens, i) {
    return i >= 0 && i < tokens.length ? { kind: "tok", text: tokens[i], index: i } : null;
  }

  // ------------------------------------------------------------------
  // Values and types
  // ------------------------------------------------------------------

  function top(dist) {
    return dist.items.reduce((a, b) => (b.p > a.p ? b : a));
  }

  // Identity used for equality and for "did this value change" checks.
  function keyOf(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === "object") {
      if (v.kind === "tok") return "s:" + v.text;
      if (v.kind === "pair") return "pair(" + keyOf(v.key) + "," + keyOf(v.value) + ")";
      if (v.kind === "dist") return "d:" + v.items.map((x) => x.label + Math.round(x.p * 100)).join(",");
      if (v.kind === "py") return "py";
    }
    if (typeof v === "string") return "s:" + v;
    return "n:" + v;
  }

  const eq = (a, b) => a !== null && a !== undefined && b !== null && b !== undefined && keyOf(a) === keyOf(b);

  function show(v) {
    if (v === null || v === undefined) return "∅";
    if (typeof v === "object") {
      if (v.kind === "tok") return v.text;
      if (v.kind === "pair") {
        const side = (x) => (x && x.kind === "pair" ? "(" + show(x) + ")" : show(x));
        return side(v.key) + ":" + side(v.value);
      }
      if (v.kind === "dist") return top(v).label;
      if (v.kind === "py") return "py";
    }
    return String(v);
  }

  // The label the output reads as: the top token of a distribution, or the
  // tied top tokens joined with " / ".
  function outputLabel(v) {
    if (v && v.kind === "dist") {
      const best = top(v).p;
      return v.items
        .filter((x) => best - x.p < 0.01)
        .map((x) => x.label)
        .join(" / ");
    }
    return show(v);
  }

  // Types: {kind: "string" | "int" | "position"} or {kind: "pair", key, value}.
  const STRING = { kind: "string" };

  function describeType(t) {
    if (!t) return "unknown";
    if (t.kind === "pair") {
      const side = (x) => (x.kind === "pair" ? "(" + describeType(x) + ")" : describeType(x));
      return side(t.key) + " : " + side(t.value);
    }
    return t.kind;
  }

  const typeKind = (t) => (t ? t.kind : "unknown");

  // ------------------------------------------------------------------
  // Primitives, with their Python source (from algorithm_hypothesis)
  // ------------------------------------------------------------------

  const PY_SOURCES = {
      "position_id": "def position_id(token: str, specials: list[str]) -> Pair[Position, str]:\n    \"\"\"The token's position ID, stored as position ID : token. Each distinct\n    special token (such as a name) gets the next ID in order of first\n    appearance, so a name mentioned again gets its first mention's ID.\n    `specials` are the special tokens up to this one; a possessive ('s) is\n    ignored when comparing them.\"\"\"\n\n    def name(t):\n        return str(t).strip().split(\"'\")[0]\n\n    ids = {}\n    for t in specials:\n        if t is not None:\n            ids.setdefault(name(t), len(ids) + 1)\n    if token is None or name(token) not in ids:\n        return None\n    return Pair(ids[name(token)], token)\n",
      "copy": "def copy(x: T) -> T:\n    \"\"\"The value, unchanged, in another cell. Copying a token carries the\n    token itself.\"\"\"\n    return x\n",
      "pair": "def pair(key: K, value: V) -> Pair[K, V]:\n    \"\"\"Bind a key to a value.\"\"\"\n    return Pair(key, value)\n",
      "retrieve": "def retrieve(key: K, pairs: list[Pair[K, V]], *, match: str = \"key\") -> V | None:\n    \"\"\"The value of the first pair whose key equals `key`, the way attention\n    matches a query against keys and reads the matching value. With\n    match=\"value\", the first value equal to `key`: dereferencing a pointer,\n    which finds nothing if that value isn't in context.\"\"\"\n    for p in pairs:\n        if key is None or not isinstance(p, Pair):\n            continue\n        if (p.key if match == \"key\" else p.value) == key:\n            return p.value\n    return None\n",
      "index": "def index(i: Position, values: list[V]) -> V | None:\n    \"\"\"The i-th value, counting from 1.\"\"\"\n    if isinstance(i, int) and 1 <= i <= len(values):\n        return values[i - 1]\n    return None\n",
      "key_of": "def key_of(pair: Pair[K, V]) -> K | None:\n    \"\"\"The key of a key : value pair, such as the position ID of 4:Tim.\"\"\"\n    return pair.key if isinstance(pair, Pair) else None\n",
      "value_of": "def value_of(pair: Pair[K, V]) -> V | None:\n    \"\"\"The value of a key : value pair, such as the token of 4:Tim.\"\"\"\n    return pair.value if isinstance(pair, Pair) else None\n",
      "mixture": "def mixture(answers: list[V], *, weights: str = \"\") -> Distribution:\n    \"\"\"A linear combination of the answers, such as one per mechanism: each\n    answer gets its weight, and the weights of equal answers add up.\n    `weights` lists one weight per answer, separated by commas; a missing\n    weight is 1. The result is normalized to sum to 1.\"\"\"\n    w = [float(x) for x in weights.split(\",\") if x.strip()]\n    w = (w + [1.0] * len(answers))[: len(answers)]\n    total = sum(w) or 1.0\n    p: dict[str, float] = {}\n    for answer, weight in zip(answers, w):\n        p[show(answer)] = p.get(show(answer), 0.0) + weight / total\n    return Distribution(tuple(p.items()))\n",
      "constant": "def constant(*, value: str = \"\", type: str = \"string\") -> str | int | None:\n    \"\"\"A fixed value.\"\"\"\n    if value == \"\":\n        return None\n    return value if type == \"string\" else int(value)\n"
  };

  // Signatures of the real primitives: typed slots and return type, written
  // as type patterns ({kind: "var", name} and {kind: "list", of} besides the
  // types themselves). Copied from the golden file, like PY_SOURCES.
  const SIGNATURES = {"position_id": {"slots": [{"name": "token", "type": {"kind": "string"}},
     {"name": "specials", "type": {"kind": "list", "of": {"kind": "string"}}}], "returns": {"kind": "pair", "key": {"kind": "position"},
     "value": {"kind": "string"}}},
     "copy": {"slots": [{"name": "x", "type": {"kind": "var", "name": "T"}}], "returns": {"kind": "var", "name": "T"}},
     "pair": {"slots": [{"name": "key", "type": {"kind": "var", "name": "K"}},
     {"name": "value", "type": {"kind": "var", "name": "V"}}], "returns": {"kind": "pair", "key": {"kind": "var", "name": "K"},
     "value": {"kind": "var", "name": "V"}}},
     "retrieve": {"slots": [{"name": "key", "type": {"kind": "var", "name": "K"}},
     {"name": "pairs", "type": {"kind": "list", "of": {"kind": "pair", "key": {"kind": "var", "name": "K"},
     "value": {"kind": "var", "name": "V"}}}}], "returns": {"kind": "var", "name": "V"}},
     "index": {"slots": [{"name": "i", "type": {"kind": "position"}},
     {"name": "values", "type": {"kind": "list", "of": {"kind": "var", "name": "V"}}}], "returns": {"kind": "var", "name": "V"}},
     "key_of": {"slots": [{"name": "pair", "type": {"kind": "pair", "key": {"kind": "var", "name": "K"},
     "value": {"kind": "var", "name": "V"}}}], "returns": {"kind": "var", "name": "K"}},
     "value_of": {"slots": [{"name": "pair", "type": {"kind": "pair", "key": {"kind": "var", "name": "K"},
     "value": {"kind": "var", "name": "V"}}}], "returns": {"kind": "var", "name": "V"}},
     "mixture": {"slots": [{"name": "answers", "type": {"kind": "list", "of": {"kind": "var", "name": "V"}}}], "returns": {"kind": "string"}},
     "constant": {"slots": [], "returns": null}};

  // Each primitive: label, options, and how it runs on its flat argument
  // list (slots concatenated in order). Slots and types come from SIGNATURES.
  // Special tokens compare without a possessive: "Tim's" is Tim.
  const specialName = (v) => (keyOf(v) || "").split("'")[0];

  const PRIMS = {
    position_id: {
      label: "Position ID",
      py: "position_id",
      run([token, ...specials]) {
        const ids = new Map();
        for (const t of specials) if (t !== null && t !== undefined && !ids.has(specialName(t))) ids.set(specialName(t), ids.size + 1);
        const id = token == null ? undefined : ids.get(specialName(token));
        return id === undefined ? null : { kind: "pair", key: id, value: token };
      },
    },
    copy: { label: "Copy", py: "copy", run: ([x]) => x ?? null },
    pair: { label: "Pair", py: "pair", run: ([key, value]) => ({ kind: "pair", key: key ?? null, value: value ?? null }) },
    retrieve: {
      label: "Retrieve",
      py: "retrieve",
      params: { match: { label: "Match by", options: ["key", "value"], default: "key" } },
      run([key, ...pairs], p) {
        const byValue = (p.match || "key") === "value";
        for (const x of pairs) if (x && x.kind === "pair" && eq(byValue ? x.value : x.key, key)) return x.value;
        return null;
      },
    },
    index: {
      label: "Index",
      py: "index",
      run: ([i, ...vs]) => (typeof i === "number" && i >= 1 && i <= vs.length ? vs[i - 1] ?? null : null),
    },
    key_of: { label: "KeyOf", py: "key_of", run: ([p]) => (p && p.kind === "pair" ? p.key : null) },
    value_of: { label: "ValueOf", py: "value_of", run: ([p]) => (p && p.kind === "pair" ? p.value : null) },
    mixture: {
      label: "Mixture",
      py: "mixture",
      params: { weights: { label: "Weights", default: "" } },
      // A linear combination of the answers; the weights of equal answers add up.
      run(answers, p) {
        const given = String(p.weights ?? "").split(",").filter((x) => x.trim()).map(Number);
        const w = answers.map((_, i) => (i < given.length && Number.isFinite(given[i]) ? given[i] : 1));
        const total = w.reduce((a, b) => a + b, 0) || 1;
        const mass = new Map();
        answers.forEach((a, i) => mass.set(show(a), (mass.get(show(a)) ?? 0) + w[i] / total));
        return { kind: "dist", items: [...mass].map(([label, x]) => ({ label, p: x })) };
      },
    },
    constant: {
      label: "Constant",
      py: "constant",
      params: {
        value: { label: "Value", default: "" },
        type: { label: "Type", options: ["string", "int", "position"], default: "string" },
      },
      run(_, p) {
        const v = p.value;
        if (v === "" || v === undefined) return null;
        return (p.type || "string") === "string" ? v : parseInt(v, 10);
      },
    },
  };

  // Slots and return type for a primitive's options; Retrieve matching by
  // value compares the key with each pair's value.
  function signatureOf(fn, params) {
    const sig = SIGNATURES[PRIMS[fn].py];
    if (fn === "retrieve" && params && params.match === "value")
      return {
        slots: [{ name: "key", type: { kind: "var", name: "V" } }, sig.slots[1]],
        returns: sig.returns,
      };
    return sig;
  }

  const slotsOf = (fn, params) => (PRIMS[fn] ? signatureOf(fn, params).slots : []);
  const isList = (slot) => slot.type.kind === "list";

  // Split a flat argument list into the slots, in order: one argument per
  // plain slot, the rest shared evenly by the list slots. Null if it can't.
  function splitArgs(fn, args) {
    const slots = slotsOf(fn);
    const lists = slots.filter(isList).length;
    const fixed = slots.length - lists;
    const rest = args.length - fixed;
    if (rest < 0 || (lists === 0 && rest !== 0) || (lists > 0 && (rest < lists || rest % lists !== 0))) return null;
    const per = lists ? rest / lists : 0;
    const out = [];
    let i = 0;
    for (const s of slots) {
      const n = isList(s) ? per : 1;
      out.push(args.slice(i, i + n));
      i += n;
    }
    return out;
  }

  // Arity problem with a flat argument list, or null.
  function arityProblem(fn, n) {
    if (splitArgs(fn, new Array(n).fill(0))) return null;
    const slots = slotsOf(fn);
    if (!slots.length) return "Takes no arguments.";
    const parts = slots.map((s) => (isList(s) ? `one or more ${s.name}` : `one ${s.name}`));
    const lists = slots.filter(isList).length;
    return `Needs ${parts.join(", ")}${lists > 1 ? ", with as many of each list" : ""}.`;
  }

  // -- type patterns (mirrors vartypes.py / vartypes.ts)

  function describePattern(p, subst) {
    if (!p) return "unknown";
    if (p.kind === "var") return subst && subst[p.name] ? describeType(subst[p.name]) : `any type (${p.name})`;
    if (p.kind === "list") return "list of " + describePattern(p.of, subst);
    if (p.kind === "pair") {
      const side = (x) => (x.kind === "pair" ? "(" + describePattern(x, subst) + ")" : describePattern(x, subst));
      return side(p.key) + " : " + side(p.value);
    }
    return p.kind;
  }

  function unify(p, t, subst) {
    if (p.kind === "var") {
      if (!subst[p.name]) {
        subst[p.name] = t;
        return true;
      }
      return describeType(subst[p.name]) === describeType(t);
    }
    if (p.kind === "pair") return t.kind === "pair" && unify(p.key, t.key, subst) && unify(p.value, t.value, subst);
    if (p.kind === "list") return false;
    return t.kind === p.kind;
  }

  function substitute(p, subst) {
    if (p.kind === "var") return subst[p.name] || null;
    if (p.kind === "pair") {
      const k = substitute(p.key, subst);
      const v = substitute(p.value, subst);
      return k && v ? { kind: "pair", key: k, value: v } : null;
    }
    if (p.kind === "list") return null;
    return { kind: p.kind };
  }

  // Unify a primitive's slots with its arguments' types (null = unknown).
  // slotArgs: [[{type, name}]] per slot. Returns the bindings, the first
  // type error, and the return type.
  function typeSlots(fn, slotArgs, params) {
    const sig = signatureOf(fn, params);
    const subst = {};
    let error = null;
    sig.slots.forEach((slot, i) => {
      const pat = isList(slot) ? slot.type.of : slot.type;
      for (const a of slotArgs[i] || []) {
        if (!a.type || error) continue;
        const before = { ...subst };
        if (!unify(pat, a.type, subst)) {
          error = `${slot.name}: ${a.name} is ${describeType(a.type)}, but this argument needs ${describePattern(slot.type.kind === "list" ? slot.type.of : slot.type, before)}.`;
          Object.keys(subst).forEach((k) => delete subst[k]);
          Object.assign(subst, before);
        }
      }
    });
    const returns = fn === "constant" ? { kind: (params && params.type) || "string" } : sig.returns ? substitute(sig.returns, subst) : null;
    return { subst, error, returns };
  }

  // Python source as shown in the panel; the mockup's "clause" option is the
  // package's "group" option.
  function pySource(fn) {
    const prim = PRIMS[fn];
    return prim ? PY_SOURCES[prim.py] : "";
  }

  // Types of every variable, in layer order: tokens are strings, a primitive's
  // type follows from its arguments' types, and a Python function declares its
  // type. Also reports type errors per variable.
  function inferTypes(alg) {
    const types = {};
    const errors = {};
    const vm = varMap(alg);
    const order = alg.vars.slice().sort((a, b) => a.layer - b.layer || a.tok - b.tok);
    for (const v of order) {
      const slots = v.fn === "python" ? null : splitArgs(v.fn, v.args);
      if (!slots) {
        types[v.id] = v.fn === "python" ? v.type || null : null;
        continue;
      }
      const typed = slots.map((xs) => xs.map((a) => argInfo(a, types, vm)));
      const r = typeSlots(v.fn, typed, v.params || {});
      if (r.error) errors[v.id] = r.error;
      types[v.id] = r.returns;
    }
    return { types, errors };
  }

  function argInfo(a, types, vm) {
    if (a.t !== undefined) return { type: STRING, name: "token " + a.t };
    return { type: types[a.v] || null, name: vm[a.v] ? vm[a.v].name : "?" };
  }

  // A primitive's slots with the arguments bound to each and each slot's type
  // given the arguments so far ("list of position : string").
  function slotsFor(alg, fn, slotArgs, params, types) {
    const vm = varMap(alg);
    types = types || inferTypes(alg).types;
    const typed = slotArgs.map((xs) => xs.map((a) => argInfo(a, types, vm)));
    const r = typeSlots(fn, typed, params || {});
    return {
      slots: slotsOf(fn, params).map((s, i) => ({ name: s.name, list: isList(s), args: slotArgs[i] || [], type: describePattern(s.type, r.subst) })),
      error: r.error,
      returns: r.returns,
    };
  }

  // ------------------------------------------------------------------
  // Graph helpers
  // ------------------------------------------------------------------

  function varMap(alg) {
    const m = {};
    for (const v of alg.vars) m[v.id] = v;
    return m;
  }

  function argKey(a) {
    return a.v !== undefined ? "v:" + a.v : "t:" + a.t;
  }

  // For each node key, the layers of the variables that read it.
  function readers(alg) {
    const r = {};
    for (const v of alg.vars) {
      for (const a of v.args) {
        const k = argKey(a);
        (r[k] = r[k] || []).push(v.layer);
      }
    }
    return r;
  }

  function birthOf(alg, key, vm) {
    if (key.startsWith("t:")) return EMB;
    return (vm || varMap(alg))[key.slice(2)].layer;
  }

  function colOf(alg, key, vm) {
    if (key.startsWith("t:")) return Number(key.slice(2));
    return (vm || varMap(alg))[key.slice(2)].tok;
  }

  // Highest layer at which the value still sits in the residual stream.
  function spanEnd(alg, key, rd, vm) {
    const ls = (rd || readers(alg))[key];
    const birth = birthOf(alg, key, vm);
    if (!ls || !ls.length) return birth;
    return Math.max(birth, Math.max(...ls) - 1);
  }

  // Every value living in cell (layer, tok): variables first (in definition
  // order), then the token itself.
  function nodesAt(alg, layer, tok) {
    const rd = readers(alg);
    const vm = varMap(alg);
    const out = [];
    for (const v of alg.vars) {
      if (v.tok !== tok) continue;
      const key = "v:" + v.id;
      if (v.layer <= layer && layer <= spanEnd(alg, key, rd, vm)) {
        out.push({ key, kind: "var", id: v.id, born: v.layer === layer });
      }
    }
    const tk = "t:" + tok;
    if (rd[tk] && layer <= spanEnd(alg, tk, rd, vm)) out.push({ key: tk, kind: "tok", born: layer === EMB });
    return out;
  }

  function validateArg(alg, host, arg) {
    // host: {layer, tok}; arg: {v} | {t}
    if (arg.t !== undefined) {
      if (arg.t > host.tok) return "Tokens to the right are not visible yet (causal mask).";
      return null;
    }
    const v = varMap(alg)[arg.v];
    if (!v) return "Unknown variable.";
    if (v.layer >= host.layer) return `${v.name} is at L${v.layer}; arguments must come from a lower layer.`;
    if (v.tok > host.tok) return `${v.name} sits to the right of this cell (causal mask).`;
    return null;
  }

  // ------------------------------------------------------------------
  // Evaluation and interventions
  // ------------------------------------------------------------------

  // interventions: [{ layer, tok, values: { nodeKey: value } }]
  function evaluate(alg, tokens, interventions) {
    interventions = interventions || [];
    const vm = varMap(alg);
    const vals = {};
    const errors = {};
    const order = alg.vars.slice().sort((a, b) => a.layer - b.layer || a.tok - b.tok);

    const read = (key, readerLayer) => {
      const birth = birthOf(alg, key, vm);
      const col = colOf(alg, key, vm);
      let best = null;
      for (const pt of interventions) {
        if (pt.tok === col && pt.layer >= birth && pt.layer < readerLayer && key in pt.values) {
          if (!best || pt.layer > best.layer) best = pt;
        }
      }
      if (best) return best.values[key];
      if (key.startsWith("t:")) return tokenValue(tokens, Number(key.slice(2)));
      return vals[key.slice(2)] ?? null;
    };

    for (const v of order) {
      if (v.fn === "python") {
        vals[v.id] = { kind: "py" };
        continue;
      }
      const prim = PRIMS[v.fn];
      if (!prim) {
        vals[v.id] = null;
        errors[v.id] = "Unknown primitive";
        continue;
      }
      const args = v.args.map((a) => read(argKey(a), v.layer));
      try {
        vals[v.id] = prim.run(args, v.params || {}, { tokens });
      } catch (e) {
        vals[v.id] = null;
        errors[v.id] = String(e.message || e);
      }
    }
    return { vals, errors, tokens, interventions };
  }

  // Value of a node as it sits in the residual stream at layer `layer`.
  function valueAt(alg, ev, key, layer) {
    const vm = varMap(alg);
    const birth = birthOf(alg, key, vm);
    const col = colOf(alg, key, vm);
    let best = null;
    for (const pt of ev.interventions) {
      if (pt.tok === col && pt.layer >= birth && pt.layer <= layer && key in pt.values) {
        if (!best || pt.layer > best.layer) best = pt;
      }
    }
    if (best) return { value: best.values[key], intervened: true };
    if (key.startsWith("t:")) return { value: tokenValue(ev.tokens, Number(key.slice(2))), intervened: false };
    return { value: ev.vals[key.slice(2)] ?? null, intervened: false };
  }

  // The output as it sits at the top of the grid, so an intervention on the output
  // cell itself counts.
  function output(alg, ev) {
    if (!alg.output) return null;
    return valueAt(alg, ev, "v:" + alg.output, alg.layers - 1).value;
  }

  // Drag one cell of the source run onto one cell of the target run. Only
  // values with the same name are swapped (design doc Q9).
  function interchangeIntervention(alg, srcTokens, tgtTokens, src, tgt) {
    const sNodes = nodesAt(alg, src.layer, src.tok);
    const tNodes = nodesAt(alg, tgt.layer, tgt.tok);
    const target = evaluate(alg, tgtTokens);
    if (!sNodes.length) return { ok: false, empty: true, reason: "Nothing lives in that source cell, so there is nothing to swap.", target };
    if (!tNodes.length) return { ok: false, empty: true, reason: "Nothing lives in that target cell, so the intervention has no effect.", target };
    const shared = tNodes.filter((n) => sNodes.some((s) => s.key === n.key));
    if (!shared.length) {
      return { ok: false, reason: "These cells share no variables. Interventions only swap variables with the same name.", target };
    }
    const srcEv = evaluate(alg, srcTokens);
    const values = {};
    for (const n of shared) values[n.key] = valueAt(alg, srcEv, n.key, src.layer).value;
    const interventions = [{ layer: tgt.layer, tok: tgt.tok, values }];
    const counterfactual = evaluate(alg, tgtTokens, interventions);
    return { ok: true, pairs: shared.map((n) => [n, n]), interventions, target, counterfactual, source: srcEv };
  }

  // Intervene on token srcTok → tgtTok at every layer, embedding row included.
  function tokenSweep(alg, srcTokens, tgtTokens, srcTok, tgtTok) {
    const rows = [];
    for (let l = EMB; l < alg.layers; l++) {
      const r = interchangeIntervention(alg, srcTokens, tgtTokens, { layer: l, tok: srcTok }, { layer: l, tok: tgtTok });
      rows.push({
        layer: l,
        ok: r.ok,
        empty: !!r.empty,
        reason: r.reason,
        value: r.ok ? output(alg, r.counterfactual) : output(alg, r.target),
      });
    }
    return rows;
  }

  // Every (layer, token) intervention, same position in both prompts.
  function fullSweep(alg, srcTokens, tgtTokens) {
    const n = Math.min(srcTokens.length, tgtTokens.length);
    const cols = [];
    for (let t = 0; t < n; t++) cols.push(tokenSweep(alg, srcTokens, tgtTokens, t, t));
    return cols; // cols[tok][layer + 1]
  }

  // ------------------------------------------------------------------
  // Example algorithms: the three mechanisms of Gur-Arieh et al. (2025)
  // placed on the Figure 1 prompt (17 word tokens, 8 abstract layers).
  // Same structure as presets.py. The names are the special tokens: Position
  // ID numbers them and stores position ID : name pairs.
  // ------------------------------------------------------------------

  const PROMPTS = {
    target: "Ann loves ale, Joe loves jam, Pete loves pie, Tim loves tea. What does Tim love?",
    source: "Joe loves ale, Ann loves pie, Pete loves jam, Tim loves tea. What does Ann love?",
    source_cod: "Joe loves ale, Ann loves cod, Pete loves jam, Tim loves tea. What does Ann love?",
  };

  const PEOPLE = [0, 3, 6, 9];
  const FOODS = [2, 5, 8, 11];
  const QUERY = 14;
  const LAST = 16;
  const SPECIALS = [...PEOPLE, QUERY];
  const T = (i) => ({ t: i });
  const R = (id) => ({ v: id });
  const ks = (prefix) => FOODS.map((_, k) => prefix + (k + 1));
  const mk = (id, layer, tok, fn, args, params) => ({ id, name: id, layer, tok, fn, args, ...(params ? { params } : {}) });

  // Position ID reads the special tokens up to its own token.
  const position = (id, layer, tok) => mk(id, layer, tok, "position_id", [T(tok), ...SPECIALS.filter((i) => i <= tok).map(T)]);
  // Each name's position ID : name, in its own variable.
  const posVars = () => PEOPLE.map((p, k) => position("pos" + (k + 1), 1, p));
  // Positional binding: the position ID copied onto the entity (KeyOf), then bound to it.
  const idVars = () => FOODS.map((f, k) => mk("id" + (k + 1), 2, f, "key_of", [R("pos" + (k + 1))]));
  const posBind = (prefix = "bind") => FOODS.map((f, k) => mk(prefix + (k + 1), 3, f, "pair", [R("id" + (k + 1)), T(f)]));
  // Lexical binding: the name itself bound to its entity.
  const lexBind = () => FOODS.map((f, k) => mk("bind" + (k + 1), 2, f, "pair", [T(PEOPLE[k]), T(f)]));
  // The recalled name gets its first mention's position ID.
  const qPos = () => position("q_pos", 3, QUERY);
  const qKey = () => mk("q_key", 3, QUERY, "copy", [T(QUERY)]);
  const qPtr = () => mk("q_ptr", 3, QUERY, "retrieve", [T(QUERY), ...ks("bind").map(R)], { match: "key" });
  const answer = (key, match, id = "answer", layer = 7, binds = "bind") =>
    mk(id, layer, LAST, "retrieve", [R(key), ...ks(binds).map(R)], { match });

  // Each example colors and tags a variable by the one algorithm it serves.
  // Positional binds position IDs; the others bind names, which serve lexical
  // and reflexive retrieval, so those bindings stay black, like Mixed's answer.
  const ALGORITHM_COLORS = { positional: "indigo", lexical: "emerald", reflexive: "amber" };
  function servedBy(v, kind) {
    const id = v.id;
    const tags = id.startsWith("pos") || id.startsWith("id") || id === "q_pos" || id === "P" ? ["positional"]
      : id.startsWith("bind") && kind === "positional" ? ["positional"]
      : id === "q_key" || id === "L" || id === "lex_answer" ? ["lexical"]
      : id === "q_ptr" || id === "R" || id === "ref_answer" ? ["reflexive"]
      : id.startsWith("bind") ? ["lexical", "reflexive"]
      : id === "answer" && kind !== "mixed" ? [kind] : [];
    return { ...v, ...(tags.length ? { tags } : {}), ...(tags.length === 1 ? { color: ALGORITHM_COLORS[tags[0]] } : {}) };
  }

  const ALGORITHMS = {
    positional: {
      id: "positional",
      name: "Positional",
      symbol: "𝒫",
      blurb: "Each name's position ID is copied onto its bound entity; the recalled name's position ID retrieves it.",
      layers: 8,
      template: PROMPTS.target,
      specials: SPECIALS,
      output: "answer",
      vars: [...posVars(), ...idVars(), ...posBind(), qPos(), mk("P", 5, LAST, "key_of", [R("q_pos")]), answer("P", "key")],
    },
    lexical: {
      id: "lexical",
      name: "Lexical",
      symbol: "ℒ",
      blurb: "Each entity is bound to its name; the recalled name itself retrieves the bound entity.",
      layers: 8,
      template: PROMPTS.target,
      specials: SPECIALS,
      output: "answer",
      vars: [...lexBind(), qKey(), mk("L", 5, LAST, "copy", [R("q_key")]), answer("L", "key")],
    },
    reflexive: {
      id: "reflexive",
      name: "Reflexive",
      symbol: "ℛ",
      blurb: "The query retrieves a pointer to the answer entity itself; the last token dereferences it by retrieving by value, which finds nothing if the entity isn't in context.",
      layers: 8,
      template: PROMPTS.target,
      specials: SPECIALS,
      output: "answer",
      vars: [...lexBind(), qPtr(), mk("R", 5, LAST, "copy", [R("q_ptr")]), answer("R", "value")],
    },
    mixed: {
      id: "mixed",
      name: "Mixed",
      symbol: "ℳ",
      blurb: "The union of the three algorithms: each computes its own answer, and the last token combines them linearly into a distribution over the entities.",
      layers: 8,
      template: PROMPTS.target,
      specials: SPECIALS,
      output: "answer",
      // Every variable of the three, unchanged; positional's bindings renamed.
      vars: [
        ...posVars(),
        ...idVars(),
        ...posBind("pos_bind"),
        qPos(),
        mk("P", 5, LAST, "key_of", [R("q_pos")]),
        answer("P", "key", "pos_answer", 6, "pos_bind"),
        ...lexBind(),
        qKey(),
        mk("L", 5, LAST, "copy", [R("q_key")]),
        answer("L", "key", "lex_answer", 6),
        qPtr(),
        mk("R", 5, LAST, "copy", [R("q_ptr")]),
        answer("R", "value", "ref_answer", 6),
        mk("answer", 7, LAST, "mixture", [R("pos_answer"), R("lex_answer"), R("ref_answer")], { weights: "1, 1, 1" }),
      ],
    },
  };
  for (const [kind, a] of Object.entries(ALGORITHMS)) a.vars = a.vars.map((v) => servedBy(v, kind));

  const clone = (o) => JSON.parse(JSON.stringify(o));

  function getAlgorithm(id) {
    return clone(ALGORITHMS[id]);
  }

  // ------------------------------------------------------------------
  // causalab export preview
  // ------------------------------------------------------------------

  // Parameter names of a custom Python function's compute(), in order.
  function pyParams(v) {
    const m = /def\s+compute\s*\(([^)]*)\)/.exec(v.code || "");
    const names = m ? m[1].split(",").map((x) => x.split(/[:=]/)[0].trim()).filter((x) => x && x !== "*") : [];
    return v.args.map((_, i) => names[i] || "arg" + i);
  }

  function pyIdent(name) {
    const s = String(name).replace(/[^A-Za-z0-9_]/g, "_");
    return /^[0-9]/.test(s) ? "_" + s : s || "_";
  }

  function toPython(alg, tokens) {
    const vm = varMap(alg);
    const rd = readers(alg);
    const order = alg.vars.slice().sort((a, b) => a.layer - b.layer || a.tok - b.tok);
    const fnName = pyIdent(alg.id || alg.name || "algorithm");
    const lines = [];
    const q = (s) => JSON.stringify(s);

    // Reference to node `key` as read by a variable at layer `readerLayer`:
    // the relay copy one layer below the reader, or the node itself.
    const ref = (a, readerLayer) => {
      if (a.t !== undefined) return `tok[${a.t}]`;
      const v = vm[a.v];
      const at = readerLayer - 1;
      return at > v.layer ? `${pyIdent(v.name)}__L${at}` : pyIdent(v.name);
    };
    const list = (xs) => "[" + xs.join(", ") + "]";

    const types = inferTypes(alg).types;
    const call = (v) => {
      if (v.fn === "python") {
        const params = pyParams(v);
        return `${pyIdent(v.name)}_fn(${v.args.map((a, i) => `${params[i]}=${ref(a, v.layer)}`).join(", ")})`;
      }
      const prim = PRIMS[v.fn];
      const split = splitArgs(v.fn, v.args) || [];
      const parts = slotsOf(v.fn).map((sl, i) => {
        const xs = (split[i] || []).map((a) => ref(a, v.layer));
        return `${sl.name}=${isList(sl) ? list(xs) : xs[0] ?? "None"}`;
      });
      for (const [k, spec] of Object.entries(prim.params || {})) parts.push(`${k}=${q((v.params || {})[k] ?? spec.default)}`);
      return `_p.${prim.py}(${parts.join(", ")})`;
    };

    lines.push(`# Exported by Algorithm Hypothesis (mockup preview)`);
    lines.push(`from causalab.causal import CausalModel, Dom, FamilyDom, V, mechanism`);
    lines.push(`from algorithm_hypothesis import primitives as _p`);
    lines.push(`from algorithm_hypothesis.values import Distribution, Pair, Token`);
    lines.push(`TEMPLATE = (${tokens.map(q).join(", ")})`);
    for (const v of order) {
      if (v.fn === "python" && v.code) {
        lines.push("");
        lines.push(v.code.replace(/def\s+compute\s*\(/, `def ${pyIdent(v.name)}_fn(`));
      }
    }
    lines.push("");
    lines.push(`@mechanism`);
    lines.push(`def ${fnName}(tok: FamilyDom(Dom(str), size=${tokens.length})):`);
    let lastCell = null;
    for (const v of order) {
      const cell = `L${v.layer} · ${q(tokens[v.tok] ?? "?")} (${v.tok})`;
      if (cell !== lastCell) {
        lines.push(`    # ${cell}`);
        lastCell = cell;
      }
      lines.push(`    ${pyIdent(v.name)} = V(${call(v)})  # ${describeType(types[v.id])}`);
      // Residual relays: one copy per layer the value is carried.
      const end = spanEnd(alg, "v:" + v.id, rd, vm);
      let prev = pyIdent(v.name);
      for (let l = v.layer + 1; l <= end; l++) {
        const name = `${pyIdent(v.name)}__L${l}`;
        lines.push(`    ${name} = V(${prev})  # carried to L${l}`);
        prev = name;
      }
    }
    const out = vm[alg.output];
    lines.push(`    # Token values are carried the same way; their relays are omitted here.`);
    lines.push(`    raw_input = V(render(tok), domain=Dom(str))  # noqa: F841`);
    lines.push(`    raw_output = V(str(${out ? pyIdent(out.name) : "None"}), domain=Dom(str))  # noqa: F841`);
    lines.push(`    return ${out ? pyIdent(out.name) : "None"}`);
    lines.push("");
    const placement = order.map((v) => `${q(pyIdent(v.name))}: (${v.tok}, ${v.layer})`).join(", ");
    lines.push(`# print_pos doubles as the grid placement: name -> (token, layer)`);
    lines.push(`model = CausalModel(${fnName}, id=${q(alg.id || fnName)}, print_pos={${placement}})`);
    return lines.join("\n");
  }

  const api = {
    EMB,
    tokenize,
    clauses,
    clauseOf,
    keyOf,
    show,
    outputLabel,
    top,
    PRIMS,
    pySource,
    describeType,
    typeKind,
    inferTypes,
    slotsFor,
    slotsOf,
    splitArgs,
    arityProblem,
    isList,
    readers,
    spanEnd,
    nodesAt,
    validateArg,
    evaluate,
    valueAt,
    output,
    interchangeIntervention,
    tokenSweep,
    fullSweep,
    PROMPTS,
    ALGORITHMS,
    getAlgorithm,
    toPython,
    varMap,
    argKey,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ALEngine = api;
})(typeof window !== "undefined" ? window : globalThis);
