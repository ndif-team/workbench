from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..state import AppState, get_state
from ..auth import require_user_email
from ..data_models import NDIFResponse

router = APIRouter()


class GenerateRequest(BaseModel):
    model: str
    prompt: str
    num_tokens: int = 25  # max new tokens to sample
    temperature: float | None = None
    top_k: int | None = None
    top_p: float | None = None
    stop_strings: list[str] | None = None


class GenerateData(BaseModel):
    prompt: list[str]  # the input (prompt) tokens, detokenized
    completion: list[str]  # the generated tokens, detokenized


class GenerateResponse(NDIFResponse):
    data: GenerateData | None = None


def _sampling_kwargs(req: GenerateRequest) -> dict:
    """Build the sampling kwargs forwarded to ``model.generate(...)``.

    A temperature/top_p/top_k value turns sampling on; the individual keys are
    only included when set. ``do_sample`` is ALWAYS set explicitly: many
    instruct/chat models ship a ``generation_config.json`` with
    ``do_sample: true`` (e.g. Qwen3-8B has do_sample=true, temperature=0.6), so
    omitting the flag lets the model's own config silently re-enable sampling —
    a different completion every run even when the caller asked for greedy.
    Passing ``do_sample=False`` forces deterministic decoding regardless.
    """
    kwargs: dict = {}
    sample = False
    if req.temperature is not None:
        kwargs["temperature"] = req.temperature
        sample = True
    if req.top_p is not None:
        kwargs["top_p"] = req.top_p
        sample = True
    if req.top_k is not None:
        kwargs["top_k"] = req.top_k
        sample = True
    kwargs["do_sample"] = sample
    if req.stop_strings:
        kwargs["stop_strings"] = req.stop_strings
    return kwargs


def generate(model, req: GenerateRequest, state: AppState):
    """Sample a completion. Returns the NDIF job id (remote) or a
    ``(prompt_tokens, completion_tokens)`` pair of id tensors (local)."""
    with model.generate(
        req.prompt,
        max_new_tokens=req.num_tokens,
        remote=state.remote,
        backend=state.make_backend(model=model),
        **_sampling_kwargs(req),
    ) as tracer:
        prompt_tokens = model.inputs[1]['input_ids'].save()
        completion_tokens = tracer.result[:, prompt_tokens.shape[-1]:].save()

    if state.remote:
        return tracer.backend.job_id

    return prompt_tokens, completion_tokens


def get_remote_generation(job_id: str, state: AppState):
    backend = state.make_backend(job_id=job_id)
    results = backend()
    return results["prompt_tokens"], results["completion_tokens"]


def process_generation(prompt_tokens, completion_tokens, tokenizer) -> GenerateData:
    prompt = tokenizer.batch_decode(prompt_tokens[0])
    completion = tokenizer.batch_decode(completion_tokens[0])

    return GenerateData(prompt=prompt, completion=completion)


@router.post("/start", response_model=GenerateResponse)
async def start_generate(
    req: GenerateRequest,
    state: AppState = Depends(get_state),
    user_email: str = Depends(require_user_email),
):
    model = state[req.model]

    output = generate(model, req, state)

    if state.remote:
        return {"job_id": output}

    prompt_tokens, completion_tokens = output
    return {"data": process_generation(prompt_tokens, completion_tokens, model.tokenizer)}


@router.post("/results/{job_id}", response_model=GenerateResponse)
async def collect_generate(
    job_id: str,
    req: GenerateRequest,
    state: AppState = Depends(get_state),
    user_email: str = Depends(require_user_email),
):
    prompt_tokens, completion_tokens = get_remote_generation(job_id, state)

    return {"data": process_generation(prompt_tokens, completion_tokens, state[req.model].tokenizer)}
