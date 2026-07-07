import sqlite3

from fastapi import APIRouter, Depends, Query

from ..auth import User, require_user
from ..db import get_db
from ..services import search as search_service

router = APIRouter(prefix="/api/search")


@router.get("")
def search(q: str, space_id: int | None = None,
           kinds: list[str] | None = Query(default=None),
           status: str | None = None, has_images: bool = False,
           user: User = Depends(require_user),
           db: sqlite3.Connection = Depends(get_db)):
    return search_service.search(db, q, space_id, kinds=kinds,
                                 status=status, has_images=has_images)
