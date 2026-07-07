import sqlite3

from fastapi import APIRouter, Depends

from ..auth import User, require_user
from ..db import get_db
from ..models import (CommentCreate, CommentOut, Priority, Status, TaskCreate,
                      TaskDetail, TaskMove, TaskOut, TaskUpdate)
from ..services import activity, comments, tasks

router = APIRouter(prefix="/api/tasks")


@router.get("", response_model=list[TaskOut])
def list_tasks(space_id: int | None = None, sprint_id: int | None = None,
               backlog: bool = False, status: Status | None = None,
               assignee_id: int | None = None, project_id: int | None = None,
               user: User = Depends(require_user),
               db: sqlite3.Connection = Depends(get_db)):
    return tasks.list_tasks(db, space_id=space_id, sprint_id=sprint_id, backlog=backlog,
                            status=status, assignee_id=assignee_id, project_id=project_id)


@router.post("", response_model=TaskOut)
def create_task(body: TaskCreate, user: User = Depends(require_user),
                db: sqlite3.Connection = Depends(get_db)):
    return tasks.create(db, user, body.model_dump())


@router.post("/move", response_model=list[TaskOut])
def move_tasks(body: TaskMove, user: User = Depends(require_user),
               db: sqlite3.Connection = Depends(get_db)):
    return tasks.move_to_sprint(db, user, body.task_ids, body.sprint_id)


@router.get("/{task_id}", response_model=TaskDetail)
def get_task(task_id: int, user: User = Depends(require_user),
             db: sqlite3.Connection = Depends(get_db)):
    task = tasks.get(db, task_id)
    task["comments"] = comments.list_for(db, "task", task_id)
    task["activity"] = activity.list_for_task(db, task_id)
    task["blockers"] = tasks.blockers_of(db, task_id)
    task["blocking"] = tasks.blocking(db, task_id)
    return task


@router.patch("/{task_id}", response_model=TaskOut)
def update_task(task_id: int, body: TaskUpdate, user: User = Depends(require_user),
                db: sqlite3.Connection = Depends(get_db)):
    return tasks.update(db, user, task_id, body.model_dump(exclude_unset=True))


@router.delete("/{task_id}")
def delete_task(task_id: int, user: User = Depends(require_user),
                db: sqlite3.Connection = Depends(get_db)):
    tasks.delete(db, user, task_id)
    return {"ok": True}


@router.put("/{task_id}/blockers/{blocker_id}", response_model=TaskOut)
def add_blocker(task_id: int, blocker_id: int, user: User = Depends(require_user),
                db: sqlite3.Connection = Depends(get_db)):
    return tasks.add_blocker(db, user, task_id, blocker_id)


@router.delete("/{task_id}/blockers/{blocker_id}", response_model=TaskOut)
def remove_blocker(task_id: int, blocker_id: int, user: User = Depends(require_user),
                   db: sqlite3.Connection = Depends(get_db)):
    return tasks.remove_blocker(db, user, task_id, blocker_id)


@router.get("/{task_id}/comments", response_model=list[CommentOut])
def list_comments(task_id: int, user: User = Depends(require_user),
                  db: sqlite3.Connection = Depends(get_db)):
    tasks.get(db, task_id)
    return comments.list_for(db, "task", task_id)


@router.post("/{task_id}/comments", response_model=CommentOut)
def add_comment(task_id: int, body: CommentCreate, user: User = Depends(require_user),
                db: sqlite3.Connection = Depends(get_db)):
    return comments.create(db, user, "task", task_id, body.body)
