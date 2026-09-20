from .lens import router as lens
from .patch import router as patch
from .models import router as models
from .logit_lens import router as logit_lens
from .j_lens import router as j_lens
from .activation_patching import router as activation_patching
from .causal_mediation import router as causal_mediation

from nnsight import ndif
import nnsightful
import nnterp

# Ship both libraries' source with each request, so the server can rebuild them
# without having them installed. NDIF's own requirements carry neither.
#
# nnsightful holds the tools the traced block calls. nnterp holds the class of
# the model the block is written against -- every tool talks to a
# StandardizedTransformer (`model.layers_output`, `model.project_on_vocab`), and
# the wrapper is part of the pickled request, so without this the server fails to
# read the payload at all: "ModuleNotFoundError: No module named 'nnterp'",
# surfaced to the user as a corrupt-payload error rather than a missing import.
ndif.register(nnsightful)
ndif.register(nnterp)

__all__ = [
    "lens",
    "patch",
    "models",
    "logit_lens",
    "j_lens",
    "activation_patching",
    "causal_mediation",
]