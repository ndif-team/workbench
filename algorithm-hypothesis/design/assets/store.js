/*
 * Algorithm Lens — shared in-page store for the mockups.
 * Saved algorithms are visible to every mockup on the page. They are also
 * kept in this browser's localStorage as a convenience; the real tool stores
 * them per workspace (see §9).
 */
(function (root) {
  "use strict";
  const E = root.ALEngine;
  const KEY = "algorithm-lens-design:saved";
  const PRESETS = ["positional", "lexical", "reflexive", "mixed"];
  let saved = [];
  const subs = new Set();

  try {
    const raw = localStorage.getItem(KEY);
    if (raw) saved = JSON.parse(raw) || [];
  } catch (e) {
    saved = [];
  }

  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(saved));
    } catch (e) {
      /* storage unavailable; keep in memory */
    }
  }

  const store = {
    presets: PRESETS,
    list() {
      return [...PRESETS.map((id) => E.getAlgorithm(id)), ...saved.map((a) => JSON.parse(JSON.stringify(a)))];
    },
    get(id) {
      if (PRESETS.includes(id)) return E.getAlgorithm(id);
      const a = saved.find((x) => x.id === id);
      return a ? JSON.parse(JSON.stringify(a)) : null;
    },
    save(alg) {
      const copy = JSON.parse(JSON.stringify(alg));
      const i = saved.findIndex((x) => x.id === copy.id);
      if (i >= 0) saved[i] = copy;
      else saved.push(copy);
      persist();
      subs.forEach((fn) => fn());
      return copy;
    },
    remove(id) {
      saved = saved.filter((x) => x.id !== id);
      persist();
      subs.forEach((fn) => fn());
    },
    isPreset(id) {
      return PRESETS.includes(id);
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };

  root.ALStore = store;
})(window);
