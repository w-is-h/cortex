import sqlite3

from fastapi import APIRouter, Depends, Query

from ..auth import User, require_user
from ..db import get_db
from ..models import (CommentCreate, CommentOut, ProjectCreate, ProjectDetail,
                      ProjectOut, ProjectUpdate)
from ..services import comments, projects, tasks

router = APIRouter(prefix="/api/projects")


@router.get("", response_model=list[ProjectOut])
def list_projects(space_id: int, include_archived: bool = False,
                  tags: list[str] | None = Query(default=None),
                  user: User = Depends(require_user),
                  db: sqlite3.Connection = Depends(get_db)):
    return projects.list_projects(db, space_id, include_archived, tags=tags)


@router.post("", response_model=ProjectOut)
def create_project(body: ProjectCreate, user: User = Depends(require_user),
                   db: sqlite3.Connection = Depends(get_db)):
    return projects.create(db, user, body.model_dump())


@router.get("/{project_id}", response_model=ProjectDetail)
def get_project(project_id: int, user: User = Depends(require_user),
                db: sqlite3.Connection = Depends(get_db)):
    return projects.detail(db, projects.get(db, project_id))


@router.patch("/{project_id}", response_model=ProjectOut)
def update_project(project_id: int, body: ProjectUpdate,
                   user: User = Depends(require_user),
                   db: sqlite3.Connection = Depends(get_db)):
    return projects.update(db, user, project_id, body.model_dump(exclude_unset=True))


@router.post("/{project_id}/comments", response_model=CommentOut)
def add_comment(project_id: int, body: CommentCreate,
                user: User = Depends(require_user),
                db: sqlite3.Connection = Depends(get_db)):
    return comments.create(db, user, "project", project_id, body.body)
