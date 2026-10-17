import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
# causalab checked out next to this project, or next to the repo holding it.
_CANDIDATES = [ROOT.parents[1] / "causalab", ROOT.parents[2] / "causalab"]
CAUSALAB = Path(os.environ.get("CAUSALAB_PATH") or next((p for p in _CANDIDATES if p.exists()), _CANDIDATES[0]))
for p in (ROOT / "src", CAUSALAB):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))
