from fastapi import APIRouter, Depends
from pydantic import BaseModel
import torch as t
import math

from ..state import AppState, get_state
from ..data_models import Token, NDIFResponse
from ..auth import require_user_email
from ..telemetry import TelemetryClient, RequestStatus, Stage

from enum import Enum

############ LINE ############

class LensStatistic(str, Enum):
    PROBABILITY = "probability"
    RANK = "rank"
    ENTROPY = "entropy"

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


class LensLineResponse(NDIFResponse):
    data: list[Line] | None = None


router = APIRouter()


def line(req: LensLineRequest, state: AppState) -> list[t.Tensor]:
    model = state[req.model]
    idx = req.token.idx
    target_ids = req.token.target_ids

    def _compute_top_probs(
        logits,
    ):
        return t.nn.functional.softmax(logits, dim=-1)
    
    def _compute_rank(
        logits,
    ):
        sorted_probs, sorted_indices = t.nn.functional.softmax(logits, dim=-1).sort(descending=True, dim=-1)
        rank_map = t.empty_like(sorted_indices)
        rank_map.scatter_(
            -1,  # along vocab axis
            sorted_indices,
            t.arange(1, logits.size(-1)+1).expand_as(sorted_indices).to(logits.device)
        )
        return rank_map

    if req.stat == LensStatistic.PROBABILITY:
        _compute_func = _compute_top_probs
    elif req.stat == LensStatistic.RANK:
        _compute_func = _compute_rank

    with model.trace(
        req.prompt,
        remote=state.remote,
        backend=state.make_backend(model=model),
    ) as tracer:
        results = []
        for layer in model.model.layers:
            # Decode hidden state into vocabulary
            hidden_BLD = layer.output

            if isinstance(hidden_BLD, tuple):
                hidden_BLD = hidden_BLD[0]

            # NOTE(cadentj): Can't pickle local decode function atm
            logits_BLV = model.lm_head(model.model.ln_f(hidden_BLD))

            # Compute probabilities over the relevant tokens
            logits_V = logits_BLV[0, idx, :]

            metrics = _compute_func(logits_V)
            
            # Gather probabilities over the predicted tokens
            target_ids_tensor = t.tensor(target_ids).to(metrics.device)
            target_probs_X = t.gather(metrics, 0, target_ids_tensor)

            results.append(target_probs_X)

        results.save()

    if state.remote:
        return tracer.backend.job_id

    return results


def get_remote_line(user_email: str, job_id: str, state: AppState):
    backend = state.make_backend(job_id=job_id)
    
    with TelemetryClient.log_latency(
        user_email=user_email,
        job_id=job_id,
        method="LENS",
        type="LINE",
        stage=Stage.DOWNLOAD
    ):
        results = backend()
    return results["results"]


def process_line_results(
    results: list[t.Tensor],
    req: LensLineRequest,
    state: AppState,
):
    tok = state[req.model].tokenizer
    target_token_strs = tok.batch_decode(req.token.target_ids)

    lines = []

    # Get results into a format for the FE component
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


@router.post("/start-line", response_model=LensLineResponse)
async def start_line(
    req: LensLineRequest, 
    state: AppState = Depends(get_state),
    user_email: str = Depends(require_user_email)
):

    TelemetryClient.log_request(
        RequestStatus.READY, 
        user_email,
        method="LENS",
        type="LINE",
        metric=req.stat.value
    )

    try:
        result = line(req, state)
    except Exception as e:
        TelemetryClient.log_request(
            RequestStatus.ERROR, 
            user_email, 
            method="LENS",
            type="LINE",
            metric=req.stat.value,
            msg=str(e),
        )
        # TODO: Add logging here
        raise e

    if state.remote:
        TelemetryClient.log_request(
            RequestStatus.READY, 
            user_email,
            method="LENS",
            type="LINE",
            metric=req.stat.value,
            job_id=result
        )
        return {"job_id": result}

    return {"data": process_line_results(result, req, state)}


@router.post("/results-line/{job_id}", response_model=LensLineResponse)
async def collect_line(
    job_id: str,
    req: LensLineRequest,
    state: AppState = Depends(get_state),
    user_email: str = Depends(require_user_email)
):

    try:
        results = get_remote_line(user_email, job_id, state)
    except Exception as e:
        TelemetryClient.log_request(
            RequestStatus.ERROR, 
            user_email, 
            job_id=job_id, 
            method="LENS",
            type="LINE",
            metric=req.stat.value,
            msg=str(e)
        )
        # TODO: Add logging here
        raise e

    TelemetryClient.log_request(
        RequestStatus.COMPLETE, 
        user_email, 
        job_id=job_id, 
        method="LENS",
        type="LINE",
        metric=req.stat.value
    )

    return {"data": process_line_results(results, req, state)}

############ GRID ############

class GridLensRequest(BaseModel):
    model: str
    stat: LensStatistic
    prompt: str

class GridCell(Point):
    label: str


class GridRow(BaseModel):
    # Token ID
    id: str
    data: list[GridCell]
    right_axis_label: str | None = None


class GridLensResponse(NDIFResponse):
    data: list[GridRow] | None = None


def heatmap(
    req: GridLensRequest, state: AppState
) -> tuple[list[t.Tensor], list[t.Tensor]]:
    model = state[req.model]

    def _compute_top_probs(
        hs_decoded,
        logits,
    ):
        pred_ids = []
        probs = []

        for hs in hs_decoded:
            relevant_tokens_LV = hs[0, :, :]

            probs_LV = t.nn.functional.softmax(relevant_tokens_LV, dim=-1)
            pred_ids_L = relevant_tokens_LV.argmax(dim=-1)

            # Gather probabilities over the predicted tokens
            pred_ids_L1 = pred_ids_L.unsqueeze(1)
            probs_L = t.gather(probs_LV, 1, pred_ids_L1).squeeze()

            pred_ids.append(pred_ids_L.tolist())
            probs.append(probs_L.tolist())

        return probs, pred_ids

    def _compute_rank(
        hs_decoded,
        logits,
    ):
        # pred_ids = []
        ranks = []

        top_tokens = logits.argmax(dim=-1)
        
        for hs in hs_decoded:
            sorted_probs, sorted_indices = t.nn.functional.softmax(hs, dim=-1).sort(descending=True, dim=-1)

            rank_map = t.empty_like(sorted_indices)
            rank_map.scatter_(
                2,  # along vocab axis
                sorted_indices,
                t.arange(1, logits.size(-1)+1).expand_as(sorted_indices).to(hs.device)
            )
            # token_ids: [batch, seq_len]
            ranks_L = rank_map.gather(2, top_tokens.unsqueeze(-1)).squeeze(-1)

            ranks.append(ranks_L[0].to("cpu").tolist())

        return ranks, top_tokens[0].to('cpu').tolist()


    def _compute_entropy(
        hs_decoded,
        logits,
    ):
        entropies = []

        for hs in hs_decoded:
            hs = hs[0, :, :]
            log_p = t.nn.functional.log_softmax(hs, dim=-1)     # stable log-softmax
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

    with model.trace(
        req.prompt,
        remote=state.remote,
        backend=state.make_backend(model=model),
    ) as tracer:
        hs_decoded = []

        for layer in model.model.layers[:-1]:
            hs = layer.output

            if isinstance(hs, tuple):
                hs = hs[0]

            hs = model.lm_head(model.model.ln_f(hs))
            hs_decoded.append(hs)

        logits = model.output.logits
        hs_decoded.append(logits)

        stats, pred_ids = _compute_func(hs_decoded, logits)
        stats.save()
        pred_ids.save()

    if state.remote:
        return tracer.backend.job_id

    return stats, pred_ids

def get_remote_heatmap(
    user_email: str, 
    job_id: str, 
    state: AppState
) -> tuple[list[t.Tensor], list[t.Tensor]]:
    backend = state.make_backend(job_id=job_id)

    with TelemetryClient.log_latency(
        user_email=user_email,
        job_id=job_id,
        method="LENS",
        type="GRID",
        stage=Stage.DOWNLOAD
    ):
        results = backend()
    
    return results["stats"], results["pred_ids"]


def process_grid_results(
    stats: list[t.Tensor],
    pred_ids: list[t.Tensor],
    lens_request: GridLensRequest,
    state: AppState,
):
    """Background task to process grid lens computation"""
    # Get the stringified tokens of the input
    tok = state[lens_request.model].tokenizer
    input_strs = tok.batch_decode(tok.encode(lens_request.prompt))

    rows = []
    for seq_idx, input_str in enumerate(input_strs):
        if lens_request.stat == LensStatistic.PROBABILITY:
            points = [
                GridCell(
                    x=layer_idx,
                    y=stat[seq_idx],
                    label=tok.decode(pred_id[seq_idx]),
                )
                for layer_idx, (stat, pred_id) in enumerate(zip(stats, pred_ids))
            ]
            # Add the input string to the row id to make it unique
            rows.append(GridRow(id=f"{input_str}-{seq_idx}", data=points))
        elif lens_request.stat == LensStatistic.RANK:
            points = [
                GridCell(
                    x=layer_idx,
                    y=math.log(stat[seq_idx]),
                    label=str(stat[seq_idx]),
                )
                for layer_idx, stat in enumerate(stats)
            ]
            # Add the input string to the row id to make it unique
            rows.append(GridRow(id=f"{input_str}-{seq_idx}", data=points, right_axis_label=tok.decode(pred_ids[seq_idx])))
        elif lens_request.stat == LensStatistic.ENTROPY:
            points = [
                GridCell(
                    x=layer_idx,
                    y=stat[seq_idx],
                    label=f"{stat[seq_idx]:.4f}",
                )
                for layer_idx, stat in enumerate(stats)
            ]
            # Add the input string to the row id to make it unique
            rows.append(GridRow(id=f"{input_str}-{seq_idx}", data=points, right_axis_label=tok.decode(pred_ids[seq_idx])))

    return rows


@router.post("/start-grid", response_model=GridLensResponse)
async def get_grid(
    req: GridLensRequest, 
    state: AppState = Depends(get_state),
    user_email: str = Depends(require_user_email)   
):

    TelemetryClient.log_request(
        RequestStatus.STARTED, 
        user_email,
        method="LENS",
        type="GRID",
        metric=req.stat.value
    )
    
    try:
        result = heatmap(req, state)
    except Exception as e:
        TelemetryClient.log_request(
            RequestStatus.ERROR, 
            user_email, 
            method="LENS",
            type="GRID",
            metric=req.stat.value,
            msg=str(e),
        )
        raise e

    if state.remote:
        TelemetryClient.log_request(
            RequestStatus.READY, 
            user_email,
            method="LENS",
            type="GRID",
            metric=req.stat.value,
            job_id=result
        )
        return {"job_id": result}

    probs, pred_ids = result
    return {"data": process_grid_results(probs, pred_ids, req, state)}


@router.post("/results-grid/{job_id}", response_model=GridLensResponse)
async def collect_grid(
    job_id: str,
    lens_request: GridLensRequest,
    state: AppState = Depends(get_state),
    user_email: str = Depends(require_user_email)
):
    try:
        probs, pred_ids = get_remote_heatmap(user_email, job_id, state)
    except Exception as e:
        TelemetryClient.log_request(
            RequestStatus.ERROR, 
            user_email, 
            job_id=job_id, 
            method="LENS",
            type="GRID",
            metric=lens_request.stat.value,
            msg=str(e)
        )
        raise e
    
    TelemetryClient.log_request(
        RequestStatus.COMPLETE, 
        user_email,
        job_id=job_id,
        method="LENS",
        type="GRID",
        metric=lens_request.stat.value
    )
    return {"data": process_grid_results(probs, pred_ids, lens_request, state)}
