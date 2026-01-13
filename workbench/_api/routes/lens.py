import math
from enum import Enum

import torch as t
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..auth import require_user_email, user_has_model_access
from ..data_models import NDIFResponse, Token
from ..state import AppState, get_state
from ..telemetry import RequestStatus, Stage, TelemetryClient

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

    if state.remote:
        if not user_has_model_access(user_email, req.model, state):
            message = f"User does not have access to {req.model}"
            TelemetryClient.log_request(
                RequestStatus.ERROR, 
                user_email,
                method="LENS",
                type="LINE",
                msg=message,
            )
            raise HTTPException(status_code=403, detail=message)

    TelemetryClient.log_request(
        RequestStatus.STARTED, 
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

    if state.remote:
        if not user_has_model_access(user_email, req.model, state):
            message = f"User does not have access to {req.model}"
            TelemetryClient.log_request(
                RequestStatus.ERROR, 
                user_email,
                method="LENS",
                type="GRID",
                msg=message,
            )
            raise HTTPException(status_code=403, detail=message)

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


############ V2 FORMAT (LogitLensKit compatible) ############

class LogitLensV2Request(BaseModel):
    model: str
    prompt: str
    k: int = 5  # Top-k predictions to track
    include_rank: bool = True  # Whether to include rank trajectories
    include_entropy: bool = True  # Whether to include entropy data


class LogitLensV2Meta(BaseModel):
    version: int = 2
    model: str


class LogitLensV2Response(NDIFResponse):
    meta: LogitLensV2Meta | None = None
    input: list[str] | None = None
    layers: list[int] | None = None
    topk: list[list[list[str]]] | None = None  # [layer][position][k]
    tracked: list[dict[str, dict | list[float]]] | None = None  # [position]{token: {prob, rank} or trajectory}
    entropy: list[list[float]] | None = None  # [layer][position] - entropy at each position/layer


def collect_logit_lens_v2(
    req: LogitLensV2Request, state: AppState
) -> dict | str:
    """
    Collect logit lens data in V2 format (LogitLensKit compatible).

    Returns top-k predictions and probability trajectories for all tracked tokens,
    optimized for bandwidth (server-side reduction).

    Uses the shared collect_logit_lens implementation from workbench.logitlens.
    """
    from workbench.logitlens.collect import collect_logit_lens

    model = state[req.model]
    backend = state.make_backend(model=model)

    # Call the unified collect_logit_lens function
    # For remote execution with non-blocking backend, returns job_id string
    # For local execution, returns dict with tensor results
    return collect_logit_lens(
        prompt=req.prompt,
        model=model,
        k=req.k,
        remote=state.remote,
        backend=backend,
        include_rank=req.include_rank,
        include_entropy=req.include_entropy,
    )


def process_v2_results(
    result: dict,
    req: LogitLensV2Request = None,
    state: AppState = None,
) -> dict:
    """Convert tensor results to frontend-ready V2 JSON format.

    Uses the shared to_js_format implementation from workbench.logitlens.display.

    For local execution, result already contains vocab/model/input/layers.
    For remote execution, we need to build those from req/state.
    """
    from workbench.logitlens.display import to_js_format

    # Check if result already has vocab (local execution path)
    if "vocab" in result:
        return to_js_format(result)

    # Remote execution path: build missing metadata
    model = state[req.model]
    tok = model.tokenizer

    # Build vocabulary map from tensors
    all_ids = set(result["topk"].flatten().tolist())
    for t_ids in result["tracked"]:
        all_ids.update(t_ids.tolist())
    vocab = {i: tok.decode([i]) for i in all_ids}

    # Build complete result dict for to_js_format
    n_layers = result["topk"].shape[0]
    complete_result = {
        "model": req.model,
        "input": [tok.decode([t]) for t in tok.encode(req.prompt)],
        "layers": list(range(n_layers)),
        "topk": result["topk"],
        "tracked": result["tracked"],
        "probs": result["probs"],
        "vocab": vocab,
    }
    if "ranks" in result and result["ranks"] is not None:
        complete_result["ranks"] = result["ranks"]
    if "entropy" in result and result["entropy"] is not None:
        complete_result["entropy"] = result["entropy"]

    return to_js_format(complete_result)


@router.post("/start-v2", response_model=LogitLensV2Response)
async def start_v2(
    req: LogitLensV2Request,
    state: AppState = Depends(get_state),
    user_email: str = Depends(require_user_email)
):
    """Start V2 format logit lens collection (LogitLensKit compatible)."""

    if state.remote:
        if not user_has_model_access(user_email, req.model, state):
            message = f"User does not have access to {req.model}"
            TelemetryClient.log_request(
                RequestStatus.ERROR,
                user_email,
                method="LENS",
                type="V2",
                msg=message,
            )
            raise HTTPException(status_code=403, detail=message)

    TelemetryClient.log_request(
        RequestStatus.STARTED,
        user_email,
        method="LENS",
        type="V2",
    )

    try:
        result = collect_logit_lens_v2(req, state)
    except Exception as e:
        TelemetryClient.log_request(
            RequestStatus.ERROR,
            user_email,
            method="LENS",
            type="V2",
            msg=str(e),
        )
        raise e

    if state.remote:
        TelemetryClient.log_request(
            RequestStatus.READY,
            user_email,
            method="LENS",
            type="V2",
            job_id=result,
        )
        return {"job_id": result}

    processed = process_v2_results(result, req, state)
    return processed


@router.post("/results-v2/{job_id}", response_model=LogitLensV2Response)
async def collect_v2(
    job_id: str,
    req: LogitLensV2Request,
    state: AppState = Depends(get_state),
    user_email: str = Depends(require_user_email)
):
    """Collect V2 format results for remote job."""
    backend = state.make_backend(job_id=job_id)

    try:
        with TelemetryClient.log_latency(
            user_email=user_email,
            job_id=job_id,
            method="LENS",
            type="V2",
            stage=Stage.DOWNLOAD
        ):
            results = backend()
    except Exception as e:
        TelemetryClient.log_request(
            RequestStatus.ERROR,
            user_email,
            job_id=job_id,
            method="LENS",
            type="V2",
            msg=str(e)
        )
        raise e

    TelemetryClient.log_request(
        RequestStatus.COMPLETE,
        user_email,
        job_id=job_id,
        method="LENS",
        type="V2",
    )

    processed = process_v2_results(results, req, state)
    return processed
