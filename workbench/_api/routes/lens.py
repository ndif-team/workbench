import math
from enum import Enum

import torch as t
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ..auth import require_user_email, user_has_model_access
from ..data_models import Token
from ..sse import MEDIA_TYPE, stream_backend, stream_value
from ..state import AppState, get_state


class LensStatistic(str, Enum):
    PROBABILITY = "probability"
    RANK = "rank"
    ENTROPY = "entropy"


router = APIRouter()


# -------------------------------- LINE ------------------------------------


class LensLineRequest(BaseModel):
    model: str
    stat: LensStatistic
    prompt: str
    token: Token


class Point(BaseModel):
    x: int
    y: float


class Line(BaseModel):
    id: str
    data: list[Point]


def _trace_line(req: LensLineRequest, state: AppState, backend):
    """Run the lens-line trace. Saves a list of per-layer tensors under key 'results'."""
    model = state[req.model]
    idx = req.token.idx
    target_ids = req.token.target_ids

    def _compute_top_probs(logits):
        return t.nn.functional.softmax(logits, dim=-1)

    def _compute_rank(logits):
        sorted_probs, sorted_indices = t.nn.functional.softmax(logits, dim=-1).sort(
            descending=True, dim=-1
        )
        rank_map = t.empty_like(sorted_indices)
        rank_map.scatter_(
            -1,
            sorted_indices,
            t.arange(1, logits.size(-1) + 1)
            .expand_as(sorted_indices)
            .to(logits.device),
        )
        return rank_map

    if req.stat == LensStatistic.PROBABILITY:
        _compute_func = _compute_top_probs
    elif req.stat == LensStatistic.RANK:
        _compute_func = _compute_rank
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported statistic for lens-line: {req.stat}",
        )

    with model.trace(req.prompt, remote=state.remote, backend=backend):
        results = []
        for layer in model.model.layers:
            hidden_BLD = layer.output
            if isinstance(hidden_BLD, tuple):
                hidden_BLD = hidden_BLD[0]
            logits_BLV = model.lm_head(model.model.ln_f(hidden_BLD))
            logits_V = logits_BLV[0, idx, :]
            metrics = _compute_func(logits_V)

            target_ids_tensor = t.tensor(target_ids).to(metrics.device)
            target_probs_X = t.gather(metrics, 0, target_ids_tensor)
            results.append(target_probs_X)

        results = results.save()

    return results


def _format_line(raw: dict, req: LensLineRequest, state: AppState) -> list[Line]:
    tok = state[req.model].tokenizer
    results = raw["results"]
    target_token_strs = tok.batch_decode(req.token.target_ids)

    lines: list[Line] = []

    for layer_idx, probs in enumerate(results):
        for line_idx, prob in enumerate(probs.tolist()):
            if layer_idx == 0:
                lines.append(
                    Line(
                        id=target_token_strs[line_idx].replace(" ", "_"),
                        data=[Point(x=layer_idx, y=prob)],
                    )
                )
            else:
                lines[line_idx].data.append(Point(x=layer_idx, y=prob))

    return lines


@router.post("/run-line")
async def run_line(
    req: LensLineRequest,
    state: AppState = Depends(get_state),
    user_email: str = Depends(require_user_email),
):
    if state.remote and not user_has_model_access(user_email, req.model, state):
        raise HTTPException(
            status_code=403,
            detail=f"User does not have access to {req.model}",
        )

    if not state.remote:
        results = _trace_line(req, state, backend=None)
        lines = _format_line({"results": results}, req, state)
        return StreamingResponse(stream_value(lines), media_type=MEDIA_TYPE)

    model = state[req.model]
    backend = state.make_streaming_backend(model=model)
    _trace_line(req, state, backend=backend)

    def process(raw: dict) -> list[Line]:
        return _format_line(raw, req, state)

    return StreamingResponse(stream_backend(backend, process), media_type=MEDIA_TYPE)


# -------------------------------- GRID ------------------------------------


class GridLensRequest(BaseModel):
    model: str
    stat: LensStatistic
    prompt: str


class GridCell(Point):
    label: str


class GridRow(BaseModel):
    id: str
    data: list[GridCell]
    right_axis_label: str | None = None


def _trace_grid(req: GridLensRequest, state: AppState, backend):
    """Run the grid-lens trace. Saves 'stats' and 'pred_ids' lists."""
    model = state[req.model]

    def _compute_top_probs(hs_decoded, logits):
        pred_ids = []
        probs = []

        for hs in hs_decoded:
            relevant_tokens_LV = hs[0, :, :]
            probs_LV = t.nn.functional.softmax(relevant_tokens_LV, dim=-1)
            pred_ids_L = relevant_tokens_LV.argmax(dim=-1)
            pred_ids_L1 = pred_ids_L.unsqueeze(1)
            probs_L = t.gather(probs_LV, 1, pred_ids_L1).squeeze()
            pred_ids.append(pred_ids_L.tolist())
            probs.append(probs_L.tolist())

        return probs, pred_ids

    def _compute_rank(hs_decoded, logits):
        ranks = []
        top_tokens = logits.argmax(dim=-1)

        for hs in hs_decoded:
            sorted_probs, sorted_indices = t.nn.functional.softmax(hs, dim=-1).sort(
                descending=True, dim=-1
            )
            rank_map = t.empty_like(sorted_indices)
            rank_map.scatter_(
                2,
                sorted_indices,
                t.arange(1, logits.size(-1) + 1)
                .expand_as(sorted_indices)
                .to(hs.device),
            )
            ranks_L = rank_map.gather(2, top_tokens.unsqueeze(-1)).squeeze(-1)
            ranks.append(ranks_L[0].to("cpu").tolist())

        return ranks, top_tokens[0].to("cpu").tolist()

    def _compute_entropy(hs_decoded, logits):
        entropies = []

        for hs in hs_decoded:
            hs = hs[0, :, :]
            log_p = t.nn.functional.log_softmax(hs, dim=-1)
            p = log_p.exp()
            H = -(p * log_p).sum(dim=-1)
            entropies.append(H.to("cpu").tolist())

        return entropies, logits.argmax(dim=-1)[0].to("cpu").tolist()

    if req.stat == LensStatistic.PROBABILITY:
        _compute_func = _compute_top_probs
    elif req.stat == LensStatistic.RANK:
        _compute_func = _compute_rank
    elif req.stat == LensStatistic.ENTROPY:
        _compute_func = _compute_entropy
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported statistic for lens-grid: {req.stat}",
        )

    with model.trace(req.prompt, remote=state.remote, backend=backend):
        hs_decoded = []

        for layer in model.model.layers[:-1]:
            hs = layer.output
            if isinstance(hs, tuple):
                hs = hs[0]
            hs_decoded.append(model.lm_head(model.model.ln_f(hs)))

        logits = model.output.logits
        hs_decoded.append(logits)

        stats, pred_ids = _compute_func(hs_decoded, logits)
        stats = stats.save()
        pred_ids = pred_ids.save()

    return stats, pred_ids


def _format_grid(raw: dict, req: GridLensRequest, state: AppState) -> list[GridRow]:
    tok = state[req.model].tokenizer
    stats = raw["stats"]
    pred_ids = raw["pred_ids"]

    input_strs = tok.batch_decode(tok.encode(req.prompt))

    rows: list[GridRow] = []
    for seq_idx, input_str in enumerate(input_strs):
        if req.stat == LensStatistic.PROBABILITY:
            points = [
                GridCell(
                    x=layer_idx,
                    y=stat[seq_idx],
                    label=tok.decode(pred_id[seq_idx]),
                )
                for layer_idx, (stat, pred_id) in enumerate(zip(stats, pred_ids))
            ]
            rows.append(GridRow(id=f"{input_str}-{seq_idx}", data=points))
        elif req.stat == LensStatistic.RANK:
            points = [
                GridCell(
                    x=layer_idx,
                    y=math.log(stat[seq_idx]),
                    label=str(stat[seq_idx]),
                )
                for layer_idx, stat in enumerate(stats)
            ]
            rows.append(
                GridRow(
                    id=f"{input_str}-{seq_idx}",
                    data=points,
                    right_axis_label=tok.decode(pred_ids[seq_idx]),
                )
            )
        elif req.stat == LensStatistic.ENTROPY:
            points = [
                GridCell(
                    x=layer_idx,
                    y=stat[seq_idx],
                    label=f"{stat[seq_idx]:.4f}",
                )
                for layer_idx, stat in enumerate(stats)
            ]
            rows.append(
                GridRow(
                    id=f"{input_str}-{seq_idx}",
                    data=points,
                    right_axis_label=tok.decode(pred_ids[seq_idx]),
                )
            )

    return rows


@router.post("/run-grid")
async def run_grid(
    req: GridLensRequest,
    state: AppState = Depends(get_state),
    user_email: str = Depends(require_user_email),
):
    if state.remote and not user_has_model_access(user_email, req.model, state):
        raise HTTPException(
            status_code=403,
            detail=f"User does not have access to {req.model}",
        )

    if not state.remote:
        stats, pred_ids = _trace_grid(req, state, backend=None)
        rows = _format_grid({"stats": stats, "pred_ids": pred_ids}, req, state)
        return StreamingResponse(stream_value(rows), media_type=MEDIA_TYPE)

    model = state[req.model]
    backend = state.make_streaming_backend(model=model)
    _trace_grid(req, state, backend=backend)

    def process(raw: dict) -> list[GridRow]:
        return _format_grid(raw, req, state)

    return StreamingResponse(stream_backend(backend, process), media_type=MEDIA_TYPE)
