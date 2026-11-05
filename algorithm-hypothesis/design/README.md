# Algorithm Hypothesis design doc

The design doc and its live mockups. The real editor (P2) lives in workbench on
branch `feat/algorithm-hypothesis`; the mockups here are a sketchpad and a
preview of the visualizers (P4, P5).

| Path | What it is |
| --- | --- |
| `design-doc.html` | The doc. Opens directly in a browser. |
| `assets/engine.js` | Mockup engine: primitives, residual spans, interchange interventions, sweeps. Runs in Node too. |
| `assets/grid.js` | Grid renderer shared by every mockup. |
| `assets/store.js` | In-page store so algorithms saved in the editor mockup show up in the visualizers. |
| `assets/mock-editor.js` | Mockup 1: algorithm editor (the design for P2). |
| `assets/mock-intervention.js` | Mockup 2: cell intervention (preview of P4). |
| `assets/mock-sweep.js` | Mockup 3: token sweep (preview of P5). |
| `assets/doc.css` | Styles, using workbench's tokens. |
| `build.py` | Inlines everything into `dist/algorithm-hypothesis.html` for publishing. |

Terms: inputs are the source and the target; the output (and run) after an
interchange intervention is the counterfactual.
