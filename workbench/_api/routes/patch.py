from itertools import chain
from typing import List, NamedTuple
import asyncio

import einops
from fastapi import APIRouter, Request
from nnterp import StandardizedTransformer
import nnsight as ns
import torch as t
from transformers import AutoTokenizer

from pydantic import BaseModel, ConfigDict, Field, model_validator
from typing import Optional, Literal


"""
Dimension key:

B: batch size
L: sequence length
M: memory length (length of sequence being attended to)
D: model dimension (sometimes called d_model or embedding_dim)
V: vocabulary size
H: number of attention heads in a layer
Dh: size of each attention head
"""

EPS = 1e-10


class Point(BaseModel):
    model_config = ConfigDict(frozen=True)

    token_indices: List[int] = Field(alias="tokenIndices")
    counter_index: int = Field(alias="counterIndex")

    def __hash__(self):
        return hash((tuple(self.token_indices), self.counter_index))


class Connection(BaseModel):
    model_config = ConfigDict(frozen=True)

    start: Point
    end: Point

    def __hash__(self):
        return hash((self.start, self.end))


class PatchRequest(BaseModel):
    model_config = ConfigDict(
        extra="ignore"
    )

    model: str
    source: str
    destination: str
    edits: List[Connection]
    submodule: Literal["attn", "mlp", "blocks", "heads"]
    patch_tokens: bool = Field(alias="patchTokens")

    correct_id: int = Field(alias="correctId")
    incorrect_id: Optional[int] = Field(default=None, alias="incorrectId")

    @model_validator(mode="after")
    def validate_request(self):
        if self.submodule == "heads" and self.patch_tokens:
            raise ValueError("Cannot patch heads and tokens simultaneously")

        return self


class PatchResponse(BaseModel):
    results: List[List[float]]
    rowLabels: List[str | int] = Field(default_factory=list)
    colLabels: List[str | int] = Field(default_factory=list)


def get_components(model: StandardizedTransformer, patching_request: PatchRequest):
    n_layers = model.num_layers
    match patching_request.submodule:
        case "blocks":
            return [model.layers[i] for i in range(n_layers)]
        case "attn":
            return [model.attentions[i] for i in range(n_layers)]
        case "mlp":
            return [model.mlps[i] for i in range(n_layers)]
        case _:
            raise ValueError(f"Invalid submodule: {patching_request.submodule}")


def logit_difference(model: StandardizedTransformer, patching_request: PatchRequest):
    logits = model.logits
    return (
        logits[0, -1, patching_request.correct_id]
        - logits[0, -1, patching_request.incorrect_id]
    )


def compute_ioi_metric(source_diff, destination_diff, patched_diff):
    return (patched_diff - destination_diff) / (
        (source_diff - destination_diff) + EPS
    )


def get_prob(model: StandardizedTransformer, patching_request: PatchRequest):
    logits = model.logits
    probs = t.softmax(logits, dim=-1)
    return probs[0, -1, patching_request.correct_id]


def patch_components(model: StandardizedTransformer, patching_request: PatchRequest):
    components = get_components(model, patching_request)
    is_tuple = patching_request.submodule == "blocks"

    source_cache = {}

    with model.wrapped_session():
        results = ns.list().save()

        with model.trace(patching_request.source):
            for component in components:
                hidden_BLD = component.output

                if is_tuple:
                    hidden_BLD = hidden_BLD[0]

                source_cache[component] = hidden_BLD

            if patching_request.incorrect_id is not None:
                source_diff = logit_difference(model, patching_request)

        with model.trace(patching_request.destination):
            destination_diff = logit_difference(model, patching_request)

        for component in components:
            with model.trace(
                patching_request.destination,
            ):
                if is_tuple:
                    hidden_BLD_tuple = component.output
                    component.output = (
                        source_cache[component],
                        hidden_BLD_tuple[1],
                    )
                else:
                    component.output = source_cache[component]

                if patching_request.incorrect_id is not None:
                    patched_diff = logit_difference(model, patching_request)
                    ioi_metric = compute_ioi_metric(
                        source_diff, destination_diff, patched_diff
                    )
                    results.append(ioi_metric)
                else:
                    prob = get_prob(model, patching_request)
                    results.append(prob)

    return PatchResponse(
        results=[[r] for r in results],
    )


def patch_heads(model: StandardizedTransformer, patching_request: PatchRequest):
    components = [model.attentions[i].o_proj for i in range(model.num_layers)]
    n_heads = model.num_heads

    source_cache = {}

    with model.wrapped_session():
        results = ns.dict().save()

        with model.trace(patching_request.source):
            for component in components:
                hidden_BLD = component.input
                hidden_BLHDh = einops.rearrange(
                    hidden_BLD,
                    "b l (n_heads d_head) -> b l n_heads d_head",
                    n_heads=n_heads,
                )

                for head_idx in range(n_heads):
                    source_cache[(component, head_idx)] = hidden_BLHDh[
                        :, :, head_idx, :
                    ]

                if patching_request.incorrect_id is not None:
                    source_diff = logit_difference(model, patching_request)

        with model.trace(patching_request.destination):
            destination_diff = logit_difference(model, patching_request)

        for layer_idx, component in enumerate(components):
            for head_idx in range(n_heads):
                with model.trace(patching_request.destination):
                    hidden_BLD = component.input
                    hidden_BLHDh = einops.rearrange(
                        hidden_BLD,
                        "b l (n_heads d_head) -> b l n_heads d_head",
                        n_heads=n_heads,
                    )

                    hidden_BLHDh[:, :, head_idx, :] = source_cache[
                        (component, head_idx)
                    ]

                    hidden_BLD = einops.rearrange(
                        hidden_BLHDh,
                        "b l n_heads d_head -> b l (n_heads d_head)",
                    )

                    component.input = hidden_BLD

                    if patching_request.incorrect_id is not None:
                        patched_diff = logit_difference(model, patching_request)
                        ioi_metric = compute_ioi_metric(
                            source_diff, destination_diff, patched_diff
                        )
                        results[(layer_idx, head_idx)] = ioi_metric
                    else:
                        prob = get_prob(model, patching_request)
                        results[(layer_idx, head_idx)] = prob

    results_grid = []
    for layer_idx in range(len(components)):
        results_grid.append([])
        for head_idx in range(n_heads):
            results_grid[layer_idx].append(results[(layer_idx, head_idx)])

    return PatchResponse(
        results=results_grid,
        rowLabels=[layer for layer in range(len(components))],
        colLabels=[head for head in range(n_heads)],
    )


def patch_tokens(model: StandardizedTransformer, patching_request: PatchRequest):
    components = get_components(model, patching_request)
    is_tuple = patching_request.submodule == "blocks"

    destination_prompt = patching_request.destination
    destination_tokens = model.tokenizer.encode(destination_prompt)
    n_tokens = len(destination_tokens)

    source_cache = {}

    with model.wrapped_session():
        results = ns.dict().save()

        with model.trace(patching_request.source):
            for component in components:
                hidden_BLD = component.output

                if is_tuple:
                    hidden_BLD = hidden_BLD[0]

                for token_idx in range(n_tokens):
                    source_cache[(component, token_idx)] = hidden_BLD[
                        :, token_idx, :
                    ]

            if patching_request.incorrect_id is not None:
                source_diff = logit_difference(model, patching_request)

        with model.trace(patching_request.destination):
            destination_diff = logit_difference(model, patching_request)

        for layer_idx, component in enumerate(components):
            ns.log(f"Patching layer {layer_idx}")
            for token_idx in range(n_tokens):
                with model.trace(destination_prompt):
                    if is_tuple:
                        hidden_BLD_tuple = component.output
                        hidden_BLD = hidden_BLD_tuple[0]

                        hidden_BLD[:, token_idx, :] = source_cache[
                            (component, token_idx)
                        ]
                        component.output = (hidden_BLD, hidden_BLD_tuple[1])

                    else:
                        hidden_BLD = component.output

                        hidden_BLD[:, token_idx, :] = source_cache[
                            (component, token_idx)
                        ]
                        component.output = hidden_BLD

                    if patching_request.incorrect_id is not None:
                        patched_diff = logit_difference(model, patching_request)
                        ioi_metric = compute_ioi_metric(
                            source_diff, destination_diff, patched_diff
                        )
                        results[(layer_idx, token_idx)] = ioi_metric
                    else:
                        prob = get_prob(model, patching_request)
                        results[(layer_idx, token_idx)] = prob.item()

    results_grid = []
    for layer_idx in range(len(components)):
        results_grid.append([])
        for token_idx in range(n_tokens):
            results_grid[layer_idx].append(results[(layer_idx, token_idx)])

    destination_token_ids = [
        model.tokenizer.decode(token) for token in destination_tokens
    ]

    return PatchResponse(
        results=results_grid,
        rowLabels=[layer for layer in range(len(components))],
        colLabels=destination_token_ids,
    )


class PatchingIdxs(NamedTuple):
    source: List[int]
    destination: List[int]
    tok_map: dict[int, int]

def compute_patching_idxs(
    tok: AutoTokenizer,
    connections: List[Connection],
    source_prompt: str,
    destination_prompt: str,
) -> PatchingIdxs:
    source_tokens = tok.encode(source_prompt)
    destination_tokens = tok.encode(destination_prompt)

    start_idxs = chain(*[conn.start.token_indices for conn in connections])
    end_idxs = chain(*[conn.end.token_indices for conn in connections])

    source_idxs = range(len(source_tokens))
    dest_idxs = range(len(destination_tokens))

    source_valid = set(source_idxs) - set(start_idxs)
    dest_valid = set(dest_idxs) - set(end_idxs)

    assert len(source_valid) == len(dest_valid)

    source_valid = sorted(source_valid)
    dest_valid = sorted(dest_valid)

    return PatchingIdxs(
        source=list(source_valid),
        destination=list(dest_valid),
        tok_map={
            d: s
            for d, s in zip(dest_valid, source_valid)
        },
    )


def get_sync_x_labels(
    connections: List[Connection], destination_prompt: str, tok: AutoTokenizer
) -> List[str]:
    tokens = tok.encode(destination_prompt)

    idx_to_connection = {}
    for connection in connections:
        for idx in connection.end.token_indices:
            idx_to_connection[idx] = connection

    x_labels = []
    x_items = []
    seen = set()

    for i in range(len(tokens)):
        c = idx_to_connection.get(i, None)

        if c is not None and c not in seen:
            start_idx = c.end.token_indices[0]
            end_idx = c.end.token_indices[-1] + 1
            x_labels.append(tok.decode(tokens[start_idx:end_idx]))
            x_items.append(c.end.token_indices[-1])
            seen.add(c)

        elif c in seen:
            continue

        else:
            x_labels.append(tok.decode(tokens[i]))
            x_items.append(i)

    return x_labels, x_items


def patch_tokens_sync(model: StandardizedTransformer, patching_request: PatchRequest):
    components = get_components(model, patching_request)
    is_tuple = patching_request.submodule == "blocks"

    connections = [
        edit for edit in patching_request.edits if isinstance(edit, Connection)
    ]

    patching_idxs = compute_patching_idxs(
        model.tokenizer,
        connections,
        patching_request.source,
        patching_request.destination,
    )

    source_cache = {}

    with model.wrapped_session():
        results = ns.dict().save()

        with model.trace(patching_request.source):
            for component in components:
                hidden_BLD = component.output

                if is_tuple:
                    hidden_BLD = hidden_BLD[0]

                for connection in connections:
                    start_token_last_idx = connection.start.token_indices[-1]

                    source_cache[(component, connection)] = hidden_BLD[
                        :, start_token_last_idx, :
                    ]

                for token_idx in patching_idxs.source:
                    source_cache[(component, token_idx)] = hidden_BLD[
                        :, token_idx, :
                    ]

            if patching_request.incorrect_id is not None:
                source_diff = logit_difference(model, patching_request)

        with model.trace(patching_request.destination):
            destination_diff = logit_difference(model, patching_request)

        for layer_idx, component in enumerate(components):
            for token_idx in patching_idxs.destination:
                with model.trace(patching_request.destination):
                    if is_tuple:
                        hidden_BLD_tuple = component.output
                        hidden_BLD = hidden_BLD_tuple[0]
                    else:
                        hidden_BLD = component.output

                    hidden_BLD[:, token_idx, :] = source_cache[
                        (component, patching_idxs.tok_map[token_idx])
                    ]

                    if is_tuple:
                        component.output = (hidden_BLD, hidden_BLD_tuple[1])
                    else:
                        component.output = hidden_BLD

                    if patching_request.incorrect_id is not None:
                        patched_diff = logit_difference(model, patching_request)
                        ioi_metric = compute_ioi_metric(
                            source_diff, destination_diff, patched_diff
                        )
                        results[(layer_idx, token_idx)] = ioi_metric
                    else:
                        prob = get_prob(model, patching_request)
                        results[(layer_idx, token_idx)] = prob

            for connection in connections:
                with model.trace(patching_request.destination):
                    if is_tuple:
                        hidden_BLD_tuple = component.output
                        hidden_BLD = hidden_BLD_tuple[0]
                    else:
                        hidden_BLD = component.output

                    end_token_last_idx = connection.end.token_indices[-1]

                    hidden_BLD[:, end_token_last_idx, :] = source_cache[
                        (component, connection)
                    ]

                    if is_tuple:
                        component.output = (hidden_BLD, hidden_BLD_tuple[1])
                    else:
                        component.output = hidden_BLD

                    if patching_request.incorrect_id is not None:
                        patched_diff = logit_difference(model, patching_request)
                        ioi_metric = compute_ioi_metric(
                            source_diff, destination_diff, patched_diff
                        )
                        results[(layer_idx, end_token_last_idx)] = ioi_metric
                    else:
                        prob = get_prob(model, patching_request)
                        results[(layer_idx, end_token_last_idx)] = prob

    x_labels, x_items = get_sync_x_labels(
        connections, patching_request.destination, model.tokenizer
    )

    results_grid = []
    for layer_idx in range(len(components)):
        results_grid.append([])
        for x_item in x_items:
            results_grid[layer_idx].append(results[(layer_idx, x_item)])

    return PatchResponse(
        results=results_grid,
        rowLabels=[layer for layer in range(len(components))],
        colLabels=x_labels,
    )


router = APIRouter()


@router.post("/patch-grid")
async def patch(patching_request: PatchRequest, request: Request):
    state = request.app.state.m
    model = state.get_model(patching_request.model)

    if patching_request.patch_tokens:
        has_connections = any(
            isinstance(edit, Connection) for edit in patching_request.edits
        )

        if has_connections:
            return await asyncio.to_thread(patch_tokens_sync, model, patching_request)

        return await asyncio.to_thread(patch_tokens, model, patching_request)

    else:
        if patching_request.submodule == "heads":
            return await asyncio.to_thread(patch_heads, model, patching_request)

        return await asyncio.to_thread(patch_components, model, patching_request)
