"""Pydantic request/response schemas."""

from datetime import date
from typing import Literal

from pydantic import BaseModel

# statuses are now per-space & customizable, so a status is just its string key
Status = str
Priority = Literal["low", "medium", "high", "urgent"]


class UserOut(BaseModel):
    id: int
    username: str
    is_admin: bool
    is_active: bool
    created_at: str


class LoginIn(BaseModel):
    username: str


class UserCreate(BaseModel):
    username: str
    is_admin: bool = False


class UserUpdate(BaseModel):
    is_admin: bool | None = None
    is_active: bool | None = None


class ApiKeyOut(BaseModel):
    id: int
    name: str
    prefix: str
    created_at: str
    last_used_at: str | None


class ApiKeyCreated(ApiKeyOut):
    key: str


class ApiKeyCreate(BaseModel):
    name: str


class SpaceOut(BaseModel):
    id: int
    name: str
    created_at: str
    default_sprint_days: int = 14


class SpaceCreate(BaseModel):
    name: str


class SpaceUpdate(BaseModel):
    name: str | None = None
    default_sprint_days: int | None = None


class SprintOut(BaseModel):
    id: int
    space_id: int
    name: str
    start_date: date
    end_date: date
    created_at: str
    is_current: bool = False
    archived: bool = False


class SprintCreate(BaseModel):
    space_id: int
    name: str
    start_date: date
    end_date: date


class SprintUpdate(BaseModel):
    name: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    archived: bool | None = None


class StatusOut(BaseModel):
    id: int
    space_id: int
    kind: str
    key: str
    label: str
    color: str
    sort_order: int
    is_done: bool = False


class StatusCreate(BaseModel):
    space_id: int
    kind: str
    label: str
    color: str = "#8b949e"
    is_done: bool = False


class StatusUpdate(BaseModel):
    label: str | None = None
    color: str | None = None
    sort_order: int | None = None
    is_done: bool | None = None


class ProjectOut(BaseModel):
    id: int
    space_id: int
    title: str
    description: str
    due_date: date
    start_date: date | None
    owner_id: int | None = None
    status: str = "scoping"
    archived: bool
    created_at: str
    open_tasks: int = 0
    total_tasks: int = 0


class ProjectCreate(BaseModel):
    space_id: int
    title: str
    description: str = ""
    due_date: date
    start_date: date | None = None
    owner_id: int | None = None
    status: str | None = None


class ProjectUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    due_date: date | None = None
    start_date: date | None = None
    owner_id: int | None = None
    status: str | None = None
    archived: bool | None = None


class TaskOut(BaseModel):
    id: int
    ref: str | None = None
    space_id: int
    title: str
    description: str
    status: Status
    priority: Priority
    assignee_id: int | None
    sprint_id: int | None
    project_id: int | None
    sort_order: float
    created_by: int | None
    created_at: str
    updated_at: str
    blocked: bool = False


class TaskCreate(BaseModel):
    space_id: int
    title: str
    description: str = ""
    status: Status = "todo"
    priority: Priority = "medium"
    assignee_id: int | None = None
    sprint_id: int | None = None
    project_id: int | None = None


class TaskUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    status: Status | None = None
    priority: Priority | None = None
    assignee_id: int | None = None
    sprint_id: int | None = None
    project_id: int | None = None
    sort_order: float | None = None
    # routers pass model_dump(exclude_unset=True) so None means "clear", absent means "keep"


class TaskMove(BaseModel):
    task_ids: list[int]
    sprint_id: int | None = None


class ReactionAgg(BaseModel):
    emoji: str
    count: int
    user_ids: list[int]


class CommentOut(BaseModel):
    id: int
    parent_type: Literal["task", "project"]
    parent_id: int
    author_id: int
    author_username: str
    body: str
    created_at: str
    reactions: list[ReactionAgg] = []


class CommentCreate(BaseModel):
    body: str


class ActivityOut(BaseModel):
    id: int
    task_id: int
    actor_id: int
    actor_username: str
    type: str
    detail: dict
    created_at: str


class TaskDetail(TaskOut):
    comments: list[CommentOut] = []
    activity: list[ActivityOut] = []
    blockers: list[TaskOut] = []
    blocking: list[TaskOut] = []


class ProjectDetail(ProjectOut):
    comments: list[CommentOut] = []
    tasks: list[TaskOut] = []
