"""The options nnsightful's tools declare for a model, on the workbench's side.

A tool's implementation for a kind of model can take options the tool takes
nowhere else: a looped model's logit lens takes a ``lens``, its activation
patching a ``patch``. nnsightful declares them (``Tool.options``), with the
labels and descriptions an interface shows. The workbench names none of them:
it sends each model's to the frontend with the model list, which draws a
control per option, and checks the ones a run's request picks.
"""

from typing import Any

from fastapi import HTTPException
from nnsightful import Tool, activation_patching, j_lens, logit_lens


class ToolOptions:
    """nnsightful's tool options, as the model list offers them and a run picks them.

    Attributes:
        TOOLS: The nnsightful tools, by the frontend's tool type.
    """

    TOOLS: dict[str, Tool] = {
        "logit-lens": logit_lens,
        "jlens": j_lens,
        "activation-patching": activation_patching,
    }

    @classmethod
    def offered(cls, model_class: type) -> dict[str, list[dict[str, Any]]]:
        """What each tool offers on a model of ``model_class``.

        Returns:
            Each tool's options (nnsightful's ``ToolOption``, as dicts) by the
            frontend's tool type. A tool that takes none is left out.
        """
        offered = {}
        for tool_type, tool in cls.TOOLS.items():
            options = tool.options(model_class)
            if options:
                offered[tool_type] = [option.model_dump() for option in options]
        return offered

    @staticmethod
    def picked(tool: Tool, model: Any, picked: dict[str, str]) -> dict[str, str]:
        """A request's options, checked against those ``tool`` takes on ``model``.

        Raises:
            HTTPException: 422 for a name the tool has no option of on this
                model, or a value its option does not take.
        """
        declared = {option.name: option for option in tool.options(model)}
        unknown = sorted(picked.keys() - declared.keys())
        if unknown:
            raise HTTPException(
                status_code=422,
                detail=f"This tool takes no option {unknown[0]!r} on this model.",
            )
        try:
            return {name: declared[name].check(value) for name, value in picked.items()}
        except ValueError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error
