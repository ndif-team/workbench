import asyncio
from fastapi import APIRouter, Depends
from pydantic import BaseModel
import torch as t

from ..state import AppState, get_state
from ..data_models import Token
from ..jobs import jobs


class LensLineRequest(BaseModel):
    model: str
    prompt: str
    token: Token


class Point(BaseModel):
    x: int
    y: float


class Line(BaseModel):
    id: str
    data: list[Point]


class LensLineResponse(BaseModel):
    lines: list[Line]


router = APIRouter()


def line(req: LensLineRequest, state: AppState):
    model = state.get_model(req.model)

    def decode(x):
        return model.lm_head(model.model.ln_f(x))

    results = []
    with model.trace(req.prompt, remote=state.remote):
        for layer in model.model.layers:
            # Decode hidden state into vocabulary
            hidden_BLD = layer.output[0]
            logits_BLV = decode(hidden_BLD)

            # Compute probabilities over the relevant tokens
            logits_V = logits_BLV[0, req.token.idx, :]

            probs_V = t.nn.functional.softmax(logits_V, dim=-1)

            # Gather probabilities over the predicted tokens
            target_probs_X = t.gather(
                probs_V, 0, t.tensor(req.token.target_ids)
            )

            results.append(target_probs_X.save())

    return [r.value for r in results]


async def execute_line(
    lens_request: LensLineRequest,
    state: AppState,
):
    # Run computation in thread pool
    raw_results = await asyncio.to_thread(line, lens_request, state)

    tok = state[lens_request.model].tokenizer
    target_token_strs = tok.batch_decode(lens_request.token.target_ids)

    # Postprocess results
    lines = []
    for layer_idx, probs in enumerate(raw_results):
        for line_idx, prob in enumerate(probs.tolist()):
            if layer_idx == 0:
                lines.append(
                    Line(id=target_token_strs[line_idx].replace(" ", "_"), data=[Point(x=layer_idx, y=prob)])
                )
            else:
                lines[line_idx].data.append(Point(x=layer_idx, y=prob))

    return LensLineResponse(
        lines=lines,
    ).model_dump()


@router.post("/get-line")
async def get_line(
    lens_request: LensLineRequest, state: AppState = Depends(get_state)
):
    return jobs.create_job(execute_line, lens_request, state)


@router.get("/listen-line/{job_id}")
async def listen_line(job_id: str):
    """Listen for line lens results via SSE using MemoryObjectStream"""
    return jobs.get_job(job_id)


class GridLensRequest(BaseModel):
    model: str
    prompt: str


class GridCell(Point):
    label: str
    # Top-k decoded tokens with probabilities for this cell (optional)
    # Using camelCase to match frontend expectations
    class TopToken(BaseModel):
        token: str
        prob: float

    topTokens: list[TopToken] | None = None

class GridRow(BaseModel):
    # Token ID
    id: str
    data: list[GridCell]

class GridLensResponse(BaseModel):
    rows: list[GridRow]


def heatmap(req: GridLensRequest, state: AppState):
    model = state.get_model(req.model)

    def decode(x):
        return model.lm_head(model.model.ln_f(x))

    pred_ids = []
    probs = []
    topk_ids = []
    topk_probs = []

    def _compute_top_probs(logits_BLV: t.Tensor):
        relevant_tokens_LV = logits_BLV[0, :, :]

        probs_LV = t.nn.functional.softmax(relevant_tokens_LV, dim=-1)
        # Top-5 per position along vocab dimension
        top_probs_LK, top_ids_LK = probs_LV.topk(k=5, dim=-1)

        # Top-1 for existing behavior
        pred_ids_L = top_ids_LK[:, 0]
        probs_L = top_probs_LK[:, 0]

        pred_ids.append(pred_ids_L.save())
        probs.append(probs_L.save())
        topk_ids.append(top_ids_LK.save())
        topk_probs.append(top_probs_LK.save())

    with model.trace(req.prompt, remote=state.remote):
        for layer in model.model.layers[:-1]:
            _compute_top_probs(decode(layer.output[0]))
        _compute_top_probs(model.output.logits)

    # TEMP FIX FOR 0.4
    # Specifically, can't call .tolist() bc items are still proxies
    probs = [p.tolist() for p in probs]
    pred_ids = [p.tolist() for p in pred_ids]
    topk_ids = [p.tolist() for p in topk_ids]
    topk_probs = [p.tolist() for p in topk_probs]

    return pred_ids, probs, topk_ids, topk_probs


async def execute_grid(
    lens_request: GridLensRequest,
    state: AppState,
):
    """Background task to process grid lens computation"""

    # NOTE: These are ordered by layer
    pred_ids, probs, topk_ids, topk_probs = await asyncio.to_thread(heatmap, lens_request, state)

    # Get the stringified tokens of the input
    tok = state[lens_request.model].tokenizer
    input_strs = tok.batch_decode(tok.encode(lens_request.prompt))

    rows = []
    for seq_idx, input_str in enumerate(input_strs):
        points = []
        for layer_idx, (prob, pred_id) in enumerate(zip(probs, pred_ids)):
            # Build top-5 tokens for this cell
            top_tokens_for_cell: list[GridCell.TopToken] | None = None
            try:
                ids_k = topk_ids[layer_idx][seq_idx]
                probs_k = topk_probs[layer_idx][seq_idx]
                # Decode each token id to string
                decoded = [tok.decode(i) for i in ids_k]
                top_tokens_for_cell = [GridCell.TopToken(token=tkn, prob=float(p)) for tkn, p in zip(decoded, probs_k)]
            except Exception:
                top_tokens_for_cell = None

            points.append(
                GridCell(
                    x=layer_idx,
                    y=prob[seq_idx],
                    label=tok.decode(pred_id[seq_idx]),
                    topTokens=top_tokens_for_cell,
                )
            )
        # Add the input string to the row id to make it unique
        rows.append(GridRow(id=f"{input_str}-{seq_idx}", data=points))

    return GridLensResponse(rows=rows).model_dump()


@router.post("/get-grid")
async def get_grid(
    lens_request: GridLensRequest, state: AppState = Depends(get_state)
):
    return jobs.create_job(execute_grid, lens_request, state)


@router.get("/listen-grid/{job_id}")
async def listen_grid(job_id: str):
    """Listen for grid lens results via SSE using MemoryObjectStream"""
    return jobs.get_job(job_id)
