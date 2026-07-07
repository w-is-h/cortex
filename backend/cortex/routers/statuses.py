"""Read-only status vocabulary. Statuses are fixed in code (cortex/statuses.py);
this endpoint exists so the UI has a single source of truth."""

from fastapi import APIRouter, Depends

from ..auth import User, require_user
from ..statuses import PROJECT_STATUSES, TASK_STATUSES

router = APIRouter(prefix="/api/statuses")


@router.get("")
def list_statuses(space_id: int | None = None, kind: str | None = None,
                  user: User = Depends(require_user)):
    out = []
    for k, defs in (("task", TASK_STATUSES), ("project", PROJECT_STATUSES)):
        if kind in (None, k):
            out += [{"id": len(out) + i, "space_id": space_id, "kind": k,
                     "sort_order": i, **s} for i, s in enumerate(defs)]
    return out
