import sqlite3

from fastapi import APIRouter, Depends

from ..auth import User, require_user
from ..db import get_db
from ..models import SprintCreate, SprintOut, SprintUpdate
from ..services import sprints

router = APIRouter(prefix="/api/sprints")


@router.get("", response_model=list[SprintOut])
def list_sprints(space_id: int, user: User = Depends(require_user),
                 db: sqlite3.Connection = Depends(get_db)):
    return sprints.list_sprints(db, space_id)


@router.post("", response_model=SprintOut)
def create_sprint(body: SprintCreate, user: User = Depends(require_user),
                  db: sqlite3.Connection = Depends(get_db)):
    return sprints.create(db, body.space_id, body.name, body.start_date, body.end_date)


@router.patch("/{sprint_id}", response_model=SprintOut)
def update_sprint(sprint_id: int, body: SprintUpdate, user: User = Depends(require_user),
                  db: sqlite3.Connection = Depends(get_db)):
    return sprints.update(db, sprint_id, **body.model_dump(exclude_unset=True))


@router.delete("/{sprint_id}")
def delete_sprint(sprint_id: int, user: User = Depends(require_user),
                  db: sqlite3.Connection = Depends(get_db)):
    sprints.delete(db, sprint_id)
    return {"ok": True}
