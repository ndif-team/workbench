from typing import ClassVar, Literal

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from ..auth import require_user_email, user_has_model_access
from ..data_models import Message
from ..sse import ToolEventStream
from ..state import AppState, get_state

from nnsightful.tools.generate import generate

router = APIRouter()


class GenerateRequest(BaseModel):
    MAX_CONVERSATION_CHARS: ClassVar[int] = 200_000

    model: str
    # "chat" applies the model's chat template; "completion" continues the
    # messages' contents as one document (base models).
    mode: Literal["chat", "completion"] = "chat"
    messages: list[Message] = Field(min_length=1, max_length=500)
    max_new_tokens: int = Field(256, ge=1, le=2048)
    temperature: float = Field(0.7, ge=0, le=2)  # 0 decodes greedily


@router.post("/generate")
async def run_generate(
    req: GenerateRequest,
    state: AppState = Depends(get_state),
    user_email: str = Depends(require_user_email),
) -> StreamingResponse:
    """Stream one reply (or continuation) for a conversation.

    The reply arrives whole in the ``data`` event (nnsightful's
    ``GenerationData``); NDIF sends no tokens before its job completes, so
    the stream before it carries the job's status only.
    """
    limit = GenerateRequest.MAX_CONVERSATION_CHARS
    if sum(len(m.content) for m in req.messages) > limit:
        raise HTTPException(
            status_code=413,
            detail=f"The conversation is longer than {limit:,} characters.",
        )
    if state.remote and not user_has_model_access(user_email, req.model, state):
        raise HTTPException(status_code=403, detail=f"Sign in to use {req.model}.")
    try:
        model = state[req.model]
    except KeyError:
        raise HTTPException(status_code=404, detail=f"{req.model} isn't available.")
    if req.mode == "chat" and getattr(model.tokenizer, "chat_template", None) is None:
        raise HTTPException(
            status_code=400,
            detail=f"{req.model} has no chat template, so it can't take turns. Start a completion with it instead.",
        )

    messages = [m.model_dump() for m in req.messages]
    return ToolEventStream(
        generate,
        model,
        messages,
        remote=state.remote,
        mode=req.mode,
        max_new_tokens=req.max_new_tokens,
        temperature=req.temperature,
    ).response()
