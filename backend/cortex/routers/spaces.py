import sqlite3

from fastapi import APIRouter, Depends

from ..auth import User, require_user
from ..db import get_db
from ..models import SpaceCreate, SpaceOut, SpaceUpdate
from ..services import spaces

router = APIRouter(prefix="/api/spaces")


@router.get("", response_model=list[SpaceOut])
def list_spaces(user: User = Depends(require_user), db: sqlite3.Connection = Depends(get_db)):
    return spaces.list_spaces(db)


@router.post("", response_model=SpaceOut)
def create_space(body: SpaceCreate, user: User = Depends(require_user),
                 db: sqlite3.Connection = Depends(get_db)):
    return spaces.create(db, body.name)


@router.patch("/{space_id}", response_model=SpaceOut)
def update_space(space_id: int, body: SpaceUpdate, user: User = Depends(require_user),
                 db: sqlite3.Connection = Depends(get_db)):
    return spaces.update(db, space_id, **body.model_dump(exclude_unset=True))


@router.delete("/{space_id}")
def delete_space(space_id: int, user: User = Depends(require_user),
                 db: sqlite3.Connection = Depends(get_db)):
    spaces.delete(db, space_id)
    return {"ok": True}
