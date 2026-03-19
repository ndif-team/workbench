from .lens import router as lens
from .patch import router as patch
from .models import router as models
from .logit_lens import router as logit_lens
from .activation_patching import router as activation_patching

from nnsight import ndif
import nnterp
import nnsightful
ndif.register(nnterp)
ndif.register(nnsightful)

__all__ = ["lens", "patch", "models", "logit_lens", "activation_patching"]