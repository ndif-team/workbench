from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from nnsightful.tools.logit_lens import logit_lens

from ..auth import require_user_email
from ..sse import MEDIA_TYPE, stream_backend, stream_value
from ..state import AppState, get_state

router = APIRouter()


class LogitLensRequest(BaseModel):
    model: str
    prompt: str
    topk: int = 5
    include_entropy: bool = True


@router.post("/run")
async def run_logit_lens(
    req: LogitLensRequest,
    state: AppState = Depends(get_state),
    user_email: str = Depends(require_user_email),
):
    model = state[req.model]

    if not state.remote:
        data = logit_lens(
            model,
            req.prompt,
            remote=False,
            top_k=req.topk,
            include_entropy=req.include_entropy,
        )
        return StreamingResponse(stream_value(data), media_type=MEDIA_TYPE)

    backend = state.make_streaming_backend(model=model)
    logit_lens._run(model, req.prompt, remote=True, backend=backend)

    tokenizer = model.tokenizer
    input_tokens = [str(tokenizer.decode(t)) for t in tokenizer.encode(req.prompt)]

    def process(raw: dict):
        raw["tokenizer"] = tokenizer
        raw["model_name"] = req.model
        raw["input_tokens"] = input_tokens
        return logit_lens._format(
            raw,
            top_k=req.topk,
            include_entropy=req.include_entropy,
        )

    return StreamingResponse(stream_backend(backend, process), media_type=MEDIA_TYPE)
