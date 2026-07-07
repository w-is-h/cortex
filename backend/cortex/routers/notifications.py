import sqlite3

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..auth import User, require_user
from ..db import get_db
from ..services import notifications

router = APIRouter(prefix="/api/notifications")


class MarkRead(BaseModel):
    ids: list[int] | None = None  # None = all


@router.get("")
def list_notifications(user: User = Depends(require_user),
                       db: sqlite3.Connection = Depends(get_db)):
    return notifications.list_for_user(db, user.id)


@router.post("/read")
def mark_read(body: MarkRead, user: User = Depends(require_user),
              db: sqlite3.Connection = Depends(get_db)):
    notifications.mark_read(db, user.id, body.ids)
    return {"ok": True}
