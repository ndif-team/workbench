# Patch Lens

**Patch Lens** is an interactive tool for *activation patching* (a.k.a. causal
mediation): copy one cell of a model's residual stream from a **source** prompt
into a **target** prompt, recompute, and see how — and how far — that single edit
changes the model's output.

It runs the logit lens over both prompts and over the patched result, and shades
every cell so you can read the **scope of a patch** at a glance: which cells were
downstream of the edit, and where the model's final answer emerges.

## The model

You work with up to two prompts, shown as side-by-side heatmaps (rows = token
positions, columns = layers; each cell is the top‑1 token the logit lens reads
out at that position/layer, shaded by probability):

- **Source** prompt — the state you want to *steal from* (cyan).
- **Target** prompt — the state you want to *patch into* (pink). Leave it blank
  to use Patch Lens as a plain single‑prompt logit‑lens viewer.

To run a patch, drag a cell from the source grid onto a cell in the target grid.
That replaces the target's residual stream at the chosen `(token, layer)` with the
source's, reruns the model, and renders a third **Result (intervened)** grid.

## Patch scope: the causal cone

A patch at target cell `(T, L)` — token position `T`, layer `L` — can only affect
cells that are **downstream of it in the computation**. Concretely, a cell
`(t, l)` is *affected* ("tainted") when:

```
l > L   AND   t >= T
```

i.e. **strictly deeper layers, at the patched token or any later token** — the
region to the *right of and below* the patched cell.

Why that shape:

- **Same token, deeper layers** (`t == T, l > L`): the patched value rides the
  residual stream forward into every later layer at that position.
- **Later tokens, deeper layers** (`t > T, l > L`): attention at the *next* layer
  reads the patched position's output into later positions, which then propagate
  forward.
- **Same layer (`l == L`)**: those cells were already computed from layer `L-1`,
  independently of the patch — so they are **not** affected, even at later tokens.

That last point is the subtle one: a patch does **not** spread sideways within its
own layer. The visualization reflects this — there is no downward flow arrow
leaving the patched cell, and same‑layer cells keep their normal color.

## Reading the result grid

Cell **fill** is shaded by probability (white → the color below). Cell **border**
carries the taint marker.

| Encoding | Meaning |
|---|---|
| Pink fill | Normal cell, not downstream of the patch. |
| Cyan fill | The patched cell itself (the source state that was injected). |
| **Brown** fill | The cell's top‑1 token equals the model's **final output token** — where the answer emerges in the network. |
| **Purple** fill | Tainted: downstream of the patch (in the cone) and *not* the final‑output token. |
| Brown fill **+ purple border** | Both at once — the final answer emerging *inside* the cone. The brown fill keeps the answer visible; the purple border still flags it as tainted. |

So the cone reads as a block of purple to the lower‑right of the patch, with brown
cells (and purple borders) marking where the patched run's answer surfaces.

### Clicking a cell

Clicking any cell highlights its row, column, and causal cone. In the result
grid that highlight follows the **same rule as the shading**: it is **purple over
the affected region** (right of and at/below the patch) and **pink everywhere
else**, so the selection makes the patch scope obvious.

## Prompt history

Every run is saved per chart (across models) and listed under the controls. Click
an entry to restore its prompts, model, and patch; use **Compare** to line up the
final‑token predictions (or full heatmaps) of several runs side by side. A
restored patch redraws the full result — cone, arrow, and all — without rerunning.

## How it works (for developers)

- **Frontend** (`workbench/_web`): the route is
  `app/workbench/[workspaceId]/patch-lens/[chartId]`. `PatchLensArea` owns the
  prompts, the run, and the inline prompt history; `PatchLensDisplay` renders the
  widget and maps the persisted `intervention` spec into it. The chart type is
  stored as `"patch-lens"`; prompt history lives in the `lens_runs` table.
- **Backend** (`workbench/_api`): patches and lens runs go through the
  `/causal_mediation` route, which wraps the corresponding `nnsightful` tool and
  executes it on NDIF (or a local model).
- **Widget** (`edulogitlens`): `CausalMediationExplorer` orchestrates the three
  grids and the patch arrow; `HeatmapGrid` does the shading. The patch‑scope rule
  lives in `isCellAffected`, and the color priority (intervention → final token →
  affected → base, plus the tainted border) lives in `getBaseColor` /
  `HeatmapCell`.

!!! note "Naming"
    The *tool* is "Patch Lens"; the *technique* it runs is causal mediation, which
    is why the backend route and `nnsightful` tool keep the `causal_mediation`
    name.
