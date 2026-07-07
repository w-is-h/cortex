import sqlite3

from fastapi import APIRouter, Depends

from ..auth import User, require_user
from ..db import get_db
from ..models import StatusCreate, StatusOut, StatusUpdate
from ..services import statuses

router = APIRouter(prefix="/api/statuses")


@router.get("", response_model=list[StatusOut])
def list_statuses(space_id: int, kind: str | None = None,
                  user: User = Depends(require_user),
                  db: sqlite3.Connection = Depends(get_db)):
    return statuses.list_statuses(db, space_id, kind)


@router.post("", response_model=StatusOut)
def create_status(body: StatusCreate, user: User = Depends(require_user),
                  db: sqlite3.Connection = Depends(get_db)):
    return statuses.create(db, body.space_id, body.kind, body.label, body.color, body.is_done)


@router.patch("/{status_id}", response_model=StatusOut)
def update_status(status_id: int, body: StatusUpdate, user: User = Depends(require_user),
                  db: sqlite3.Connection = Depends(get_db)):
    return statuses.update(db, status_id, **body.model_dump(exclude_unset=True))


@router.delete("/{status_id}")
def delete_status(status_id: int, reassign_to: int | None = None,
                  user: User = Depends(require_user),
                  db: sqlite3.Connection = Depends(get_db)):
    statuses.remove(db, status_id, reassign_to)
    return {"ok": True}
